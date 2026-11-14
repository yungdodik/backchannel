import type { FundMatch } from "@/lib/types";

const VC = /venture|vc\b|capital|fund|invest/i;

/** `cached`: ids with a precomputed report rank first (replay is instant; live costs Cala credit and minutes). */
export function toFundMatches(
  raw: { entities: { id: string; name: string; description?: string }[] },
  cached: ReadonlySet<string> = new Set(),
): FundMatch[] {
  return raw.entities
    .map((e): FundMatch => ({ calaId: e.id, name: e.name, description: e.description }))
    .map((m, i) => ({ m, i, vc: VC.test(m.description ?? ""), cached: cached.has(m.calaId) }))
    .sort((a, b) => Number(b.cached) - Number(a.cached) || Number(b.vc) - Number(a.vc) || a.i - b.i)
    .slice(0, 5)
    .map((x) => x.m);
}

export function slug(q: string) {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
