// Fixed pipeline (D4, spec "Pipeline"): Cala walk → per-company Cala → signals → news → founders → questions.
import { abortable } from "@/lib/abort";
import { CalaGaveUp, type Cala, type CalaEntity, type CalaLink } from "@/lib/cala";
import type { Exa, ExaResult } from "@/lib/exa";
import type { Gemini } from "@/lib/gemini";
import { groundedQuestions } from "@/lib/call-brief";
import { companyDisplayName, EXCLUDED_COMPANIES } from "@/lib/data-quality";
import { NEWS_BLOCKLIST } from "@/lib/news-blocklist";
import { companyOverview } from "@/lib/overview";
import { analyseCompany, domain, normalise, toSources, wasAcquired } from "@/lib/signals";
import type { CallListEntry, Founder, FundMatch, PortfolioCompany, Report, Signal, Source, StreamEvent } from "@/lib/types";

export interface PipelineDeps {
  cala: Cala;
  exa: Pick<Exa, "searchPeople" | "searchNews">;
  gemini: Pick<Gemini, "questions" | "overview">;
  now: () => Date;
  budgetMs: number;
  /** Live runs enrich at most this many companies by priority (spec step 10). */
  maxCompanies?: number;
  signal?: AbortSignal;
}

export const BANNED = /\b(fail(ed|ure)?|dead|died)\b/i;
const NEWS_WORD = /shut ?down|acqui[rs]|layoff|bankrupt/i;
const NEWS_KIND: [RegExp, string][] = [
  [/shut ?down/i, "shutdown"],
  [/acqui[rs]/i, "acquisition"],
  [/layoff/i, "layoffs"],
  [/bankrupt/i, "bankruptcy"],
];
const COMPANY_PROJECTION = {
  properties: ["description", "operational_status", "founding_date"],
  relationships: {
    incoming: { FOUNDED: { limit: 10 }, IS_CEO_OF: { limit: 10 } },
    outgoing: { PARTICIPATES_IN_CORPORATE_EVENT: { limit: 20 } },
  },
};
const ym = (d?: string) => d?.slice(0, 7);

/** Tiny push/pull channel so concurrent work can feed one async iterator. */
function channel<T>() {
  const buf: T[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  let failure: unknown;
  const poke = () => (wake?.(), (wake = null));
  return {
    push: (x: T) => { if (!closed) { buf.push(x); poke(); } },
    close: (err?: unknown) => ((closed = true), (failure = err), poke()),
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (buf.length) yield buf.shift()!;
        if (closed) {
          if (failure) throw failure;
          return;
        }
        await new Promise<void>((r) => (wake = r));
      }
    },
  };
}

export function questionTemplates(fund: string) {
  return [
    `How did ${fund} behave when the company hit its hardest stretch?`,
    `What did ${fund}'s partners actually do for you after the investment?`,
    `Would you take money from ${fund} again, and why?`,
  ];
}

export function checkQuestions(qs: unknown, why: Signal[], fund: string, company = ""): string[] {
  const facts = new Set(why.map((s) => `${s.text} ${s.date ?? ""}`).join(" ").match(/\d+/g));
  // Digits inside a known name are not financial claims; standalone figures still need evidence.
  const figures = (q: string) => [fund, company].filter(Boolean)
    .reduce((text, name) => text.replaceAll(name.toLowerCase(), ""), q.toLowerCase()).match(/\d+/g) ?? [];
  const ok = (Array.isArray(qs) ? qs : [])
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .filter((q) => !(/board/i.test(q) && !/^did\b|\b(whether|if)\b/i.test(q))
      && !(/round\b.{0,60}\b(involving|led by|backed by|with participation from)\b/i.test(q) && !/^did\b|\b(whether|if)\b/i.test(q))
      && !BANNED.test(q) && figures(q).every((n) => facts.has(n)));
  for (const t of groundedQuestions(fund, why)) if (ok.length < 3 && !ok.includes(t)) ok.push(t);
  return ok.slice(0, 3);
}

