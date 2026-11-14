import { normalise } from "@/lib/signals";
import type { CallGroup, CallListEntry, Founder, Signal } from "@/lib/types";

export const entryKey = (e: CallListEntry) => `${e.companyId}:${e.founder.name}`;
export const contactRole = (f: Founder) => /founder|founded/i.test(f.evidence ?? "") ? "Founder" : /ceo/i.test(f.evidence ?? "") ? "CEO" : "Portfolio contact";
export function contactLink(e: CallListEntry) {
  return e.founder.linkedinUrl ?? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${e.founder.name} ${e.companyName}`)}`;
}

export function reasonToCall(e: CallListEntry): string {
  const event = e.why.find((s) => s.kind === "news_event");
  const date = e.why.find((s) => s.kind === "last_round")?.date?.slice(0, 7);
  if (event) return `${event.text}. Ask what the investor did during that transition.`;
  if (e.group === "no_recent_round") return `No recorded round${date ? ` since ${date}` : " in 24+ months"}. Ask about financing choices and ongoing support.`;
  return `Recorded funding${date ? ` in ${date}` : " within 24 months"}. Ask about the fund’s role and support.`;
}

/** Diverse experiences, one person per company; ties favor a direct contact and sourced evidence. No fund score. */
export function shortlist(entries: CallListEntry[], limit = 3): CallListEntry[] {
  const articleCount = (e: CallListEntry) => new Set(e.why.flatMap((s) => s.sources).filter((s) => {
    try { return !/(^|\.)(tracxn|pitchbook|crunchbase|cbinsights|linkedin|dealroom)\./i.test(new URL(s.url).hostname); } catch { return false; }
  }).map((s) => s.url)).size;
  const score = (e: CallListEntry) => Math.min(articleCount(e), 2) * 5 + Number(!!e.founder.linkedinUrl) * 4 + Number(contactRole(e.founder) === "Founder") * 2 + Math.min(e.founder.sources.length, 2);
  const ranked = entries.filter((e) => e.founder.sources.length && e.why.some((s) => s.sources.length))
    .toSorted((a, b) => score(b) - score(a) || a.companyName.localeCompare(b.companyName) || a.founder.name.localeCompare(b.founder.name));
  const chosen: CallListEntry[] = [];
  const companies = new Set<string>();
  const people = new Set<string>();
  const add = (e?: CallListEntry) => {
    if (!e || chosen.length >= limit || companies.has(normalise(e.companyName)) || people.has(normalise(e.founder.name))) return;
    chosen.push(e); companies.add(normalise(e.companyName)); people.add(normalise(e.founder.name));
  };
  for (const group of ["news_event", "no_recent_round", "recent_round"] satisfies CallGroup[]) {
    add(ranked.find((e) => e.group === group && !companies.has(normalise(e.companyName)) && !people.has(normalise(e.founder.name))));
  }
  for (const e of ranked) add(e);
  return chosen;
}

/** Safe fallback also used to repair prepared questions that presume an unsupported board role. */
export function groundedQuestions(fund: string, facts: Signal[]): string[] {
  const event = facts.find((s) => s.kind === "news_event");
  const round = facts.find((s) => s.kind === "last_round");
  const context = event ? `The public record says “${event.text}”. What happened from your perspective, and what role, if any, did ${fund} play?`
    : round ? `The last round in our sources is ${round.date?.slice(0, 7) ?? round.text}. What financing decisions followed, and how was ${fund} involved?`
    : `What was your experience working with ${fund} after its investment?`;
  return [context, `Can you give a concrete example of what ${fund} did when you needed support, and what you wished it had done differently?`, `Would you choose ${fund} again? What should a founder clarify before signing?`];
}

export function callBrief(fund: string, entries: CallListEntry[]): string {
  return [`Reference calls · ${fund}`, "Public records suggest questions, not a verdict on the fund.", ...entries.map((e) => [
    `${e.founder.name} · ${contactRole(e.founder)} · ${e.companyName}`, reasonToCall(e),
    `${e.founder.linkedinUrl ? "LinkedIn" : "Search LinkedIn (profile not verified)"}: ${contactLink(e)}`,
    ...e.questions.map((q, i) => `${i + 1}. ${q}`), "Sources:",
    ...[...new Map([...e.why.flatMap((s) => s.sources), ...e.founder.sources].map((s) => [s.url, s])).values()].map((s) => `${s.name ?? "Source"}${s.date ? ` · ${s.date}` : ""}: ${s.url}`),
  ].join("\n"))].join("\n\n");
}
