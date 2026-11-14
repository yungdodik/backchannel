import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalaGaveUp, createCalaClient } from "@/lib/cala";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const limited = () => new Response('{"error":"rate_limit_exceeded"}', { status: 429 });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("cala client", () => {
  it("sends the key and projection body", async () => {
    const fetch = vi.fn<(u: string, i: RequestInit) => Promise<Response>>(async () => ok({ id: "x" }));
    const cala = createCalaClient({ fetch, apiKey: "k", minGapMs: 0 });
    await expect(cala.getEntity("x", { properties: ["description"] })).resolves.toEqual({ id: "x" });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.cala.ai/v1/entities/x");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-API-KEY"]).toBe("k");
    expect(JSON.parse(init.body as string)).toEqual({ properties: ["description"] });
  });

  it("searches by name", async () => {
    const fetch = vi.fn<(u: string, i: RequestInit) => Promise<Response>>(async () => ok({ entities: [] }));
    const cala = createCalaClient({ fetch, apiKey: "k", minGapMs: 0 });
    await cala.searchEntities("Icebreaker.vc");
    expect(fetch.mock.calls[0][0]).toBe("https://api.cala.ai/v1/entities?name=Icebreaker.vc&limit=10");
  });

  it("keeps the minimum gap between calls, one at a time", async () => {
    const starts: number[] = [];
    const fetch = vi.fn(async () => (starts.push(Date.now()), ok({})));
    const cala = createCalaClient({ fetch, apiKey: "k", minGapMs: 1000 });
    const t0 = Date.now();
    const all = Promise.all([cala.getEntity("a", {}), cala.getEntity("b", {}), cala.getEntity("c", {})]);
    await vi.runAllTimersAsync();
    await all;
    expect(starts.map((s) => s - t0)).toEqual([0, 1000, 2000]);
  });

  it("retries 429 with backoff 1,2,4,8,16 s and reports each wait", async () => {
    const starts: number[] = [];
    let n = 0;
    const fetch = vi.fn(async () => (starts.push(Date.now()), ++n <= 3 ? limited() : ok({ id: "x" })));
    const onRetry = vi.fn();
    const cala = createCalaClient({ fetch, apiKey: "k", minGapMs: 0 });
    const t0 = Date.now();
    const p = cala.getEntity("x", {}, { onRetry });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ id: "x" });
    expect(starts.map((s) => s - t0)).toEqual([0, 1000, 3000, 7000]);
    expect(onRetry).toHaveBeenCalledTimes(3);
    expect(cala.hits429).toBe(3);
  });

  it("gives up after 5 retries (6 tries) and frees the queue", async () => {
    let n = 0;
    const fetch = vi.fn(async () => (++n <= 6 ? limited() : ok({ id: "next" })));
    const cala = createCalaClient({ fetch, apiKey: "k", minGapMs: 0 });
    const p = cala.getEntity("x", {});
    const caught = p.catch((e) => e);
    const next = cala.getEntity("y", {});
    await vi.runAllTimersAsync();
    expect(await caught).toBeInstanceOf(CalaGaveUp);
    expect(fetch).toHaveBeenCalledTimes(7);
    await expect(next).resolves.toEqual({ id: "next" });
  });

  it("throws on other HTTP errors without retrying", async () => {
    const fetch = vi.fn(async () => new Response("boom", { status: 500 }));
    const cala = createCalaClient({ fetch, apiKey: "k", minGapMs: 0 });
    const p = cala.getEntity("x", {}).catch((e) => e);
    await vi.runAllTimersAsync();
    expect(String(await p)).toMatch(/500/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
