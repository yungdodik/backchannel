import mock from "@/mock/icebreaker.json";
import { liveDeps } from "@/lib/live";
import { createPipeline } from "@/lib/pipeline";
import { assertReport, ndjsonResponse, paced, reportToEvents } from "@/lib/replay";
import type { StreamEvent } from "@/lib/types";

// Vercel with fluid compute: Hobby max 300 s, Pro 800 s (vercel.com/docs/functions/configuring-functions/duration, 2026-11-14).
// 300 works on both plans.
export const maxDuration = 300;
const BUDGET_MS = (maxDuration - 20) * 1000;
const LIVE_MAX_COMPANIES = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function* fail(message: string): AsyncIterable<StreamEvent> {
  yield { type: "error", message };
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get("mock") === "1") {
    assertReport(mock);
    return ndjsonResponse(paced(reportToEvents(mock)));
  }
  const fund = params.get("fund") ?? "";
  if (!UUID.test(fund)) return ndjsonResponse(fail("Unknown fund id"));
  try {
    const pipeline = createPipeline(liveDeps({ budgetMs: BUDGET_MS, maxCompanies: LIVE_MAX_COMPANIES }));
    return ndjsonResponse(pipeline.run(fund));
  } catch (e) {
    return ndjsonResponse(fail(e instanceof Error ? e.message : String(e)));
  }
}
