// Saved live reports: every finished live run is stored so the next visitor gets it instantly,
// in search and (for the most opened funds) as a star in the sky.
// - Redis (Upstash REST) when KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/TOKEN are set (Vercel).
// - Otherwise, off Vercel, JSON files in data/saved/ (local demo laptop).
// - Otherwise (Vercel without Redis) nothing is saved.
//
// Rules: opens are counted per fund; the sky shows the SKY_LIMIT most opened; storage keeps at most
// MAX_SAVED funds and drops the least opened, longest unchecked one; a report older than STALE_DAYS is
// served as is and refreshed in the background; a run that found no companies is never saved.
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Report, StreamEvent } from "@/lib/types";

export const SKY_LIMIT = 20;
export const MAX_SAVED = 200;
export const STALE_DAYS = 14;
const DAY = 86_400_000;
const LOCK_S = 600;

export interface SavedFund {
  id: string;
  name: string;
  companies: number;
  calls: number;
  generatedAt: string;
  complete: boolean;
  /** Last time a run for this fund finished, even if its result was not kept. */
  checkedAt?: string;
  opens?: number;
}

export interface SavedStore {
  get(id: string): Promise<Report | null>;
  summary(id: string): Promise<SavedFund | null>;
  /** Every saved fund with its open count. */
  list(): Promise<SavedFund[]>;
  /** Saves the report unless a better one is kept; then trims storage to MAX_SAVED. */
  put(report: Report, now?: Date): Promise<void>;
  /** Counts one open of a fund. */
  hit(id: string): Promise<void>;
  /** True if this caller may refresh the fund now (one refresh at a time per fund). */
  claimRefresh(id: string): Promise<boolean>;
  releaseRefresh(id: string): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function summarise(report: Report, now = new Date()): SavedFund {
  return {
    id: report.fund.calaId,
    name: report.fund.name,
    companies: report.portfolio.length,
    calls: report.callList.length,
    generatedAt: report.generatedAt,
    complete: report.complete,
    checkedAt: now.toISOString(),
  };
}

/** A complete report is never replaced by a partial one (e.g. a time-limited Vercel run after a full local run). */
export function shouldReplace(old: SavedFund | null | undefined, next: Report): boolean {
  return !(old?.complete && !next.complete);
}

export function isStale(f: SavedFund, now = new Date(), days = STALE_DAYS): boolean {
  const t = Date.parse(f.checkedAt ?? f.generatedAt);
  return !Number.isFinite(t) || now.getTime() - t > days * DAY;
}

/** Most opened first, then the most recently researched. */
export function topFunds(funds: SavedFund[], n = SKY_LIMIT): SavedFund[] {
  return [...funds].sort((a, b) => (b.opens ?? 0) - (a.opens ?? 0) || Date.parse(b.generatedAt) - Date.parse(a.generatedAt)).slice(0, n);
}

/** The funds to drop to get back to `max`: least opened, then longest unchecked. `keep` is never dropped. */
export function evictions(funds: SavedFund[], max = MAX_SAVED, keep?: string): string[] {
  const extra = funds.length - max;
  if (extra <= 0) return [];
  const checked = (f: SavedFund) => Date.parse(f.checkedAt ?? f.generatedAt) || 0;
  return funds
    .filter((f) => f.id !== keep)
    .sort((a, b) => (a.opens ?? 0) - (b.opens ?? 0) || checked(a) - checked(b))
    .slice(0, extra)
    .map((f) => f.id);
}

type Command = (string | number)[];

export function redisStore(url: string, token: string, fetchFn: typeof fetch = fetch, max = MAX_SAVED): SavedStore {
  async function call<T>(cmd: Command): Promise<T> {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
      cache: "no-store",
    });
    const body = (await res.json()) as { result?: T; error?: string };
    if (!res.ok || body.error) throw new Error(`Redis ${res.status}: ${body.error ?? "request failed"}`);
    return body.result as T;
  }
  const pairs = (flat: string[] | null) => {
    const out: [string, string][] = [];
    for (let i = 1; i < (flat ?? []).length; i += 2) out.push([flat![i - 1], flat![i]]);
    return out;
  };
  const parse = (raw: string | null) => {
    try { return raw ? (JSON.parse(raw) as SavedFund) : null; } catch { return null; }
  };
  const store: SavedStore = {
    async get(id) {
      if (!UUID.test(id)) return null;
      const raw = await call<string | null>(["GET", `report:${id}`]);
      return raw ? (JSON.parse(raw) as Report) : null;
    },
    async summary(id) {
      return UUID.test(id) ? parse(await call<string | null>(["HGET", "funds", id])) : null;
    },
    async list() {
      const opens = new Map(pairs(await call<string[] | null>(["HGETALL", "opens"])).map(([k, v]) => [k, Number(v) || 0]));
      return pairs(await call<string[] | null>(["HGETALL", "funds"]))
        .map(([, v]) => parse(v))
        .filter((f): f is SavedFund => !!f)
        .map((f) => ({ ...f, opens: opens.get(f.id) ?? 0 }));
    },
    async put(report, now = new Date()) {
      const id = report.fund.calaId;
      if (!UUID.test(id) || !report.portfolio.length) return;
      const old = await store.summary(id);
      if (!shouldReplace(old, report)) {
        if (old) await call(["HSET", "funds", id, JSON.stringify({ ...old, checkedAt: now.toISOString() })]);
        return;
      }
      await call(["SET", `report:${id}`, JSON.stringify(report)]);
      await call(["HSET", "funds", id, JSON.stringify(summarise(report, now))]);
      for (const gone of evictions(await store.list(), max, id)) {
        await call(["DEL", `report:${gone}`]);
        await call(["HDEL", "funds", gone]);
        await call(["HDEL", "opens", gone]);
      }
    },
    async hit(id) {
      if (UUID.test(id)) await call(["HINCRBY", "opens", id, 1]);
    },
    async claimRefresh(id) {
      return (await call<string | null>(["SET", `refresh:${id}`, "1", "NX", "EX", LOCK_S])) === "OK";
    },
    async releaseRefresh(id) {
      await call(["DEL", `refresh:${id}`]);
    },
  };
  return store;
}

