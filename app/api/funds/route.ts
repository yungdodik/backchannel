import { cachedReports } from "@/lib/cached-reports";
import { slug, toFundMatches, withPortfolioCounts } from "@/lib/funds";
import { liveCala } from "@/lib/live";
import creandum from "@/test/fixtures/cala/creandum_1_search.json";
import icebreaker from "@/test/fixtures/cala/icebreaker_vc_1_search.json";
import inventure from "@/test/fixtures/cala/inventure_1_search.json";

const fixtures: Record<string, typeof icebreaker> = {
  creandum,
  icebreaker_vc: icebreaker,
  inventure,
};

const CACHED = new Set(Object.keys(cachedReports));

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  if (!q) return Response.json([]);
  if (params.get("mock") === "1") return Response.json(toFundMatches(fixtures[slug(q)] ?? icebreaker));
  try {
    const cala = liveCala();
    return Response.json(await withPortfolioCounts(toFundMatches(await cala.searchEntities(q, 10), CACHED), cala, { skip: CACHED }));
  } catch (e) {
    console.error("funds search", e);
    return Response.json({ error: "Fund search is unavailable right now" }, { status: 502 });
  }
}
