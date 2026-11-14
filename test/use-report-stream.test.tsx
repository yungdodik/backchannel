// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useReportStream } from "@/components/use-report-stream";
import type { StreamEvent } from "@/lib/types";

const fund = { calaId: "f1", name: "Icebreaker.vc" };
const progress: StreamEvent = { type: "progress", message: "Walking portfolio…" };
const portfolio: StreamEvent = { type: "portfolio", fund, companies: [] };
const done: StreamEvent = {
  type: "done",
  report: { fund, generatedAt: "2026-11-14T00:00:00Z", complete: true, portfolio: [], callList: [] },
};

/** A fetch whose body yields exactly these string chunks. */
function fakeFetch(chunks: string[]) {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return vi.fn(async () => new Response(body, { headers: { "Content-Type": "application/x-ndjson" } }));
}

afterEach(() => vi.unstubAllGlobals());

describe("useReportStream", () => {
  it("parses NDJSON lines split across chunks and skips a malformed line", async () => {
    const l1 = JSON.stringify(progress);
    const l2 = JSON.stringify(portfolio);
    const l3 = JSON.stringify(done);
    vi.stubGlobal(
      "fetch",
      fakeFetch([l1.slice(0, 7), l1.slice(7) + "\n" + l2.slice(0, 20), l2.slice(20) + "\n{not json\n", l3 + "\n"]),
    );

    const { result } = renderHook(() => useReportStream("/api/report?fund=f1&mock=1"));

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.events).toEqual([progress, portfolio, done]);
  });

  it("keeps partial events and appends an error when the stream ends without done/error", async () => {
    vi.stubGlobal("fetch", fakeFetch([JSON.stringify(portfolio) + "\n"]));

    const { result } = renderHook(() => useReportStream("/api/report?fund=f1"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.events[0]).toEqual(portfolio);
    expect(result.current.events.at(-1)).toMatchObject({ type: "error" });
  });

  it("starts empty when the same url is fetched again (fly out, fly back to the same fund)", async () => {
    const entry: StreamEvent = {
      type: "entry",
      entry: { companyId: "c1", companyName: "Acme", founder: { name: "Ann", via: "cala", sources: [] }, group: "recent_round", why: [], questions: [], writing: [] },
    };
    const lines = [portfolio, entry, done].map((e) => JSON.stringify(e) + "\n");
    vi.stubGlobal("fetch", vi.fn(() => fakeFetch(lines)()));
    const url = "/api/report?fund=f1";

    const { result, rerender } = renderHook(({ u }: { u: string | null }) => useReportStream(u), { initialProps: { u: url as string | null } });
    await waitFor(() => expect(result.current.status).toBe("done"));
    rerender({ u: null });
    rerender({ u: url });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.events).toEqual([portfolio, entry, done]));
    // never the first run's events followed by the second run's: that listed every founder twice
    expect(result.current.events.filter((e) => e.type === "entry")).toHaveLength(1);
  });

  it("appends an error event when the request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));

    const { result } = renderHook(() => useReportStream("/api/report?fund=f1"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.events).toEqual([{ type: "error", message: expect.any(String) }]);
  });
});
