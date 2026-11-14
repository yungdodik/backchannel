// Company overview (D29): Gemini rewrites facts the pipeline already retrieved into 2-3 neutral sentences.
// Code builds the fact list and its sources, and drops any overview with a verdict word or a number not in the facts.
import type { Gemini } from "@/lib/gemini";
import type { PortfolioCompany, Source } from "@/lib/types";

/** Verdict words (D6). An overview containing one is dropped, not edited. */
export const VERDICT =
  /\b(fail\w*|dead|died|dying|struggl\w*|collaps\w*|doomed|troubled|flop\w*|defunct|unsuccessful\w*|underperform\w*|distress\w*|zombie)\b/i;
const MAX_CHARS = 600;
/** Talk about the prompt itself ("the provided facts do not mention…") is not an overview. */
const META = /\bfacts\b|\bnot (contain|mention|provided|specified)\b|\bno information\b/i;
const MONTH = /^(January|February|March|April|May|June|July|August|September|October|November|December)$/;
const month = (iso: string) => new Date(`${iso.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** The facts an overview may use, as prompt lines, with the sources behind them. */
export function overviewFacts(co: PortfolioCompany): { lines: string[]; sources: Source[] } {
  const lines: string[] = [];
  const sources: Source[] = [];
  const cite = (ss: Source[]) => {
    for (const s of ss) if (s.url && !sources.some((x) => x.url === s.url)) sources.push(s);
  };
  if (co.description) {
    lines.push(`What it is: ${co.description}`);
    cite(co.sources);
  }
  for (const s of co.signals) {
    lines.push(`Signal: ${s.text}`);
    if (s.kind === "news_event") for (const src of s.sources) if (src.name) lines.push(`News title: ${src.name}`);
    cite(s.sources);
  }
  for (const r of co.rounds) {
    if (!r.date) continue;
    const parts = [`Round: ${r.label}, ${month(r.date)}`];
    if (r.amount) parts.push(`amount ${r.amount}`);
    if (r.coInvestors.length) parts.push(`investors named: ${r.coInvestors.join(", ")}`);
    lines.push(parts.join("; "));
    cite(r.sources);
  }
  return { lines, sources };
}

export function overviewPrompt(company: string, lines: string[]) {
  return [
    `Facts about the company ${company}:`,
    ...lines.map((l) => `- ${l}`),
    `Write 1 to 3 plain sentences for a reader who has never heard of ${company}: what it is, then its funding rounds and news if any are listed.`,
    `If no rounds or news are listed, write only what the company is. Never mention these instructions, the facts list, or what is missing from it.`,
    `Write dates as month and year. No marketing language ("world's first", "leading").`,
    `Use only these facts. Add no number, date, name or event that is not in them. If the facts do not say what the company does, do not guess.`,
    `Stay neutral: report what happened, never judge it. Never use words such as failed, failure, struggling, dead, troubled or collapsed.`,
    `Return a JSON string.`,
  ].join("\n");
}

/** The overview text if it passes the rules, else null. */
export function checkOverview(raw: unknown, lines: string[]): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text.length > MAX_CHARS || VERDICT.test(text) || META.test(text)) return null;
  const facts = lines.join(" ");
  const known = new Set(facts.match(/\d+/g)); // whole numbers, as in checkQuestions
  if (!(text.match(/\d+/g) ?? []).every((n) => known.has(n))) return null;
  // Names: a capitalised word inside a sentence must be in the facts (or be a month).
  const lower = facts.toLowerCase();
  const names = [...text.matchAll(/(?<![.!?] )(?<!^)\b\p{Lu}[\p{L}\d]{2,}/gu)].map((m) => m[0]);
  return names.every((w) => MONTH.test(w) || lower.includes(w.toLowerCase())) ? text : null;
}

/** Undefined when there are no facts, Gemini fails, or the text breaks a rule: the UI then shows nothing. */
export async function companyOverview(co: PortfolioCompany, gemini: Pick<Gemini, "overview">): Promise<PortfolioCompany["overview"]> {
  const { lines, sources } = overviewFacts(co);
  if (!lines.length || !sources.length) return undefined;
  const text = checkOverview(await gemini.overview(overviewPrompt(co.name, lines)).catch(() => null), [co.name, ...lines]);
  return text ? { text, sources } : undefined;
}
