import { describe, expect, it } from "vitest";
import { checkOverview, companyOverview, overviewFacts } from "@/lib/overview";
import type { PortfolioCompany } from "@/lib/types";

const src = (url: string) => ({ url });
const co: PortfolioCompany = {
  calaId: "c1",
  name: "Acme",
  description: "Acme makes licensing software.",
  rounds: [{ calaId: "r1", label: "Series A", date: "2021-01-28", amount: "$16 million", fundIsLead: null, coInvestors: ["Sapphire Sport"], sources: [src("https://tc.example/a")] }],
  signals: [
    { kind: "last_round", text: "Last recorded round: 2021-01", sources: [src("https://tc.example/a")] },
    { kind: "news_event", text: "Reported acquisition (news.example, 2024-03)", sources: [{ url: "https://news.example/x", name: "Acme acquired by Globex" }] },
  ],
  founders: [],
  sources: [src("https://cala.example/link")],
  state: "enriched",
};
const { lines } = overviewFacts(co);

describe("company overview (D29)", () => {
  it("lists the facts once each, with every source behind them", () => {
    const f = overviewFacts(co);
    expect(f.lines).toContain("News title: Acme acquired by Globex");
    expect(f.lines).toContain("Round: Series A, January 2021; amount $16 million; investors named: Sapphire Sport");
    expect(f.sources.map((s) => s.url)).toEqual(["https://cala.example/link", "https://tc.example/a", "https://news.example/x"]);
  });

  it("keeps a neutral overview that only uses numbers from the facts", () => {
    expect(checkOverview(" Acme makes licensing software. It raised $16 million in 2021. ", lines)).toBe("Acme makes licensing software. It raised $16 million in 2021.");
  });

  it.each([
    ["a verdict word", "Acme failed to raise again after 2021."],
    ["another verdict word", "Acme is a struggling software company."],
    ["a number that is not in the facts", "Acme raised $20 million in 2021."],
    ["talk about the prompt", "Acme makes software. The provided facts do not mention any news."],
    ["a name that is not in the facts", "Acme makes licensing software and was backed by Globocorp."],
    ["an empty text", "   "],
    ["a non-string", ["Acme"]],
    ["a text that is too long", "Acme. ".repeat(150)],
  ])("rejects %s", (_, raw) => {
    expect(checkOverview(raw, lines)).toBeNull();
  });

  it("leaves the field empty when Gemini fails, breaks a rule, or there are no facts", async () => {
    const boom = { overview: async () => Promise.reject(new Error("503")) };
    expect(await companyOverview(co, boom)).toBeUndefined();
    expect(await companyOverview(co, { overview: async () => "Acme is dead." })).toBeUndefined();
    const bare = { ...co, description: undefined, rounds: [], signals: [] };
    expect(await companyOverview(bare, { overview: async () => "Acme is a company." })).toBeUndefined();
  });

  it("returns the text with the sources of the facts", async () => {
    const o = await companyOverview(co, { overview: async () => "Acme makes licensing software." });
    expect(o).toEqual({ text: "Acme makes licensing software.", sources: overviewFacts(co).sources });
  });
});
