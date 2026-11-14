// Pure facts → rounds, neutral signals and call group (spec pipeline steps 0, 3, 4; D6, D21).
import type { CalaEntity, CalaLink, CalaSource } from "@/lib/cala";
import type { CallGroup, Round, Signal, Source } from "@/lib/types";

const LEGAL_FORM = /\s+(oy|oyj|oü|ab|as|asa|aps|ltd|limited|gmbh|inc|llc|sa|bv|nv|plc)$/;
const ACQUISITION = /acqui|exit|merge/i;

/** "Zendesk acquires Klaus" / "Klaus acquired by Zendesk", not "Klaus acquires Promoty". Both args normalised (no regex specials). */
export function wasAcquired(t: string, n: string) {
  return [
    `\\bacqui(re|res|red|ring|sition)( of)? ${n}\\b`,
    `\\b${n} (\\S+ ){0,10}acquired by\\b`,
    `\\b${n} (is|was|has been|had been|gets|got) acquired\\b`,
  ].some((re) => new RegExp(re).test(t));
}

export function normalise(name: string): string {
  let s = name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  while (LEGAL_FORM.test(s)) s = s.replace(LEGAL_FORM, "");
  return s;
}

export const domain = (url: string) => new URL(url).hostname.replace(/^www\./, "");
const ym = (date?: string) => date?.slice(0, 7);

export function toSources(xs: CalaSource[] = []): Source[] {
  return xs.filter((s) => s.document).map((s) => ({ url: s.document!, name: s.name, date: s.date }));
}

const earliest = (sources: Source[]) =>
  sources.map((s) => s.date).filter(Boolean).sort()[0];

export function analyseCompany(
  { entity, fundRounds, fundName, news = [] }: { entity: CalaEntity; fundRounds: CalaLink[]; fundName: string; news?: Signal[] },
  now: Date,
): { rounds: Round[]; lastRoundDate?: string; signals: Signal[]; group: CallGroup | null } {
  const rounds: Round[] = [];
  const acquisition: Source[] = [];

  for (const l of entity.relationships?.outgoing?.PARTICIPATES_IN_CORPORATE_EVENT ?? []) {
    if (l.entity_type !== "PrivateCompanyFundingRound") continue;
    const all = toSources(l.properties.sources);
    const named = all.filter((s) => ACQUISITION.test(s.name ?? ""));
    // "Kahoot acquires DragonBox" is about the deal, not a round of Kahoot, and not Kahoot being acquired either.
    const acq = named.filter((s) => !/acqui/i.test(s.name!) || !entity.name || wasAcquired(normalise(s.name!), normalise(entity.name)));
    for (const s of acq) if (!acquisition.some((a) => a.url === s.url)) acquisition.push(s);
    // Spec says an acquisition-sourced link is not a round; refined: keep it when it has its own event_date
    // or other sources (Klaus's 2019/2022 rounds carry a later "Klaus acquired" source).
    const sources = all.filter((s) => !named.includes(s));
    if (!sources.length || (named.length && !l.properties.event_date)) continue;
    const ev = l.properties.event_date;
    const date = ev && !ev.endsWith("-01-01") ? ev : earliest(sources);
    const docs = new Set(sources.map((s) => s.url));
    const fr = fundRounds.find((f) => toSources(f.properties.sources).some((s) => docs.has(s.url)));
    rounds.push({
      calaId: l.id,
      label: "Funding round",
      date,
      fundIsLead: fr ? (fr.properties.is_lead ?? null) : null,
      coInvestors: [],
      sources,
    });
  }
  rounds.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));


  const signals: Signal[] = [];
  const last = rounds.find((r) => r.date);
  const lastRoundDate = last?.date;
  if (last) signals.push({ kind: "last_round", text: `Last recorded round: ${ym(last.date)}`, date: last.date, sources: last.sources });
  for (const r of rounds.filter((r) => r.fundIsLead)) {
    const when = r.date ? ` (${ym(r.date)})` : "";
    signals.push({ kind: "fund_led", text: `${fundName} led a round${when}`, date: r.date, sources: r.sources });
  }
  const status = entity.properties?.operational_status;
  const statusSources = toSources(status?.sources);
  if (status?.value && statusSources.length)
    signals.push({ kind: "status", text: `Cala status: ${status.value}`, sources: statusSources });
  if (acquisition.length) {
    const first = acquisition[0];
    signals.push({
      kind: "news_event",
      text: `Reported acquisition (${[domain(first.url), ym(first.date)].filter(Boolean).join(", ")})`,
      date: first.date,
      sources: acquisition,
    });
  }
  signals.push(...news);

  return { rounds, lastRoundDate, signals, group: groupFor(signals, lastRoundDate, now) };
}

export function groupFor(signals: Signal[], lastRoundDate: string | undefined, now: Date): CallGroup | null {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 24);
  if (signals.some((s) => s.kind === "news_event")) return "news_event";
  if (!lastRoundDate) return null;
  return lastRoundDate < cutoff.toISOString().slice(0, 10) ? "no_recent_round" : "recent_round";
}
