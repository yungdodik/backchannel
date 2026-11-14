// Fixed pipeline (D4, spec "Pipeline"): Cala walk → per-company Cala → signals → news → founders → questions.
import { CalaGaveUp, type Cala, type CalaEntity, type CalaLink } from "@/lib/cala";
import type { Exa, ExaResult } from "@/lib/exa";
import type { Gemini } from "@/lib/gemini";
import { analyseCompany, domain, normalise, toSources } from "@/lib/signals";
import type { CallListEntry, Founder, FundMatch, PortfolioCompany, Report, Signal, Source, StreamEvent } from "@/lib/types";

export interface PipelineDeps {
  cala: Cala;
  exa: Exa;
  gemini: Gemini;
  now: () => Date;
  budgetMs: number;
  /** Live runs enrich at most this many companies by priority (spec step 10). */
  maxCompanies?: number;
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
    push: (x: T) => (buf.push(x), poke()),
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

export function checkQuestions(qs: unknown, why: Signal[], fund: string): string[] {
  const facts = why.map((s) => `${s.text} ${s.date ?? ""}`).join(" ");
  const ok = (Array.isArray(qs) ? qs : [])
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .filter((q) => !BANNED.test(q) && (q.match(/\d+/g) ?? []).every((n) => facts.includes(n)));
  for (const t of questionTemplates(fund)) if (ok.length < 3 && !ok.includes(t)) ok.push(t);
  return ok.slice(0, 3);
}

function questionPrompt(company: string, fund: string, why: Signal[]) {
  return [
    `You help a startup founder prepare a reference call about the venture fund ${fund}.`,
    `They will call a founder of ${company}, a ${fund} portfolio company. Known facts:`,
    ...why.map((s) => `- ${s.text}`),
    `Write exactly 3 specific, neutral questions about how ${fund} behaved as an investor, grounded only in these facts.`,
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
    const text = `${r.title ?? ""} ${(r.highlights ?? []).join(" ")}`;
    if (!` ${normalise(text)} `.includes(` ${n} `) || !NEWS_WORD.test(text)) continue;
    const kind = NEWS_KIND.find(([re]) => re.test(text))![1];
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
      if (l.entity_type !== "Person" || !sources.length) continue;
      out.push({ name: l.name, via: "cala", evidence: `Cala: ${rel}`, sources });
    }
  }
  return out;
}

const firstDate = (l: CalaLink) => toSources(l.properties.sources).map((s) => s.date).filter(Boolean).sort()[0];

export function createPipeline(deps: PipelineDeps) {
  const { cala, exa, gemini, now, budgetMs, maxCompanies } = deps;

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
      const invested = walk.relationships?.outgoing?.INVESTED_IN ?? [];
      const fundRounds = walk.relationships?.outgoing?.PARTICIPATES_IN_FUNDING_ROUND ?? [];
      const companies: PortfolioCompany[] = invested.map((l) => ({
        calaId: l.id,
        name: l.name,
        rounds: [],
        signals: [],
        founders: [],
        sources: toSources(l.properties.sources),
        state: "pending",
      }));
      out.push({ type: "portfolio", fund, companies: structuredClone(companies) });

      // D17: oldest first by the earliest source date on the INVESTED_IN link; undated last.
      const order = invested
        .map((l, i) => ({ i, d: firstDate(l) ?? "9999" }))
        .sort((a, b) => a.d.localeCompare(b.d) || a.i - b.i)
        .map((x) => x.i)
        .slice(0, maxCompanies ?? Infinity);

      const callList: CallListEntry[] = [];
      const tails: Promise<void>[] = [];
      let complete = order.length === invested.length;

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
        co.state = "enriched";
        out.push({ type: "company", company: structuredClone(co) });

        if (a.group && co.founders.length) {
          const raw = await gemini.questions(questionPrompt(co.name, fund.name, a.signals)).catch(() => []);
          const questions = checkQuestions(raw, a.signals, fund.name);
          for (const founder of co.founders) {
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
      };

      for (const i of order) {
        if (now().getTime() - start > budgetMs) {
          complete = false;
          progress("Stopped early; showing what was found");
          break;
        }
        const co = companies[i];
        let entity: CalaEntity;
        try {
          entity = await cala.getEntity(co.calaId, COMPANY_PROJECTION, { onRetry });
        } catch (e) {
          co.state = "unavailable";
          out.push({ type: "company", company: structuredClone(co) });
          progress(e instanceof CalaGaveUp ? `Data source busy; skipped ${co.name}` : `Could not load ${co.name}`);
          continue;
        }
        co.description = entity.description ?? (entity.properties?.description?.value as string | undefined);
        tails.push(
          finish(co, entity).catch(() => {
            co.state = "unavailable";
            progress(`Could not finish ${co.name}`);
          }),
        );
      }
      await Promise.all(tails);
      for (const co of companies) if (co.state === "pending") co.state = "unavailable";

      const report: Report = { fund, generatedAt: now().toISOString(), complete, portfolio: companies, callList };
      out.push({ type: "done", report });
    };

    work().then(
      () => out.close(),
      (e) => {
        out.push({ type: "error", message: e instanceof Error ? e.message : String(e) });
        out.close();
      },
    );
    yield* out;
  }

  return { run };
}
