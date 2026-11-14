import type { StreamEvent } from "@/lib/types";

type Run = { events: StreamEvent[]; ended: boolean; readers: number; controller: AbortController; listeners: Set<() => void>; expires: number; cleanup?: ReturnType<typeof setTimeout> };
/** Per-process deduplication, bounded retention. A new deployment/process starts empty. */
export function createReportRuns(ttlMs = 10 * 60_000) {
  const runs = new Map<string, Run>();
  return async function* subscribe(key: string, start: (signal: AbortSignal) => AsyncIterable<StreamEvent>, retry = false, signal?: AbortSignal): AsyncGenerator<StreamEvent, void, unknown> {
    if (signal?.aborted) return;
    for (const [id, run] of runs) if (run.ended && run.expires < Date.now()) runs.delete(id);
    let run = runs.get(key);
    if (run?.ended && (retry || run.events.at(-1)?.type === "error")) { runs.delete(key); run = undefined; }
    if (!run) {
      if (runs.size >= 20) {
        const old = [...runs].find(([, r]) => r.ended);
        if (old) runs.delete(old[0]);
        else { yield { type: "error", message: "Research is busy. Please try a prepared example or retry shortly." }; return; }
      }
      run = { events: [], ended: false, readers: 0, controller: new AbortController(), listeners: new Set(), expires: Infinity };
      runs.set(key, run);
      const current = run;
      const push = (event: StreamEvent) => { current.events.push(event); for (const wake of current.listeners) wake(); };
      void (async () => {
        try { for await (const event of start(current.controller.signal)) push(event); }
        catch { if (!current.controller.signal.aborted) push({ type: "error", message: "Research interrupted. Retry or open a prepared example." }); }
        finally { current.ended = true; current.expires = Date.now() + ttlMs; for (const wake of current.listeners) wake(); }
      })();
    }
    clearTimeout(run.cleanup);
    run.readers++;
    let index = 0;
    try {
      while (!signal?.aborted) {
        while (!signal?.aborted && index < run.events.length) yield run.events[index++];
        if (run.ended || signal?.aborted) return;
        await new Promise<void>((resolve) => {
          const wake = () => { run!.listeners.delete(wake); signal?.removeEventListener("abort", wake); resolve(); };
          run!.listeners.add(wake);
          signal?.addEventListener("abort", wake, { once: true });
          if (signal?.aborted) wake();
        });
      }
    } finally {
      run.readers--;
      if (!run.readers && !run.ended) {
        const current = run;
        current.cleanup = setTimeout(() => {
          if (!current.readers && !current.ended) { current.controller.abort(); if (runs.get(key) === current) runs.delete(key); }
        }, 500);
      }
    }
  };
}