type Index = { funds: Record<string, SavedFund>; opens: Record<string, number> };

export function fileStore(dir: string, max = MAX_SAVED): SavedStore {
  const indexFile = path.join(dir, "index.json");
  const refreshing = new Set<string>();
  let queue: Promise<unknown> = Promise.resolve();
  /** Serialises index read-modify-write within this process. */
  const locked = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  };
  const write = async (file: string, data: string) => {
    await mkdir(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, file);
  };
  const readIndex = async (): Promise<Index> => {
    try {
      const raw = JSON.parse(await readFile(indexFile, "utf8")) as Partial<Index>;
      return { funds: raw.funds ?? {}, opens: raw.opens ?? {} };
    } catch { return { funds: {}, opens: {} }; }
  };
  const withOpens = (ix: Index) => Object.values(ix.funds).map((f) => ({ ...f, opens: ix.opens[f.id] ?? 0 }));
  return {
    async get(id) {
      if (!UUID.test(id)) return null;
      try { return JSON.parse(await readFile(path.join(dir, `${id}.json`), "utf8")) as Report; } catch { return null; }
    },
    async summary(id) {
      return UUID.test(id) ? ((await readIndex()).funds[id] ?? null) : null;
    },
    async list() {
      return withOpens(await readIndex());
    },
    put: (report, now = new Date()) => locked(async () => {
      const id = report.fund.calaId;
      if (!UUID.test(id) || !report.portfolio.length) return;
      const ix = await readIndex();
      if (!shouldReplace(ix.funds[id], report)) {
        ix.funds[id] = { ...ix.funds[id], checkedAt: now.toISOString() };
      } else {
        await write(path.join(dir, `${id}.json`), JSON.stringify(report));
        ix.funds[id] = summarise(report, now);
        for (const gone of evictions(withOpens(ix), max, id)) {
          delete ix.funds[gone];
          delete ix.opens[gone];
          await rm(path.join(dir, `${gone}.json`), { force: true });
        }
      }
      await write(indexFile, JSON.stringify(ix, null, 2));
    }),
    hit: (id) => locked(async () => {
      if (!UUID.test(id)) return;
      const ix = await readIndex();
      ix.opens[id] = (ix.opens[id] ?? 0) + 1;
      await write(indexFile, JSON.stringify(ix, null, 2));
    }),
    async claimRefresh(id) {
      if (refreshing.has(id)) return false;
      refreshing.add(id);
      return true;
    },
    async releaseRefresh(id) {
      refreshing.delete(id);
    },
  };
}

const noStore: SavedStore = {
  get: async () => null,
  summary: async () => null,
  list: async () => [],
  put: async () => {},
  hit: async () => {},
  claimRefresh: async () => false,
  releaseRefresh: async () => {},
};

let store: SavedStore | undefined;
export function savedStore(): SavedStore {
  if (store) return store;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) store = redisStore(url, token);
  else if (!process.env.VERCEL) store = fileStore(process.env.SAVED_REPORTS_DIR ?? path.join(process.cwd(), "data", "saved"));
  else store = noStore;
  return store;
}

/** Passes the stream through and saves the final report before announcing it. A failed save never breaks the run. */
export async function* persisting(events: AsyncIterable<StreamEvent>, save: SavedStore): AsyncIterable<StreamEvent> {
  for await (const event of events) {
    if (event.type === "done" && !event.report.mock) {
      await save.put(event.report).catch((e) => console.error("saving report failed", e));
    }
    yield event;
  }
}

/** Re-runs a stale saved fund in the background; at most one refresh per fund at a time. */
export async function refreshIfStale(id: string, save: SavedStore, run: () => AsyncIterable<StreamEvent>, now = new Date()): Promise<boolean> {
  const summary = await save.summary(id);
  if (!summary || !isStale(summary, now) || !(await save.claimRefresh(id))) return false;
  try {
    for await (const event of persisting(run(), save)) void event;
  } finally {
    await save.releaseRefresh(id).catch(() => {});
  }
  return true;
}
