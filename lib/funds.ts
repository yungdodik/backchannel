import type { FundMatch } from "@/lib/types";

const VC = /venture|vc\b|capital|fund|invest/i;

export function toFundMatches(raw: {
  entities: { id: string; name: string; description?: string }[];
}): FundMatch[] {
  return raw.entities
    .map((e): FundMatch => ({ calaId: e.id, name: e.name, description: e.description }))
    .map((m, i) => ({ m, i, vc: VC.test(m.description ?? "") }))
    .sort((a, b) => Number(b.vc) - Number(a.vc) || a.i - b.i)
    .slice(0, 5)
    .map((x) => x.m);
}

export function slug(q: string) {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
