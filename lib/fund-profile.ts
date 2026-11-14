// Fund behaviour profile (issue #22): counts from a report's rounds, no verdicts (D6). Every count carries the
// ids behind it so the UI can link to the rounds. Absent from an announcement ≠ absent from the round: lower bounds.
import { groupFor, normalise } from "@/lib/signals";
import type { Report } from "@/lib/types";

export interface Count {
  n: number;
  of: number;
  ids: string[]; // the companies or rounds counted in n
}

export interface FundProfile {
  namedInLaterRound: Count; // companies where the fund is named in a round after an earlier one it was named in
  ledRounds: Count; // rounds with fundIsLead === true, of rounds whose lead is known
  topCoInvestors: { name: string; roundIds: string[] }[]; // from rounds the fund is named in, most rounds first
  noRoundIn24Months: Count; // companies, of companies with a dated round
  medianMonthsBetweenRounds?: number;
}

const months = (a: string, b: string) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
const count = (ids: string[], of: number): Count => ({ n: ids.length, of, ids });

export function profile(report: Report): FundProfile {
  const now = new Date(report.generatedAt);
  const rounds = report.portfolio.flatMap((c) => c.rounds);

  const later: string[] = [];
  let laterOf = 0;
  const gaps: number[] = [];
  for (const c of report.portfolio) {
    const dates = [...new Set(c.rounds.map((r) => r.date?.slice(0, 7)).filter((d): d is string => !!d))].sort();
    for (let i = 1; i < dates.length; i++) gaps.push(months(dates[i - 1], dates[i]));
    const named = [...new Set(c.rounds.filter((r) => r.fundNamed && r.date).map((r) => r.date!.slice(0, 7)))].sort();
    if (named.length && named[0] < dates.at(-1)!) laterOf++;
    if (named.length >= 2) later.push(c.calaId);
  }

  const co = new Map<string, { name: string; roundIds: string[] }>();
  for (const r of rounds.filter((r) => r.fundNamed))
    for (const name of r.coInvestors) {
      const k = normalise(name);
      if (!co.has(k)) co.set(k, { name, roundIds: [] });
      co.get(k)!.roundIds.push(r.calaId);
    }

  const dated = report.portfolio.filter((c) => c.lastRoundDate);
  gaps.sort((a, b) => a - b);
  const mid = gaps.length / 2;
  return {
    namedInLaterRound: count(later, laterOf),
    ledRounds: count(rounds.filter((r) => r.fundIsLead === true).map((r) => r.calaId), rounds.filter((r) => r.fundIsLead !== null).length),
    topCoInvestors: [...co.values()].sort((a, b) => b.roundIds.length - a.roundIds.length).slice(0, 10),
    noRoundIn24Months: count(dated.filter((c) => groupFor([], c.lastRoundDate, now) === "no_recent_round").map((c) => c.calaId), dated.length),
    medianMonthsBetweenRounds: gaps.length ? (gaps.length % 2 ? gaps[Math.floor(mid)] : (gaps[mid - 1] + gaps[mid]) / 2) : undefined,
  };
}
