// Pure facts → rounds, neutral signals and call group (spec pipeline steps 0, 3, 4; D6, D21).
import type { CalaEntity, CalaLink, CalaSource } from "@/lib/cala";
import type { CallGroup, Round, Signal, Source } from "@/lib/types";

const LEGAL_FORM = /\s+(oy|oyj|oü|ab|as|asa|aps|ltd|limited|gmbh|inc|llc|sa|bv|nv|plc)$/;
const ACQUISITION = /acqui|exit|merge/i;

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
    const acq = all.filter((s) => ACQUISITION.test(s.name ?? ""));
    for (const s of acq) if (!acquisition.some((a) => a.url === s.url)) acquisition.push(s);
    // Spec says an acquisition-sourced link is not a round; refined: keep it when it has its own event_date
    // or other sources (Klaus's 2019/2022 rounds carry a later "Klaus acquired" source).
    const sources = all.filter((s) => !acq.includes(s));
    if (!sources.length || (acq.length && !l.properties.event_date)) continue;
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

  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 24);
  const group: CallGroup | null = signals.some((s) => s.kind === "news_event")
    ? "news_event"
    : !lastRoundDate
      ? null
      : lastRoundDate < cutoff.toISOString().slice(0, 10)
        ? "no_recent_round"
        : "recent_round";

  return { rounds, lastRoundDate, signals, group };
}
