import type { Cala } from "@/lib/cala";
import type { FundMatch } from "@/lib/types";

const VC = /venture|vc\b|capital|fund|invest/i;
// Cala's name search also returns people, press releases and so on; only these can be a fund. An entity with no type is kept.
const FUND_TYPE = /company|organi[sz]ation|institution|fund|investor/i;
/** How many portfolio links are fetched to count them; a count at the cap is shown as "200+". */
export const COUNT_CAP = 200;

/** `cached`: ids with a precomputed report rank first (replay is instant; live costs Cala credit and minutes). */
export function toFundMatches(
  raw: { entities: { id: string; name: string; entity_type?: string; description?: string }[] },
  cached: ReadonlySet<string> = new Set(),
): FundMatch[] {
  return raw.entities
    .filter((e) => !e.entity_type || FUND_TYPE.test(e.entity_type))
    .map((e): FundMatch => ({ calaId: e.id, name: e.name, description: e.description }))
    .map((m, i) => ({ m, i, vc: VC.test(m.description ?? ""), cached: cached.has(m.calaId) }))
    .sort((a, b) => Number(b.cached) - Number(a.cached) || Number(b.vc) - Number(a.vc) || a.i - b.i)
    .slice(0, 5)
    .map((x) => x.m);
}

/**
 * Adds `companies`, the number of INVESTED_IN links Cala holds for each match, and puts the larger portfolios first:
 * several records often share one name, and the one with the portfolio is the one a report can be built from.
 * Matches in `skip` (precomputed reports) are not counted and stay first. A count that fails or does not arrive
 * within `budgetMs` is left undefined and the match keeps its place after the counted ones.
 */
export async function withPortfolioCounts(
  matches: FundMatch[],
  cala: Pick<Cala, "getEntity">,
  { skip = new Set<string>(), budgetMs = 8000 }: { skip?: ReadonlySet<string>; budgetMs?: number } = {},
): Promise<FundMatch[]> {
  const counts = new Map<string, number>();
  const jobs = matches
    .filter((m) => !skip.has(m.calaId))
    .map((m) =>
      cala
        .getEntity(m.calaId, { properties: [], relationships: { outgoing: { INVESTED_IN: { limit: COUNT_CAP } } } })
        .then((e) => void counts.set(m.calaId, e.relationships?.outgoing?.INVESTED_IN?.length ?? 0))
        .catch(() => {}),
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([Promise.all(jobs), new Promise((r) => (timer = setTimeout(r, budgetMs)))]);
  clearTimeout(timer);
  const rank = (m: FundMatch) => (skip.has(m.calaId) ? Infinity : (counts.get(m.calaId) ?? -1));
  return matches
    .map((m, i) => ({ m: counts.has(m.calaId) ? { ...m, companies: counts.get(m.calaId) } : m, i }))
    .sort((a, b) => rank(b.m) - rank(a.m) || a.i - b.i)
    .map((x) => x.m);
}

export function slug(q: string) {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