export function questionPrompt(company: string, fund: string, why: Signal[]) {
  return [
    `You help a startup founder prepare a reference call about the venture fund ${fund}.`,
    `They will call a founder or executive of ${company}, a ${fund} portfolio company. Known facts:`,
    ...why.map((s) => `- ${s.text}`),
    `Write exactly 3 specific, neutral questions about how ${fund} behaved as an investor, grounded only in these facts.`,
    `Use this sequence: what happened from their perspective; a concrete example of investor support; whether they would choose the fund again. Never presume a board seat, follow-on commitment, or investor involvement. Ask whether before asking how.`,
    `A last recorded round does not establish that ${fund} joined that round. Do not describe any round as involving, led by, or backed by ${fund}; ask whether they participated instead.`,
    `No dates or numbers that are not in the facts. Never use the words failed, failure, dead or died.`,
    `Return a JSON array of 3 strings.`,
  ].join("\n");
}

export function newsSignals(results: ExaResult[], company: string, fundName: string): Signal[] {
  const n = normalise(company);
  const fundSlug = normalise(fundName).replace(/ /g, "");
  const byKind = new Map<string, Source[]>();
  for (const r of results) {
    const host = domain(r.url);
    if (host.replace(/[^a-z0-9]/g, "").includes(fundSlug) || r.url.includes(`medium.com/${fundSlug}`)) continue;
    if (/(^|\.)glassdoor\./.test(host) || NEWS_BLOCKLIST.has(r.url)) continue; // employee reviews aren't news
    // Title only: highlights of a page about something else name the company in passing (namesakes, "X acquires Y").
    const text = r.title ?? "";
    if (!` ${normalise(text)} `.includes(` ${n} `) || !NEWS_WORD.test(text)) continue;
    const kind = NEWS_KIND.find(([re]) => re.test(text))![1];
    if (kind === "acquisition" && !wasAcquired(normalise(text), n)) continue;
    byKind.set(kind, [...(byKind.get(kind) ?? []), { url: r.url, name: r.title, date: r.publishedDate?.slice(0, 10) }]);
  }
  // Namesakes slip through the keyword rule ("Klaus Brewing Co. to shut down"): keep only the best-supported kind(s).
  const top = Math.max(0, ...[...byKind.values()].map((x) => x.length));
  return [...byKind]
    .filter(([, sources]) => sources.length === top)
    .map(([kind, sources]) => ({
      kind: "news_event" as const,
      text: `Reported ${kind} (${[domain(sources[0].url), ym(sources[0].date)].filter(Boolean).join(", ")})`,
      date: sources[0].date,
      sources,
    }));
}

export function exaFounders(results: ExaResult[], company: string, fundName: string): Founder[] {
  const n = normalise(company);
  const fund = normalise(fundName);
  // "Zendesk QA (Klaus)" also counts as Klaus: acquired companies keep their old name in parentheses.
  const names = (c: string) => [normalise(c), ...[...c.matchAll(/\(([^)]+)\)/g)].map((m) => normalise(m[1]))];
  const out: Founder[] = [];
  for (const r of results) {
    const p = r.entities?.[0]?.properties;
    const wh = p?.workHistory ?? [];
    if (wh.some((w) => w.company?.name && normalise(w.company.name).includes(fund))) continue;
    const hit = wh.find((w) => w.company?.name && /founder|ceo/i.test(w.title ?? "") && names(w.company.name).includes(n));
    if (!hit) continue;
    out.push({
      name: p?.name ?? r.title ?? "",
      linkedinUrl: /linkedin\.com/.test(r.url) ? r.url : undefined,
      via: "exa+gemini",
      evidence: `${hit.title}, ${hit.company!.name}`,
      sources: [{ url: r.url, name: domain(r.url) }],
    });
  }
  return out;
}

function calaFounders(entity: CalaEntity): Founder[] {
  const out: Founder[] = [];
  for (const rel of ["FOUNDED", "IS_CEO_OF"]) {
    for (const l of entity.relationships?.incoming?.[rel] ?? []) {
      const sources = toSources(l.properties.sources);
      if (l.entity_type !== "Person" || !sources.length || out.some((f) => normalise(f.name) === normalise(l.name))) continue;
      out.push({ name: l.name, via: "cala", evidence: `Cala: ${rel}`, sources });
    }
  }
  return out;
}

