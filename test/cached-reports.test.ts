import { describe, expect, it } from "vitest";
import { cachedReports } from "@/lib/cached-reports";
import { assertReport } from "@/lib/replay";
import type { Founder, Signal } from "@/lib/types";

const VERDICT = /\b(fail(ed|ure)?|dead|died)\b/i;

describe("cachedReports", () => {
  it("every cached report is valid, sourced and verdict-free", async () => {
    for (const [id, load] of Object.entries(cachedReports)) {
      const r = (await load()).default;
      assertReport(r);
      expect(r.fund.calaId, id).toBe(id);
      const signals: Signal[] = [...r.portfolio.flatMap((c) => c.signals), ...r.callList.flatMap((e) => e.why)];
      const founders: Founder[] = [...r.portfolio.flatMap((c) => c.founders), ...r.callList.map((e) => e.founder)];
      for (const x of [...signals, ...founders]) {
        expect(x.sources.length, id).toBeGreaterThan(0);
        for (const s of x.sources) expect(s.url, id).not.toBe("");
      }
      for (const s of signals) expect(s.text, id).not.toMatch(VERDICT);
      for (const q of r.callList.flatMap((e) => e.questions)) expect(q, id).not.toMatch(VERDICT);
    }
  });
});
