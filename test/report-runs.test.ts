import { afterEach, describe, expect, it, vi } from "vitest";
import { createReportRuns } from "@/lib/report-runs";
import type { StreamEvent } from "@/lib/types";
const event: StreamEvent = { type: "progress", message: "Working" };
const done: StreamEvent = { type: "done", report: { fund: { calaId: "f", name: "Fund" }, generatedAt: "2026-11-14", complete: true, portfolio: [], callList: [] } };
const collect = async (it: AsyncIterable<StreamEvent>) => { const out = []; for await (const e of it) out.push(e); return out; };
afterEach(() => vi.useRealTimers());
describe("shared research", () => {
  it("shares one live run across readers and reuses its finished report", async () => {
    const subscribe = createReportRuns();
    const start = vi.fn(async function* () { yield event; await Promise.resolve(); yield done; });
    const [a, b] = await Promise.all([collect(subscribe("f", start)), collect(subscribe("f", start))]);
    expect(a).toEqual([event, done]); expect(b).toEqual(a); expect(start).toHaveBeenCalledTimes(1);
    expect(await collect(subscribe("f", start))).toEqual(a); expect(start).toHaveBeenCalledTimes(1);
    await collect(subscribe("f", start, true)); expect(start).toHaveBeenCalledTimes(2);
  });
  it("aborts abandoned research even when its next event is blocked", async () => {
    vi.useFakeTimers();
    const subscribe = createReportRuns(); const reader = new AbortController(); let signal: AbortSignal | undefined;
    const start = async function* (s: AbortSignal) {
      signal = s; yield event;
      await new Promise<void>((resolve) => s.addEventListener("abort", () => resolve(), { once: true }));
    };
    const it = subscribe("f", start, false, reader.signal);
    expect((await it.next()).value).toEqual(event);
    const waiting = it.next(); reader.abort();
    expect((await waiting).done).toBe(true);
    await vi.advanceTimersByTimeAsync(501); expect(signal?.aborted).toBe(true);
  });
  it("does not abort while another reader still needs the result", async () => {
    vi.useFakeTimers(); const subscribe = createReportRuns(); const reader = new AbortController(); let signal: AbortSignal | undefined;
    let finish!: () => void; const gate = new Promise<void>((resolve) => { finish = resolve; });
    const start = async function* (s: AbortSignal) { signal = s; yield event; await gate; yield done; };
    const a = subscribe("f", start, false, reader.signal), b = subscribe("f", start);
    await a.next(); await b.next(); const waiting = a.next(); reader.abort(); await waiting;
    await vi.advanceTimersByTimeAsync(501); expect(signal?.aborted).toBe(false);
    finish(); expect((await b.next()).value).toEqual(done); await b.return();
  });
});
