import type { Report, StreamEvent } from "@/lib/types";

export function reportToEvents(report: Report): StreamEvent[] {
  return [
    { type: "progress", message: "Loading cached report…" },
    { type: "portfolio", fund: report.fund, companies: report.portfolio },
    ...report.callList.map((entry): StreamEvent => ({ type: "entry", entry })),
    { type: "done", report },
  ];
}

export function assertReport(x: unknown): asserts x is Report {
  const r = x as Report;
  if (!r?.fund?.calaId || !r.fund.name) throw new Error("report.fund needs calaId and name");
  if (!Array.isArray(r.portfolio)) throw new Error("report.portfolio must be an array");
  for (const c of r.portfolio) {
    if (!["pending", "enriched", "unavailable"].includes(c?.state))
      throw new Error(`company ${c?.name}: bad state ${c?.state}`);
    for (const round of c.rounds ?? []) {
      if (!("fundIsLead" in round) || (round.fundIsLead !== null && typeof round.fundIsLead !== "boolean"))
        throw new Error(`company ${c.name}, round ${round.calaId}: fundIsLead must be boolean or null`);
    }
  }
  if (!Array.isArray(r.callList)) throw new Error("report.callList must be an array");
  for (const e of r.callList) {
    if (e?.questions?.length !== 3) throw new Error(`entry ${e?.companyName}: needs exactly 3 questions`);
  }
}

export async function* paced(events: StreamEvent[], gapMs = 150) {
  for (const [i, e] of events.entries()) {
    if (i) await new Promise((r) => setTimeout(r, gapMs));
    yield e;
  }
}

export function ndjsonResponse(it: AsyncIterable<StreamEvent>): Response {
  const enc = new TextEncoder();
  const line = (e: StreamEvent) => enc.encode(JSON.stringify(e) + "\n");
  const iter = it[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        const { value, done } = await iter.next();
        if (done) ctrl.close();
        else ctrl.enqueue(line(value));
      } catch (err) {
        ctrl.enqueue(line({ type: "error", message: err instanceof Error ? err.message : String(err) }));
        ctrl.close();
      }
    },
    cancel: () => void iter.return?.(),
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
