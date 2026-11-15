import { describe, expect, it } from "vitest";
import { relatedFunds, type FundPortfolio } from "@/lib/related";

const p = (id: string, name: string, cos: [string, string][]): FundPortfolio => ({ id, name, calls: 1, companies: new Map(cos) });

describe("relatedFunds", () => {
  it("ranks other funds by companies shared, matched by Cala id, never the fund itself", () => {
    const others = [
      p("a", "Alpha", [["c1", "Klaus"], ["c2", "Pipedrive"], ["c9", "Other"]]),
      p("b", "Beta", [["c1", "Klaus"]]),
      p("me", "Me", [["c1", "Klaus"]]),
      p("z", "Zeta", [["c8", "None shared"]]),
    ];
    const r = relatedFunds("me", ["c1", "c2", "c3"], others);
    expect(r.map((f) => [f.name, f.shared.length])).toEqual([["Alpha", 2], ["Beta", 1]]);
    expect(r[0].shared.map((c) => c.name)).toEqual(["Klaus", "Pipedrive"]);
  });
});
