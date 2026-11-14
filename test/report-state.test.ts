import { describe, expect, it } from "vitest";
import { deriveReport } from "@/components/report-state";
import type { PortfolioCompany, Report, StreamEvent } from "@/lib/types";

const co = (id: string, state: PortfolioCompany["state"]): PortfolioCompany => ({ calaId: id, name: id, rounds: [], signals: [], founders: [], sources: [], state });
const fund = { calaId: "f", name: "Fund" };
const report = (portfolio: PortfolioCompany[], complete: boolean): Report => ({ fund, generatedAt: "2026-11-14T00:00:00Z", complete, portfolio, callList: [] });

describe("deriveReport: progress of a run", () => {
  const pending = ["a", "b", "c", "d"].map((id) => co(id, "pending"));

  it("a capped live run: planned comes from the portfolio event, checked counts companies no longer pending", () => {
    const events: StreamEvent[] = [
      { type: "portfolio", fund, companies: pending, planned: 2 },
      { type: "company", company: co("a", "enriched") },
      { type: "company", company: co("b", "unavailable") },
    ];
    expect(deriveReport(events.slice(0, 2))).toMatchObject({ planned: 2, checked: 1 });
    expect(deriveReport(events)).toMatchObject({ planned: 2, checked: 2 });
  });

  it("after done, checked stays at what the run reached, though the report marks the rest unavailable", () => {
    const s = deriveReport([
      { type: "portfolio", fund, companies: pending, planned: 2 },
      { type: "company", company: co("a", "enriched") },
      { type: "company", company: co("b", "enriched") },
      { type: "done", report: report([co("a", "enriched"), co("b", "enriched"), co("c", "unavailable"), co("d", "unavailable")], false) },
    ]);
    expect(s).toMatchObject({ checked: 2, complete: false });
    expect(s.companies).toHaveLength(4);
  });

  it("a replayed report: no planned, every company counts as checked", () => {
    const all = [co("a", "enriched"), co("b", "unavailable")];
    const s = deriveReport([{ type: "portfolio", fund, companies: all }, { type: "done", report: report(all, true) }]);
    expect(s.planned).toBeUndefined();
    expect(s.checked).toBe(2);
  });
});
