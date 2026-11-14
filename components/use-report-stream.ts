"use client";

import { useEffect, useState } from "react";
import type { StreamEvent } from "@/lib/types";

export type StreamStatus = "idle" | "streaming" | "done" | "error";

export interface ReportStream {
  /** Every well-formed event received so far, in arrival order. */
  events: StreamEvent[];
  status: StreamStatus;
}

function parseLine(line: string): StreamEvent | null {
  if (!line.trim()) return null;
  try {
    const ev = JSON.parse(line);
    return ev && typeof ev === "object" && typeof ev.type === "string" ? (ev as StreamEvent) : null;
  } catch {
    return null; // malformed line: skip it, keep the stream going
  }
}

/** Reads an NDJSON `StreamEvent` stream (docs/spec.md "Stream protocol"). */
export function useReportStream(url: string | null): ReportStream {
  // State is tagged with the url it belongs to, so a new url starts empty without a reset in the effect.
  const [state, setState] = useState<ReportStream & { url: string | null }>({ url: null, events: [], status: "idle" });

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();

    let terminal = false;
    const push = (ev: StreamEvent) => {
      if (terminal) return; // protocol: done/error is the last line
      if (ev.type === "done" || ev.type === "error") terminal = true;
      setState((s) => {
        const events = s.url === url ? s.events : [];
        const status = ev.type === "done" ? "done" : ev.type === "error" ? "error" : "streaming";
        return { url, events: [...events, ev], status };
      });
    };

    (async () => {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error(`Report request failed (HTTP ${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          const ev = parseLine(l);
          if (ev) push(ev);
        }
      }
      const last = parseLine(buf + dec.decode());
      if (last) push(last);
      if (!terminal) push({ type: "error", message: "Connection closed before the report finished." });
    })().catch((err: unknown) => {
      if (ctrl.signal.aborted) return; // unmounted or url changed: not an error
      push({ type: "error", message: err instanceof Error ? err.message : "Could not load the report." });
    });

    return () => ctrl.abort();
  }, [url]);

  if (state.url !== url) return { events: [], status: url ? "streaming" : "idle" };
  return { events: state.events, status: state.status };
}
