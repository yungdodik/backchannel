import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  evictions, fileStore, isStale, persisting, redisStore, refreshIfStale, shouldReplace, summarise, topFunds,
  type SavedFund, type SavedStore,
} from "@/lib/saved-reports";
import type { Report, StreamEvent } from "@/lib/types";

const ID = "70fb3317-cd8c-4c52-aa86-66502789bce3";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const report = (complete: boolean, n = 2, calaId = ID, generatedAt = "2026-11-15T09:00:00.000Z"): Report => ({
  fund: { calaId, name: "Icebreaker.vc" },
  generatedAt,
  complete,
  portfolio: Array.from({ length: n }, () => ({}) as Report["portfolio"][number]),
  callList: [],
});
const fund = (n: number, opens: number, at = "2026-11-01T00:00:00.000Z"): SavedFund =>
  ({ id: id(n), name: `F${n}`, companies: 1, calls: 0, generatedAt: at, complete: true, checkedAt: at, opens });

describe("rules", () => {
  it("never replaces a complete report with a partial one", () => {
    expect(shouldReplace(summarise(report(true)), report(false))).toBe(false);
    expect(shouldReplace(summarise(report(false)), report(true))).toBe(true);
    expect(shouldReplace(undefined, report(false))).toBe(true);
  });

  it("is stale after 14 days since the last check", () => {
    const now = new Date("2026-11-30T00:00:00Z");
    expect(isStale(fund(1, 0, "2026-11-10T00:00:00Z"), now)).toBe(true);
    expect(isStale(fund(1, 0, "2026-11-20T00:00:00Z"), now)).toBe(false);
  });

  it("shows the most opened funds in the sky", () => {
    expect(topFunds([fund(1, 2), fund(2, 9), fund(3, 5)], 2).map((f) => f.name)).toEqual(["F2", "F3"]);
  });

  it("evicts the least opened, longest unchecked funds, never the one just saved", () => {
    const funds = [fund(1, 0, "2026-10-01T00:00:00Z"), fund(2, 0, "2026-11-01T00:00:00Z"), fund(3, 7), fund(4, 0, "2026-09-01T00:00:00Z")];
    expect(evictions(funds, 2, id(4))).toEqual([id(1), id(2)]);
    expect(evictions(funds, 10)).toEqual([]);
  });
});

describe("fileStore", () => {
  let dir = "";
  afterEach(() => rm(dir, { recursive: true, force: true }));
  const fresh = async () => fileStore((dir = await mkdtemp(path.join(tmpdir(), "saved-"))), 2);

  it("saves, counts opens, lists and reads back", async () => {
    const store = await fresh();
    expect(await store.get(ID)).toBeNull();
    await store.put(report(true, 3));
    await store.hit(ID);
    await store.hit(ID);
    expect((await store.get(ID))?.portfolio).toHaveLength(3);
    expect(await store.list()).toEqual([expect.objectContaining({ id: ID, companies: 3, complete: true, opens: 2 })]);
  });

  it("keeps a complete report over a partial one but records the check", async () => {
    const store = await fresh();
    await store.put(report(true, 3), new Date("2026-11-01T00:00:00Z"));
    await store.put(report(false, 1), new Date("2026-11-20T00:00:00Z"));
    expect((await store.get(ID))?.portfolio).toHaveLength(3);
    expect((await store.summary(ID))?.checkedAt).toBe("2026-11-20T00:00:00.000Z");
  });

  it("never saves a run that found no companies", async () => {
    const store = await fresh();
    await store.put(report(true, 0));
    expect(await store.list()).toEqual([]);
  });

  it("drops the least opened fund past the cap", async () => {
    const store = await fresh();
    await store.put(report(true, 1, id(1)));
    await store.put(report(true, 1, id(2)));
    await store.hit(id(2));
    await store.put(report(true, 1, id(3)));
    expect((await store.list()).map((f) => f.id).sort()).toEqual([id(2), id(3)]);
    expect(await store.get(id(1))).toBeNull();
  });

  it("ignores ids that are not Cala UUIDs", async () => {
    const store = await fresh();
    expect(await store.get("../../etc/passwd")).toBeNull();
  });
});

