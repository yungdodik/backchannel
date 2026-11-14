// Cala REST client (D17): one shared queue, concurrency 1, min gap between calls, 429 backoff.

export interface CalaSource {
  name?: string;
  document?: string;
  date?: string;
}

export interface CalaLink {
  id: string;
  name: string;
  entity_type: string;
  properties: { sources?: CalaSource[]; is_lead?: boolean; event_date?: string; role?: string; [k: string]: unknown };
}

export interface CalaEntity {
  id?: string;
  name?: string;
  description?: string;
  properties: Record<string, { value?: unknown; sources?: CalaSource[] } | undefined>;
  relationships: { outgoing: Record<string, CalaLink[]>; incoming: Record<string, CalaLink[]> };
}

export interface CalaSearch {
  entities: { id: string; name: string; entity_type?: string; description?: string }[];
}

export interface Projection {
  properties?: string[];
  relationships?: {
    outgoing?: Record<string, { limit: number }>;
    incoming?: Record<string, { limit: number }>;
  };
}

export interface CallOpts {
  signal?: AbortSignal;
  onRetry?: (attempt: number, waitMs: number) => void;
}

/** The adapter the pipeline depends on; tests fake it with fixtures. */
export interface Cala {
  searchEntities(name: string, limit?: number): Promise<CalaSearch>;
  getEntity(id: string, projection: Projection, opts?: CallOpts): Promise<CalaEntity>;
}

export class CalaGaveUp extends Error {}

const BASE = "https://api.cala.ai/v1";
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000];
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason); return; }
  const abort = () => { clearTimeout(timer); reject(signal?.reason); };
  const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
  signal?.addEventListener("abort", abort, { once: true });
});

export function createCalaClient({
  fetch,
  apiKey,
  minGapMs = 1000,
}: {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  apiKey: string;
  minGapMs?: number;
}) {
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = -Infinity;
  let hits429 = 0;

  async function attempt(url: string, init: RequestInit, opts?: CallOpts) {
    for (let i = 0; ; i++) {
      opts?.signal?.throwIfAborted();
      const wait = lastStart + minGapMs - Date.now();
      if (wait > 0) await sleep(wait, opts?.signal);
      lastStart = Date.now();
      const res = await fetch(url, { ...init, signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(opts?.signal ? [opts.signal] : [])]) });
      if (res.ok) return res.json();
      if (res.status !== 429) throw new Error(`Cala ${res.status}: ${(await res.text()).slice(0, 200)}`);
      hits429++;
      if (i >= BACKOFF_MS.length) throw new CalaGaveUp(`Cala rate limit: gave up on ${url}`);
      opts?.onRetry?.(i + 1, BACKOFF_MS[i]);
      await sleep(BACKOFF_MS[i], opts?.signal);
    }
  }

  // Retries hold the queue: the rate limit is global, so other calls would 429 too.
  function enqueue<T>(url: string, init: RequestInit, opts?: CallOpts): Promise<T> {
    const run = tail.then(() => attempt(url, init, opts));
    tail = run.catch(() => {});
    return run as Promise<T>;
  }

  const headers = { "X-API-KEY": apiKey, "Content-Type": "application/json" };
  return {
    searchEntities: (name: string, limit = 10) =>
      enqueue<CalaSearch>(`${BASE}/entities?${new URLSearchParams({ name, limit: String(limit) })}`, {
        method: "GET",
        headers,
      }),
    getEntity: (id: string, projection: Projection, opts?: CallOpts) =>
      enqueue<CalaEntity>(
        `${BASE}/entities/${encodeURIComponent(id)}`,
        { method: "POST", headers, body: JSON.stringify(projection) },
        opts,
      ),
    get hits429() {
      return hits429;
    },
  } satisfies Cala & { hits429: number };
}