const firstDate = (l: CalaLink) => toSources(l.properties.sources).map((s) => s.date).filter(Boolean).sort()[0];

export function createPipeline(deps: PipelineDeps) {
  const { now, budgetMs, maxCompanies } = deps;
  const signals = [deps.signal, Number.isFinite(budgetMs) ? AbortSignal.timeout(Math.max(1, budgetMs)) : undefined].filter((s): s is AbortSignal => !!s);
  const signal = AbortSignal.any(signals);
  const call = <T,>(work: () => Promise<T>) => abortable(work, signal);
  const cala: Cala = { searchEntities: (...args) => call(() => deps.cala.searchEntities(...args)), getEntity: (id, projection, opts) => call(() => deps.cala.getEntity(id, projection, { ...opts, signal })) };
  const exa = { searchPeople: (...args: Parameters<PipelineDeps["exa"]["searchPeople"]>) => call(() => deps.exa.searchPeople(...args)), searchNews: (...args: Parameters<PipelineDeps["exa"]["searchNews"]>) => call(() => deps.exa.searchNews(...args)) };
  const gemini = { questions: (prompt: string) => call(() => deps.gemini.questions(prompt)), overview: (prompt: string) => call(() => deps.gemini.overview(prompt)) };

  async function* run(fundId: string): AsyncIterable<StreamEvent> {
    const out = channel<StreamEvent>();
    const progress = (message: string) => out.push({ type: "progress", message });
    const onRetry = () => progress("waiting for data source…");

    const work = async () => {
      const start = now().getTime();
      progress("Reading the fund's portfolio…");
      const walk = await cala.getEntity(
        fundId,
        {
          properties: ["description"],
          relationships: {
            outgoing: { INVESTED_IN: { limit: 200 }, PARTICIPATES_IN_FUNDING_ROUND: { limit: 200 } },
          },
        },
        { onRetry },
      );
      const fund: FundMatch = {
        calaId: fundId,
        name: walk.name ?? fundId,
        description: walk.description ?? (walk.properties?.description?.value as string | undefined),
      };
      const invested = (walk.relationships?.outgoing?.INVESTED_IN ?? []).filter((l) => !EXCLUDED_COMPANIES.has(l.id));
      const fundRounds = walk.relationships?.outgoing?.PARTICIPATES_IN_FUNDING_ROUND ?? [];
      const companies: PortfolioCompany[] = invested.map((l) => ({
        calaId: l.id,
        name: companyDisplayName(l.name),
        rounds: [],
        signals: [],
        founders: [],
        sources: toSources(l.properties.sources),
        state: "pending",
      }));
      // D17: oldest first by the earliest source date on the INVESTED_IN link; undated last.
      const order = invested
        .map((l, i) => ({ i, d: firstDate(l) ?? "9999" }))
        .sort((a, b) => a.d.localeCompare(b.d) || a.i - b.i)
        .map((x) => x.i)
        .slice(0, maxCompanies ?? Infinity);
      // `planned` tells the client how far the progress bar can go when the run is capped (issue #32)
      out.push({ type: "portfolio", fund, companies: structuredClone(companies), planned: order.length });
      // one Cala graph call returns the whole portfolio with sourced links; say how much and how fast
      progress(`Cala: ${companies.length} portfolio companies and ${fundRounds.length} funding rounds, every link sourced, in ${((now().getTime() - start) / 1000).toFixed(1)} s`);

      const callList: CallListEntry[] = [];
      const listed = new Set<string>();
      const tails: Promise<void>[] = [];
      const portfolioTruncated = (walk.relationships?.outgoing?.INVESTED_IN?.length ?? 0) >= 200;
      let complete = order.length === invested.length && !portfolioTruncated;

      const finish = async (co: PortfolioCompany, entity: CalaEntity) => {
        let a = analyseCompany({ entity, fundRounds, fundName: fund.name }, now());
        if (a.group === "no_recent_round" || !a.lastRoundDate) {
          const since = new Date(now());
          since.setUTCFullYear(since.getUTCFullYear() - 3);
          const results = await exa
            .searchNews(`"${normalise(co.name)}" shut down OR acquired OR layoffs OR bankruptcy`, {
              startPublishedDate: since.toISOString(),
              excludeDomains: /\.[a-z]{2,}$/i.test(fund.name) ? [fund.name.toLowerCase()] : [],
            })
            .catch(() => []);
          const have = new Set(a.signals.filter((s) => s.kind === "news_event").map((s) => s.text.split(" (")[0]));
          const news = newsSignals(results, co.name, fund.name).filter((s) => !have.has(s.text.split(" (")[0]));
          if (news.length) a = analyseCompany({ entity, fundRounds, fundName: fund.name, news }, now());
        }
        signal.throwIfAborted();
        Object.assign(co, { rounds: a.rounds, lastRoundDate: a.lastRoundDate, signals: a.signals });

        if (a.group) {
          const founders = calaFounders(entity);
          if (founders.length < 2) {
            const results = await exa.searchPeople(`founder of ${normalise(co.name)} ${co.description ?? ""}`.trim()).catch(() => []);
            for (const f of exaFounders(results, co.name, fund.name))
              if (!founders.some((x) => normalise(x.name) === normalise(f.name))) founders.push(f);
          }
          co.founders = founders.slice(0, 2);
        }
        signal.throwIfAborted();
        co.state = "enriched";
        out.push({ type: "company", company: structuredClone(co) });

        // D29: runs beside the questions; the company is sent again once the overview exists. A Gemini failure leaves it out.
        const overview = companyOverview(co, gemini).then((o) => {
          if (!o || signal.aborted) return;
          co.overview = o;
          out.push({ type: "company", company: structuredClone(co) });
        });

        if (a.group && co.founders.length) {
          const raw = await gemini.questions(questionPrompt(co.name, fund.name, a.signals)).catch((e) => {
            console.warn(`Gemini failed for ${co.name}, using template questions: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
            return [];
          });
          signal.throwIfAborted();
          const questions = checkQuestions(raw, a.signals, fund.name, co.name);
          for (const founder of co.founders) {
            // Cala sometimes has two entities for one company (FLOWHAVEN OY / Flowhaven Oy, IQM / IQM Quantum Computers Oyj): one entry per person.
            const key = normalise(founder.name);
            if (listed.has(key)) continue;
            listed.add(key);
            const entry: CallListEntry = {
              companyId: co.calaId,
              companyName: co.name,
              founder,
              group: a.group,
              why: a.signals,
              questions,
              writing: [],
            };
            callList.push(entry);
            out.push({ type: "entry", entry });
          }
        }
        await overview;
      };

      // Cala's quota seems to reset about once a minute; a company it gave up on gets one more try at the end.
      const queue = [...order];
      const retried = new Set<number>();
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        if (signal.aborted || now().getTime() - start > budgetMs) {
          complete = false;
          progress("Stopped early; showing what was found");
          break;
        }
        const co = companies[i];
        let entity: CalaEntity;
        try {
          entity = await cala.getEntity(co.calaId, COMPANY_PROJECTION, { onRetry });
        } catch (e) {
          if (e instanceof CalaGaveUp && !retried.has(i)) {
            retried.add(i);
            queue.push(i);
            progress(`Data source busy; will retry ${co.name} later`);
            continue;
          }
          complete = false;
          co.state = "unavailable";
          out.push({ type: "company", company: structuredClone(co) });
          progress(e instanceof CalaGaveUp ? `Data source busy; skipped ${co.name}` : `Could not load ${co.name}`);
          continue;
        }
        co.description = entity.description ?? (entity.properties?.description?.value as string | undefined);
        tails.push(
          finish(co, entity).catch(() => {
            complete = false;
            co.state = "unavailable";
            out.push({ type: "company", company: structuredClone(co) });
            progress(`Could not finish ${co.name}`);
          }),
        );
      }
      await Promise.all(tails);
      for (const co of companies) if (co.state === "pending") co.state = "not_researched";

      const report: Report = { fund, portfolioTruncated, generatedAt: now().toISOString(), complete, portfolio: companies, callList };
      out.push({ type: "done", report });
    };

    work().then(
      () => out.close(),
      (e) => {
        out.push({ type: "error", message: e instanceof Error ? e.message : String(e) });
        out.close();
      },
    );
    try { yield* out; } finally { out.close(); }
  }

  return { run };
}
