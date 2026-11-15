import { describe, expect, it } from "vitest";
import { EXCLUDED_COMPANIES } from "@/lib/data-quality";
import { shortlist } from "@/lib/call-brief";
import { cachedReports } from "@/lib/cached-reports";
import { NEWS_BLOCKLIST } from "@/lib/news-blocklist";
import { assertReport } from "@/lib/replay";
import type { Founder, Signal } from "@/lib/types";

const VERDICT = /\b(fail(ed|ure)?|dead|died)\b/i;

describe("cachedReports", () => {
  it.each(Object.entries(cachedReports))("%s is valid, sourced and verdict-free", async (id, load) => {
      const r = (await load()).default;
      assertReport(r);
      expect(r.fund.calaId, id).toBe(id);
      expect(r.portfolio.some((c) => EXCLUDED_COMPANIES.has(c.calaId)), id).toBe(false);
      expect(r.callList.some((e) => EXCLUDED_COMPANIES.has(e.companyId)), id).toBe(false);
      for (const entry of shortlist(r.callList)) {
        expect(r.portfolio.some((c) => c.calaId === entry.companyId), entry.companyName).toBe(true);
        expect(entry.why.every((s) => s.sources.length > 0), entry.companyName).toBe(true);
      }
      const signals: Signal[] = [...r.portfolio.flatMap((c) => c.signals), ...r.callList.flatMap((e) => e.why)];
      const founders: Founder[] = [...r.portfolio.flatMap((c) => c.founders), ...r.callList.map((e) => e.founder)];
      for (const x of [...signals, ...founders]) {
        expect(x.sources.length, id).toBeGreaterThan(0);
        for (const s of x.sources) expect(s.url, id).not.toBe("");
      }
      for (const s of signals) expect(s.text, id).not.toMatch(VERDICT);
      for (const s of signals) for (const x of s.sources) expect(NEWS_BLOCKLIST.has(x.url), `${id} ${x.url}`).toBe(false);
      for (const q of r.callList.flatMap((e) => e.questions)) expect(q, id).not.toMatch(VERDICT);
  });
});
