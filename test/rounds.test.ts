import { describe, expect, it, vi } from "vitest";
import { enrichRounds, type RoundDeps } from "@/lib/rounds";
import type { ExaResult } from "@/lib/exa";
import type { PortfolioCompany, Report, Round } from "@/lib/types";

const ARTICLE = "https://techcrunch.com/2024/11/25/appcharge-raises-26m";
const TEXT =
  "Appcharge raises $26M. The Series B was led by Creandum, with participation from Supercell and Play Ventures. " +
  '"Appcharge is changing how games sell," said Carl Fritjofsson, General Partner at Creandum.';

const round = (over: Partial<Round> = {}): Round => ({
  calaId: "r1",
  label: "Funding round",
  date: "2024-11-25",
  fundIsLead: null,
  coInvestors: [],
  sources: [{ url: ARTICLE, name: "Appcharge raises $26M", date: "2024-11-25" }],
  ...over,
});
const report = (rounds: Round[], name = "Appcharge Ltd"): Report => ({
  fund: { calaId: "f", name: "Creandum" },
  generatedAt: "2026-11-14T12:00:00Z",
  complete: true,
  portfolio: [{ calaId: "c1", name, rounds, signals: [], founders: [], sources: [], state: "enriched" } as PortfolioCompany],
  callList: [],
});

const extraction = {
  about: true,
  leads: [{ name: "Creandum", quote: "The Series B was led by Creandum" }],
  amount: { value: "$26M", quote: "Appcharge raises $26M" },
  investors: [
    { name: "Supercell", quote: "with participation from Supercell and Play Ventures" },
    { name: "Play Ventures", quote: "with participation from Supercell and Play Ventures" },
  ],
  partner: { name: "Carl Fritjofsson", title: "General Partner", quote: "said Carl Fritjofsson, General Partner at Creandum" },
};

function deps(over: { pages?: ExaResult[]; search?: ExaResult[]; extract?: unknown } = {}) {
  return {
    exa: {
      pages: vi.fn(async () => over.pages ?? [{ url: ARTICLE, title: "Appcharge raises $26M", text: TEXT }]),
      searchRound: vi.fn(async () => over.search ?? []),
    },
    gemini: { extract: vi.fn(async () => over.extract ?? extraction) },
  } satisfies RoundDeps;
}
const only = (r: Report) => r.portfolio[0].rounds[0];

