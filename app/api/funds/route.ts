import { slug, toFundMatches } from "@/lib/funds";
import creandum from "@/test/fixtures/cala/creandum_1_search.json";
import icebreaker from "@/test/fixtures/cala/icebreaker_vc_1_search.json";
import inventure from "@/test/fixtures/cala/inventure_1_search.json";

const fixtures: Record<string, typeof icebreaker> = {
  creandum,
  icebreaker_vc: icebreaker,
  inventure,
};

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? "";
  if (!q.trim() || params.get("mock") !== "1") return Response.json([]);
  return Response.json(toFundMatches(fixtures[slug(q)] ?? icebreaker));
}
