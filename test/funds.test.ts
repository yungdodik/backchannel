import { describe, expect, it } from "vitest";
import { slug, toFundMatches } from "@/lib/funds";
import inventure from "@/test/fixtures/cala/inventure_1_search.json";

describe("toFundMatches", () => {
  it("puts VC-described entities first, stable, top 5", () => {
    const out = toFundMatches(inventure);
    expect(out.map((m) => m.calaId.slice(0, 8))).toEqual([
      "3794cb88", // Belgian venture capital firm
      "fd3ba350", // Finnish investment firm
      "f5b15ae0",
      "edc54c04",
      "b532fa93",
    ]);
    expect(out[1].name).toBe("Inventure");
  });

  it("puts funds with a precomputed report first, so a typed search reaches the demo report", () => {
    const out = toFundMatches(inventure, new Set(["fd3ba350-0e55-40b5-96e3-013994777fdc"]));
    expect(out.map((m) => m.calaId.slice(0, 8))).toEqual(["fd3ba350", "3794cb88", "f5b15ae0", "edc54c04", "b532fa93"]);
  });
});

describe("slug", () => {
  it.each([
    ["Icebreaker.vc", "icebreaker_vc"],
    ["Creandum", "creandum"],
    ["  Inventure ", "inventure"],
  ])("%s -> %s", (q, s) => expect(slug(q)).toBe(s));
});
