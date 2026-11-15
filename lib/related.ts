// Funds linked through Cala's graph: other prepared funds whose recorded portfolio shares companies with this one.
// Matching is by Cala entity id, so it is exact; no names are compared.
import { cachedReports } from "@/lib/cached-reports";
import type { Report } from "@/lib/types";

export interface FundPortfolio {
  id: string;
  name: string;
  calls: number;
  companies: Map<string, string>; // calaId → company name
}

export interface RelatedFund {
  id: string;
  name: string;
  companies: number;
  calls: number;
  shared: { calaId: string; name: string }[];
}

export function relatedFunds(fundId: string, companyIds: string[], others: FundPortfolio[], limit = 6): RelatedFund[] {
  const mine = new Set(companyIds);
  return others
    .filter((o) => o.id !== fundId)
    .map((o) => ({
      id: o.id,
      name: o.name,
      companies: o.companies.size,
      calls: o.calls,
      shared: [...o.companies].filter(([id]) => mine.has(id)).map(([calaId, name]) => ({ calaId, name })),
    }))
    .filter((r) => r.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length || a.name.localeCompare(b.name))
    .slice(0, limit);
}

let index: Promise<FundPortfolio[]> | undefined;
/** Portfolios of the bundled reports, loaded once per server process. */
export function preparedPortfolios(): Promise<FundPortfolio[]> {
  index ??= Promise.all(
    Object.values(cachedReports).map(async (load) => {
      const r = (await load()).default as Report;
      return { id: r.fund.calaId, name: r.fund.name, calls: r.callList.length, companies: new Map(r.portfolio.map((c) => [c.calaId, c.name])) };
    }),
  );
  return index;
}