describe("enrichRounds", () => {
  it("fills lead, amount, co-investors and partner from the source article, each backed by a quote", async () => {
    const d = deps();
    const { report: out } = await enrichRounds(report([round()]), d);
    expect(d.exa.pages).toHaveBeenCalledWith([ARTICLE]);
    expect(d.exa.searchRound).not.toHaveBeenCalled();
    expect(only(out)).toMatchObject({
      fundIsLead: true,
      fundNamed: true,
      amount: "$26M",
      coInvestors: ["Supercell", "Play Ventures"],
      partner: { name: "Carl Fritjofsson", title: "General Partner", source: { url: ARTICLE } },
    });
    expect(only(out).quotes).toContainEqual({ text: "The Series B was led by Creandum", url: ARTICLE });
    expect(only(out).sources.map((s) => s.url)).toEqual([ARTICLE]);
  });

  it("drops any fact whose quote is not in the article, or whose name is not in its quote", async () => {
    const extract = {
      ...extraction,
      leads: [{ name: "Atomico", quote: "The Series B was led by Atomico" }], // invented
      amount: { value: "$30M", quote: "Appcharge raises $26M" }, // value not in its quote
      investors: [{ name: "D awn Capital", quote: "with participation from Supercell and Play Ventures" }],
      partner: { name: "Carl Fritjofsson", quote: "Appcharge is changing how games sell" }, // quote doesn't name the fund
    };
    const { report: out } = await enrichRounds(report([round()]), deps({ extract }));
    const r = only(out);
    expect(r.fundIsLead).toBeNull();
    expect(r.amount).toBeUndefined();
    expect(r.coInvestors).toEqual([]);
    expect(r.partner).toBeUndefined();
    expect(r.quotes ?? []).toEqual([]);
  });

  it("a known lead that isn't the fund sets fundIsLead false; the fund as a participant sets fundNamed", async () => {
    const text = "Abacum raised $25 million led by Atomico. Creandum and FJ Labs also invested.";
    const extract = {
      about: true,
      leads: [{ name: "Atomico", quote: "led by Atomico" }],
      investors: [
        { name: "Creandum", quote: "Creandum and FJ Labs also invested" },
        { name: "FJ Labs", quote: "Creandum and FJ Labs also invested" },
      ],
    };
    const { report: out } = await enrichRounds(report([round()], "Abacum"), deps({ pages: [{ url: ARTICLE, text }], extract }));
    expect(only(out)).toMatchObject({ fundIsLead: false, fundNamed: true, coInvestors: ["Atomico", "FJ Labs"] });
  });

  it("database-only sources: searches for the announcement within ±60 days of the round", async () => {
    const d = deps({ search: [{ url: ARTICLE, title: "Appcharge raises $26M", text: TEXT }] });
    const r = round({ sources: [{ url: "https://tracxn.com/d/companies/appcharge/x" }] });
    const { report: out } = await enrichRounds(report([r]), d);
    expect(d.exa.pages).not.toHaveBeenCalled();
    expect(d.exa.searchRound).toHaveBeenCalledWith('"appcharge" raises', { startPublishedDate: "2024-09-26", endPublishedDate: "2025-01-24" });
    expect(only(out).fundIsLead).toBe(true);
    expect(only(out).sources.map((s) => s.url)).toEqual(["https://tracxn.com/d/companies/appcharge/x", ARTICLE]);
  });

  it("a search result counts only when its title names the company (generic names match other companies)", async () => {
    const xanadu = { url: "https://xanadu.ai/press/series-b", title: "Xanadu closes $100M Series B to build a quantum computer", text: TEXT };
    const d = deps({ search: [xanadu] });
    const r = round({ sources: [{ url: "https://app.dealroom.co/companies/bleximo" }] });
    const { report: out } = await enrichRounds(report([r], "Quantum Computing"), d);
    expect(d.gemini.extract).not.toHaveBeenCalled();
    expect(only(out)).toEqual(r);
  });

  it("skips Cala entities that aren't one company", async () => {
    const r = report([round()]);
    r.portfolio[0].calaId = "439fe7e2-930f-4a07-bc23-7df212cfc3a7";
    const d = deps();
    expect(only((await enrichRounds(r, d)).report)).toEqual(round());
    expect(d.exa.pages).not.toHaveBeenCalled();
  });

  it("leaves the round unchanged when no page is about it, when it has no date, or when Gemini fails", async () => {
    const notAbout = await enrichRounds(report([round()]), deps({ extract: { about: false } }));
    expect(only(notAbout.report)).toEqual(round());
    const undated = deps();
    const r = await enrichRounds(report([round({ date: undefined })]), undated);
    expect(only(r.report)).toEqual(round({ date: undefined }));
    expect(undated.gemini.extract).not.toHaveBeenCalled();
    const failing = deps();
    failing.gemini.extract.mockRejectedValue(new Error("429"));
    const f = await enrichRounds(report([round()]), failing);
    expect(only(f.report)).toEqual(round());
    expect(f.stats).toMatchObject({ rounds: 1, enriched: 0, failed: 1 });
  });

  it("extracts each article once even when Cala lists the same round twice", async () => {
    const d = deps();
    const { report: out, stats } = await enrichRounds(report([round(), round({ calaId: "r2" })]), d);
    expect(d.gemini.extract).toHaveBeenCalledTimes(1);
    expect(out.portfolio[0].rounds.every((r) => r.fundIsLead === true)).toBe(true);
    expect(stats).toMatchObject({ rounds: 2, enriched: 2 });
  });
});
