import { describe, expect, it } from "vitest";
import { profile } from "@/lib/fund-profile";
import type { PortfolioCompany, Report, Round } from "@/lib/types";

const round = (calaId: string, date: string | undefined, over: Partial<Round> = {}): Round => ({
  calaId, label: "Funding round", date, fundIsLead: null, coInvestors: [], sources: [{ url: `https://x.com/${calaId}` }], ...over,
});
const company = (calaId: string, rounds: Round[]): PortfolioCompany => ({
  calaId, name: calaId, rounds, lastRoundDate: rounds.map((r) => r.date).filter(Boolean).sort().at(-1),
  signals: [], founders: [], sources: [], state: "enriched",
});
const report = (portfolio: PortfolioCompany[]): Report => ({
  fund: { calaId: "f", name: "Creandum" } as Report["fund"], generatedAt: "2026-11-14T12:00:00Z", complete: true, portfolio, callList: [],
});

describe("profile", () => {
  const r = report([
    // named in 2018 and again in 2021: counts for namedInLaterRound
    company("a", [
      round("a3", "2023-05-01"),
      round("a2", "2021-03-01", { fundNamed: true, fundIsLead: false, coInvestors: ["Atomico", "Supercell"] }),
      round("a1", "2018-01-01", { fundNamed: true, fundIsLead: true, coInvestors: ["Supercell"] }),
    ]),
    // named once, a later round exists without the fund named: in "of", not in "n"
    company("b", [round("b2", "2025-01-01", { fundIsLead: false, coInvestors: ["Atomico"] }), round("b1", "2022-01-01", { fundNamed: true, fundIsLead: true, coInvestors: ["Supercell"] })]),
    // named only in its latest round: no later round to be named in, not counted
    company("c", [round("c1", "2026-01-01", { fundNamed: true })]),
    // Cala lists one round twice on the same date: one gap, not two
    company("d", [round("d3", "2020-07-01"), round("d2", "2020-07-01"), round("d1", "2019-07-01")]),
    company("e", []),
  ]);
  const p = profile(r);

  it("namedInLaterRound: companies where the fund is named again after an earlier named round", () => {
    expect(p.namedInLaterRound).toEqual({ n: 1, of: 2, ids: ["a"] });
  });

  it("ledRounds: rounds the fund led, of rounds whose lead is known", () => {
    expect(p.ledRounds).toEqual({ n: 2, of: 4, ids: ["a1", "b1"] });
  });

  it("topCoInvestors: only from rounds the fund is named in, most rounds first", () => {
    expect(p.topCoInvestors).toEqual([
      { name: "Supercell", roundIds: ["a2", "a1", "b1"] },
      { name: "Atomico", roundIds: ["a2"] },
    ]);
  });

  it("noRoundIn24Months: companies whose last round is older than 24 months, of companies with a dated round", () => {
    expect(p.noRoundIn24Months).toEqual({ n: 2, of: 4, ids: ["a", "d"] });
  });

  it("medianMonthsBetweenRounds over distinct round dates", () => {
    // gaps (months): a 38, 26; b 36; d 12 → median 31
    expect(p.medianMonthsBetweenRounds).toBe(31);
    expect(profile(report([])).medianMonthsBetweenRounds).toBeUndefined();
  });
});
