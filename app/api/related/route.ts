import { preparedPortfolios, relatedFunds } from "@/lib/related";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST { fund, companies: calaId[] } → prepared funds that backed the same companies (by Cala id). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { fund?: unknown; companies?: unknown };
    const fund = typeof body.fund === "string" ? body.fund : "";
    const companies = Array.isArray(body.companies) ? body.companies.filter((c): c is string => typeof c === "string" && UUID.test(c)).slice(0, 500) : [];
    if (!UUID.test(fund) || !companies.length) return Response.json([]);
    return Response.json(relatedFunds(fund, companies, await preparedPortfolios()));
  } catch (e) {
    console.error("related funds failed", e);
    return Response.json([]);
  }
}
