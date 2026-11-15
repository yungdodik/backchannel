import { createReportRuns } from "@/lib/report-runs";
import mock from "@/mock/icebreaker.json";
import { cachedReports } from "@/lib/cached-reports";
import { liveDeps } from "@/lib/live";
import { createPipeline } from "@/lib/pipeline";
import { after } from "next/server";
import { persisting, refreshIfStale, savedStore } from "@/lib/saved-reports";
import { assertReport, ndjsonResponse, paced, reportToEvents } from "@/lib/replay";
import type { StreamEvent } from "@/lib/types";

// Vercel with fluid compute: Hobby max 300 s, Pro 800 s (vercel.com/docs/functions/configuring-functions/duration, 2026-11-14).
// 300 works on both plans.
export const maxDuration = 300;
const sharedRun = createReportRuns();
// Demo overrides (env): LIVE_MAX_COMPANIES = a number or "all" (default 25);
// LIVE_BUDGET_S = seconds or "none" (default maxDuration − 20). On Vercel the platform still
// kills the function at maxDuration, so the budget there never exceeds it.
const limit = (v: string | undefined, fallback: number) =>
  v === "all" || v === "none" ? Infinity : Number(v) > 0 ? Number(v) : fallback;
const BUDGET_S = limit(process.env.LIVE_BUDGET_S, maxDuration - 20);
const BUDGET_MS = (process.env.VERCEL ? Math.min(BUDGET_S, maxDuration - 20) : BUDGET_S) * 1000;
const LIVE_MAX_COMPANIES = limit(process.env.LIVE_MAX_COMPANIES, 25);
// A background refresh starts after the replay has been sent, inside the same function time limit.
const REFRESH_BUDGET_MS = process.env.VERCEL ? BUDGET_MS - 15_000 : BUDGET_MS;
const live = (fund: string, budgetMs: number, signal?: AbortSignal) =>
  createPipeline(liveDeps({ budgetMs, maxCompanies: LIVE_MAX_COMPANIES, signal })).run(fund);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function* fail(message: string): AsyncIterable<StreamEvent> {
  yield { type: "error", message };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get("mock") === "1") {
    assertReport(mock);
    return ndjsonResponse(paced(reportToEvents(mock)));
  }
  const fund = params.get("fund") ?? "";
  if (!UUID.test(fund)) return ndjsonResponse(fail("Unknown fund id"));
  try {
    const cached = cachedReports[fund];
    if (cached && params.get("fresh") !== "1") {
      const report = (await cached()).default;
      assertReport(report);
      return ndjsonResponse(paced(reportToEvents({ ...report, prepared: true })));
    }
    const store = savedStore();
    const fresh = params.get("fresh") === "1";
    // every open of a non-prepared fund counts towards its place in the sky
    after(() => store.hit(fund).catch((e) => console.error("counting open failed", e)));
    // A fund someone already researched live: replay the saved report; if it is old, refresh it in the background.
    if (!fresh) {
      const saved = await store.get(fund).catch((e) => { console.error("reading saved report failed", e); return null; });
      if (saved) {
        assertReport(saved);
        after(() => refreshIfStale(fund, store, () => live(fund, REFRESH_BUDGET_MS)).catch((e) => console.error("background refresh failed", e)));
        return ndjsonResponse(paced(reportToEvents({ ...saved, prepared: false })));
      }
    }
    const reader = new AbortController();
    const readerSignal = AbortSignal.any([request.signal, reader.signal]);
    return ndjsonResponse(sharedRun(fund, (signal) => persisting(live(fund, BUDGET_MS, signal), store), fresh || params.get("retry") === "1", readerSignal), () => reader.abort());
  } catch (e) {
    return ndjsonResponse(fail(e instanceof Error ? e.message : String(e)));
  }
}
