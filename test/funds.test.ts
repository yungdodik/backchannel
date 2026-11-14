import { describe, expect, it } from "vitest";
import type { CalaEntity } from "@/lib/cala";
import { slug, toFundMatches, withPortfolioCounts } from "@/lib/funds";
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

  it("drops people, press releases and other things that cannot be a fund; keeps untyped entities", () => {
    const out = toFundMatches({
      entities: [
        { id: "1", name: "Jane Street", entity_type: "Person" },
        { id: "2", name: "MochaTrade raises pre-seed", entity_type: "WorkOfArt" },
        { id: "3", name: "Jane Street", entity_type: "Organization" },
        { id: "4", name: "Y Combinator", entity_type: "EducationalInstitution" },
        { id: "5", name: "JANE STREET CAPITAL, LLC", entity_type: "Company" },
        { id: "6", name: "No type" },
      ],
    });
    expect(out.map((m) => m.calaId)).toEqual(["3", "4", "5", "6"]);
  });
});

describe("withPortfolioCounts", () => {
  const entity = (n: number): CalaEntity => ({
    properties: {},
    relationships: { outgoing: { INVESTED_IN: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `C${i}`, entity_type: "Company", properties: {} })) }, incoming: {} },
  });
  const matches = ["a", "b", "c", "d"].map((id) => ({ calaId: id, name: id.toUpperCase() }));

  it("counts INVESTED_IN links and puts the larger portfolios first; a failed count goes last", async () => {
    const sizes: Record<string, number> = { a: 0, b: 12, d: 40 };
    const cala = { getEntity: async (id: string) => (id in sizes ? entity(sizes[id]) : Promise.reject(new Error("429"))) };
    const out = await withPortfolioCounts(matches, cala);
    expect(out.map((m) => [m.calaId, m.companies])).toEqual([["d", 40], ["b", 12], ["a", 0], ["c", undefined]]);
  });

  it("keeps precomputed funds first without counting them", async () => {
    const asked: string[] = [];
    const cala = { getEntity: async (id: string) => (asked.push(id), entity(id === "d" ? 9 : 1)) };
    const out = await withPortfolioCounts(matches, cala, { skip: new Set(["b"]) });
    expect(out.map((m) => m.calaId)).toEqual(["b", "d", "a", "c"]);
    expect(asked).not.toContain("b");
    expect(out[0].companies).toBeUndefined();
  });

  it("returns what it has when the counts take longer than the budget", async () => {
    const cala = { getEntity: (id: string) => (id === "a" ? Promise.resolve(entity(3)) : new Promise<CalaEntity>(() => {})) };
    const out = await withPortfolioCounts(matches, cala, { budgetMs: 20 });
    expect(out.map((m) => [m.calaId, m.companies])).toEqual([["a", 3], ["b", undefined], ["c", undefined], ["d", undefined]]);
  });
});

describe("slug", () => {
  it.each([
    ["Icebreaker.vc", "icebreaker_vc"],
    ["Creandum", "creandum"],
    ["  Inventure ", "inventure"],
  ])("%s -> %s", (q, s) => expect(slug(q)).toBe(s));
});