describe("redisStore", () => {
  it("stores the report, its summary and opens; evicts past the cap", async () => {
    const kv = new Map<string, string>();
    const hashes = new Map<string, Map<string, string>>();
    const h = (k: string) => hashes.get(k) ?? hashes.set(k, new Map()).get(k)!;
    const fake = (async (_url: string, init: RequestInit) => {
      const args = JSON.parse(String(init.body)) as string[];
      const [cmd, a, b, c] = args;
      const nx = args.includes("NX") ? "NX" : "";
      const result =
        cmd === "GET" ? (kv.get(a) ?? null)
        : cmd === "SET" ? (nx === "NX" && kv.has(a) ? null : (kv.set(a, b), "OK"))
        : cmd === "DEL" ? Number(kv.delete(a))
        : cmd === "HGET" ? (h(a).get(b) ?? null)
        : cmd === "HSET" ? (h(a).set(b, c), 1)
        : cmd === "HDEL" ? Number(h(a).delete(b))
        : cmd === "HINCRBY" ? (h(a).set(b, String(Number(h(a).get(b) ?? 0) + Number(c))), 1)
        : cmd === "HGETALL" ? [...h(a)].flat()
        : null;
      return new Response(JSON.stringify({ result }));
    }) as typeof fetch;
    const store = redisStore("https://redis.test", "token", fake, 1);
    await store.put(report(true, 2, id(1)));
    await store.hit(id(1));
    expect(await store.list()).toEqual([expect.objectContaining({ id: id(1), companies: 2, opens: 1 })]);
    await store.put(report(true, 2, id(2)));
    expect((await store.list()).map((f) => f.id)).toEqual([id(2)]);
    expect(await store.get(id(1))).toBeNull();
    expect(await store.claimRefresh(id(2))).toBe(true);
    expect(await store.claimRefresh(id(2))).toBe(false);
    await store.releaseRefresh(id(2));
    expect(await store.claimRefresh(id(2))).toBe(true);
  });
});

async function* events(r: Report): AsyncIterable<StreamEvent> {
  yield { type: "progress", message: "x" };
  yield { type: "done", report: r };
}
const memory = (over: Partial<SavedStore> = {}): SavedStore => ({
  get: async () => null, summary: async () => null, list: async () => [], put: async () => {},
  hit: async () => {}, claimRefresh: async () => true, releaseRefresh: async () => {}, ...over,
});

describe("persisting", () => {
  it("saves the final report and passes every event through, even if saving fails", async () => {
    const saved: Report[] = [];
    const out: StreamEvent[] = [];
    for await (const e of persisting(events(report(true)), memory({ put: async (r) => void saved.push(r) }))) out.push(e);
    expect(out.map((e) => e.type)).toEqual(["progress", "done"]);
    expect(saved).toHaveLength(1);

    const out2: StreamEvent[] = [];
    for await (const e of persisting(events(report(true)), memory({ put: async () => { throw new Error("down"); } }))) out2.push(e);
    expect(out2.map((e) => e.type)).toEqual(["progress", "done"]);
  });
});

describe("refreshIfStale", () => {
  const now = new Date("2026-11-30T00:00:00Z");
  it("re-runs an old report once and saves the result", async () => {
    const saved: Report[] = [];
    let released = 0;
    const store = memory({ summary: async () => fund(1, 3, "2026-11-01T00:00:00Z"), put: async (r) => void saved.push(r), releaseRefresh: async () => void released++ });
    expect(await refreshIfStale(id(1), store, () => events(report(true, 2, id(1))), now)).toBe(true);
    expect(saved).toHaveLength(1);
    expect(released).toBe(1);
  });

  it("leaves a recent report alone, and skips when another refresh holds the fund", async () => {
    let runs = 0;
    const run = () => { runs++; return events(report(true)); };
    expect(await refreshIfStale(id(1), memory({ summary: async () => fund(1, 0, "2026-11-25T00:00:00Z") }), run, now)).toBe(false);
    expect(await refreshIfStale(id(1), memory({ summary: async () => fund(1, 0, "2026-11-01T00:00:00Z"), claimRefresh: async () => false }), run, now)).toBe(false);
    expect(runs).toBe(0);
  });
});
