// Round enrichment (D28, issue #22): lead, amount, co-investors and the fund's partner, read from the round's
// announcement. Gemini only extracts; every fact needs a verbatim quote that code finds in the page, or it's dropped.
import { EXCLUDED_COMPANIES } from "@/lib/data-quality";
import type { Exa, ExaResult } from "@/lib/exa";
import type { Gemini } from "@/lib/gemini";
import { domain, normalise } from "@/lib/signals";
import type { Report, Round } from "@/lib/types";

export interface RoundDeps {
  exa: Pick<Exa, "pages" | "searchRound">;
  gemini: Pick<Gemini, "extract">;
}

// Company databases and profile pages: no per-round announcement text to quote.
const DATABASE = /^(tracxn|pitchbook|crunchbase|app\.dealroom|dealroom|cbinsights|linkedin|startupintros|ycombinator)\./;
const WINDOW_DAYS = 60;
// Cala entities linked as portfolio companies that aren't one company; their rounds mix several startups.

type Named = { name?: unknown; quote?: unknown };
interface Extraction {
  about?: unknown;
  leads?: Named[];
  amount?: { value?: unknown; quote?: unknown } | null;
  investors?: Named[];
  partner?: { name?: unknown; title?: unknown; quote?: unknown } | null;
}

const flat = (s: string) =>
  s.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
const shift = (date: string, days: number) => new Date(Date.parse(date) + days * 864e5).toISOString().slice(0, 10);

export function extractionPrompt(company: string, date: string, fund: string, text: string) {
  return [
    `Article:\n${text}\n`,
    `Does this article announce a funding round raised by ${company} (around ${date})? If not, return {"about": false}.`,
    `If it does, extract the lead investor(s), the amount, all other investors, and a quoted partner of ${fund} if any.`,
    `Every field needs a quote copied character for character from the article that contains the name or value.`,
    `Return JSON: {"about": true, "leads": [{"name", "quote"}], "amount": {"value", "quote"} | null, "investors": [{"name", "quote"}], "partner": {"name", "title", "quote"} | null}.`,
  ].join("\n");
}

export async function enrichRounds(report: Report, deps: RoundDeps) {
  const out = structuredClone(report);
  const fundAliases = [normalise(report.fund.name), normalise(report.fund.name).split(" ")[0]].filter((a) => a.length >= 4);
  const isFund = (name: string) => fundAliases.some((a) => ` ${normalise(name)} `.includes(` ${a} `));
  const stats = { rounds: 0, enriched: 0, failed: 0 };
  const memo = new Map<string, Promise<Extraction | null>>();

  const extract = (company: string, date: string, page: ExaResult) => {
    const key = `${company}|${page.url}`;
    if (!memo.has(key)) memo.set(key, deps.gemini.extract(extractionPrompt(company, date, report.fund.name, page.text!)) as Promise<Extraction>);
    return memo.get(key)!;
  };

  async function enrich(company: string, r: Round): Promise<Round> {
    const text = (page: ExaResult) => flat(page.text ?? "");
    const urls = r.sources.map((s) => s.url).filter((u) => !DATABASE.test(domain(u))).slice(0, 2);
    let pages = urls.length ? (await deps.exa.pages(urls)).filter((p) => p.text) : [];
    if (!pages.length) {
      const opts = { startPublishedDate: shift(r.date!, -WINDOW_DAYS), endPublishedDate: shift(r.date!, WINDOW_DAYS) };
      const n = ` ${normalise(company)} `;
      // As for news: the title must name the company ("Quantum Computing" otherwise matches Xanadu and Rigetti).
      pages = (await deps.exa.searchRound(`"${normalise(company)}" raises`, opts)).filter((p) => p.text && ` ${normalise(p.title ?? "")} `.includes(n));
    }
    for (const page of pages) {
      const x = await extract(company, r.date!, page);
      if (x?.about !== true) continue;
      const quoted = (q: unknown): q is string => typeof q === "string" && q.length > 0 && text(page).includes(flat(q));
      const named = (n: Named[] = []) =>
        n.flatMap((v) => (typeof v.name === "string" && quoted(v.quote) && flat(v.quote).includes(flat(v.name)) ? [{ name: v.name, quote: v.quote }] : []));
      const leads = named(x.leads);
      const investors = named(x.investors);
      const a = x.amount;
      const amount = a && typeof a.value === "string" && quoted(a.quote) && flat(a.quote).includes(flat(a.value)) ? { value: a.value, quote: a.quote } : undefined;
      const p = x.partner;
      const partner =
        p && typeof p.name === "string" && quoted(p.quote) && flat(p.quote).includes(flat(p.name)) && isFund(p.quote) ? { name: p.name, title: typeof p.title === "string" ? p.title : undefined, quote: p.quote } : undefined;
      const facts = [...leads, ...investors, ...(amount ? [amount] : []), ...(partner ? [partner] : [])];
      if (!facts.length) continue;

      const source = { url: page.url, name: page.title, date: page.publishedDate?.slice(0, 10) };
      const all = [...leads, ...investors];
      return {
        ...r,
        fundIsLead: leads.length ? leads.some((l) => isFund(l.name)) : r.fundIsLead,
        fundNamed: all.some((l) => isFund(l.name)),
        amount: amount?.value ?? r.amount,
        coInvestors: [...new Set(all.filter((l) => !isFund(l.name)).map((l) => l.name))],
        partner: partner && { ...partner, source },
        quotes: [...new Set(facts.map((f) => f.quote))].map((q) => ({ text: q, url: page.url })),
        sources: r.sources.some((s) => s.url === page.url) ? r.sources : [...r.sources, source],
      };
    }
    return r;
  }

  await Promise.all(
    out.portfolio.filter((c) => !EXCLUDED_COMPANIES.has(c.calaId)).flatMap((c) =>
      c.rounds.map(async (r, i) => {
        stats.rounds++;
        if (!r.date || r.quotes) return; // undated: no window to search; quotes: already enriched
        try {
          const next = await enrich(c.name, r);
          if (next === r) return;
          c.rounds[i] = next;
          stats.enriched++;
        } catch (e) {
          stats.failed++;
          console.warn(`Round enrichment failed for ${c.name} ${r.date}: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
        }
      }),
    ),
  );
  return { report: out, stats };
}
