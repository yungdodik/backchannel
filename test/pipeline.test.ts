import { describe, expect, it } from "vitest";
import { createPipeline, type PipelineDeps } from "@/lib/pipeline";
import { CalaGaveUp, type Cala, type CalaEntity } from "@/lib/cala";
import type { Exa, ExaResult } from "@/lib/exa";
import type { StreamEvent } from "@/lib/types";
import walk from "@/test/fixtures/cala/walk_icebreaker.json";
import vespia from "@/test/fixtures/cala/company_vespia.json";
import klaus from "@/test/fixtures/cala/company_klaus.json";
import flowhaven from "@/test/fixtures/cala/company_flowhaven.json";
import probe from "@/test/fixtures/exa/exa_probe.json";
import newsKlaus from "@/test/fixtures/exa/news_klaus.json";
import questions from "@/test/fixtures/gemini/questions.json";

const FUND = "70fb3317-cd8c-4c52-aa86-66502789bce3";
const ALVIN = "18b35d73-";
const KLAUS = "2fcbdac0-4027-4b78-8a5b-67a99447ca81";
const empty = (): CalaEntity => ({ properties: {}, relationships: { outgoing: {}, incoming: {} } });
const BANNED = /\b(fail(ed|ure)?|dead|died)\b/i;

// Alvin has no Cala fixture; give it one dated round so it gets a group and runs the Exa founder rule.
const alvin: CalaEntity = {
  ...empty(),
  relationships: {
    incoming: {},
    outgoing: {
      PARTICIPATES_IN_CORPORATE_EVENT: [
        {
          id: "alvin-round",
          name: "FINANCING_RAISED_OR_FACILITY_ENTERED",
          entity_type: "PrivateCompanyFundingRound",
          properties: { event_date: "2021-01-28", sources: [{ document: "https://example.com/alvin", date: "2021-01-28" }] },
        },
      ],
    },
  },
};

// Riku Seppälä regression: make him look like an Alvin co-founder too; he must still be excluded.
const peopleAlvin = structuredClone(probe.people_Alvin.results) as unknown as ExaResult[];
const riku = peopleAlvin.find((r) => r.title === "Riku Seppälä")!;
riku.entities![0].properties!.workHistory!.unshift({ title: "Co-Founder", company: { name: "Alvin" } });
peopleAlvin.unshift(peopleAlvin.splice(peopleAlvin.indexOf(riku), 1)[0]);

function fakeCala(overrides: Record<string, CalaEntity> = {}): Cala {
  const byId: Record<string, unknown> = { [FUND]: walk, [vespia.id]: vespia, [KLAUS]: klaus, [flowhaven.id]: flowhaven };
  return {
    searchEntities: async () => ({ entities: [] }),
    getEntity: async (id) => {
      const o = Object.entries(overrides).find(([k]) => id.startsWith(k))?.[1];
      return (o ?? byId[id] ?? (id.startsWith(ALVIN) ? alvin : empty())) as CalaEntity;
    },
  };
}

const fakeExa: Exa = {
  searchPeople: async (q) => {
    if (/^founder of alvin( |$)/.test(q)) return peopleAlvin;
    const key = Object.keys(probe).find((k) => k.startsWith("people_") && new RegExp(`^founder of ${k.slice(7).toLowerCase()}( |$)`).test(q));
    return key ? ((probe as Record<string, { results: unknown[] }>)[key].results as ExaResult[]) : [];
  },
  searchNews: async (q) => (q.startsWith('"klaus"') ? (newsKlaus as unknown as ExaResult[]) : []),
};

function deps(over: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    cala: fakeCala(),
    exa: fakeExa,
    gemini: { questions: async () => questions as string[] },
    now: () => new Date("2026-11-14T12:00:00Z"),
    budgetMs: 60_000,
    ...over,
  };
}

async function collect(it: AsyncIterable<StreamEvent>) {
  const events: StreamEvent[] = [];
  for await (const e of it) events.push(e);
  return events;
}

function assertProtocol(events: StreamEvent[]) {
  const types = events.map((e) => e.type);
  const p = types.indexOf("portfolio");
  expect(types.slice(0, p).every((t) => t === "progress")).toBe(true);
  expect(types.filter((t) => t === "portfolio")).toHaveLength(1);
  expect(types.slice(p + 1, -1).every((t) => ["company", "entry", "progress"].includes(t))).toBe(true);
  expect(["done", "error"]).toContain(types.at(-1));
  expect(types.filter((t) => t === "done" || t === "error")).toHaveLength(1);
}

const doneReport = (events: StreamEvent[]) => {
  const last = events.at(-1)!;
  if (last.type !== "done") throw new Error(`expected done, got ${JSON.stringify(last)}`);
  return last.report;
};

describe("createPipeline on Icebreaker fixtures", () => {
  it("streams in protocol order and builds the expected call list", async () => {
    const events = await collect(createPipeline(deps()).run(FUND));
    assertProtocol(events);
    const portfolio = events.find((e) => e.type === "portfolio")!;
    expect(portfolio.type === "portfolio" && portfolio.companies).toHaveLength(58);

    const report = doneReport(events);
    expect(report.complete).toBe(true);
    expect(report.fund.name).toBe("Icebreaker.vc");
    expect(report.portfolio.every((c) => c.state === "enriched")).toBe(true);
    expect(report.callList.map((e) => [e.companyName, e.founder.name, e.group]).sort()).toEqual(
      [
        ["Alvin", "Dan Mashiter", "no_recent_round"],
        ["Alvin", "Martin Abelson Sahlen", "no_recent_round"],
        ["Klaus", "Kair Käsper", "news_event"],
        ["Vespia OÜ", "Anton Vedeshin", "news_event"],
        ["Vespia OÜ", "Julia Ront", "news_event"],
      ].sort(),
    );
    expect(events.filter((e) => e.type === "entry")).toHaveLength(5);
  });

  it("Vespia is a news_event from the Cala acquisition, founders from Cala", async () => {
    const report = doneReport(await collect(createPipeline(deps()).run(FUND)));
    const v = report.callList.filter((e) => e.companyName === "Vespia OÜ");
    expect(v[0].why.find((s) => s.kind === "news_event")?.text).toBe("Reported acquisition (balticvc.com, 2026-02)");
    expect(v.map((e) => [e.founder.via, e.founder.evidence])).toEqual([
      ["cala", "Cala: FOUNDED"],
      ["cala", "Cala: FOUNDED"],
    ]);
  });

  it("Alvin: exact name match only, fund partner excluded", async () => {
    const report = doneReport(await collect(createPipeline(deps()).run(FUND)));
    const a = report.callList.filter((e) => e.companyName === "Alvin");
    expect(a.map((e) => e.founder.name)).toEqual(["Martin Abelson Sahlen", "Dan Mashiter"]);
    expect(a[0].founder).toMatchObject({
      via: "exa+gemini",
      evidence: "Co-Founder, Alvin",
      linkedinUrl: "https://linkedin.com/in/martinsahlen",
    });
    const all = report.callList.map((e) => e.founder.name);
    for (const n of ["Riku Seppälä", "Winston Reid", "Ben Ng"]) expect(all).not.toContain(n);
  });

  it("every entry has 3 clean questions and every signal/founder is sourced", async () => {
    const report = doneReport(await collect(createPipeline(deps()).run(FUND)));
    for (const e of report.callList) {
      expect(e.questions).toHaveLength(3);
      for (const q of e.questions) expect(q).not.toMatch(BANNED);
      expect(e.founder.sources.every((s) => s.url)).toBe(true);
      expect(e.founder.sources.length).toBeGreaterThan(0);
      for (const s of e.why) expect(s.sources.length && s.sources.every((x) => x.url)).toBeTruthy();
    }
  });

  it("news step: a company with no dated round gets Exa news and a group", async () => {
    const report = doneReport(await collect(createPipeline(deps({ cala: fakeCala({ [KLAUS]: empty() }) })).run(FUND)));
    const k = report.portfolio.find((c) => c.calaId === KLAUS)!;
    expect(k.signals.map((s) => s.text)).toEqual(["Reported acquisition (techcrunch.com, 2024-02)"]);
    expect(k.signals[0].sources.map((s) => s.url)).toEqual([
      "https://techcrunch.com/2024/02/13/ai-powered-estonian-qa-startup-klaus-acquired-by-zendesk/",
      "https://www.prnewswire.com/news-releases/zendesk-signs-definitive-agreement-to-acquire-klaus-302028693.html",
      "https://martechseries.com/predictive-ai/ai-platforms-machine-learning/zendesk-completes-acquisition-of-klaus/",
    ]);
    expect(report.callList.some((e) => e.companyId === KLAUS && e.group === "news_event")).toBe(true);
  });

  it("acquisition news counts only when the company is the one acquired", async () => {
    const news = (title: string): ExaResult[] => [{ url: "https://news.example/a", title, publishedDate: "2025-01-10T00:00:00Z" }];
    const runWith = async (title: string) => {
      const exa: Exa = { ...fakeExa, searchNews: async (q) => (q.startsWith('"klaus"') ? news(title) : []) };
      const report = doneReport(await collect(createPipeline(deps({ exa, cala: fakeCala({ [KLAUS]: empty() }) })).run(FUND)));
      return report.portfolio.find((c) => c.calaId === KLAUS)!.signals.map((s) => s.text);
    };
    expect(await runWith("Klaus acquires Promoty to grow in the Nordics")).toEqual([]);
    expect(await runWith("Zendesk to acquire Klaus")).toEqual(["Reported acquisition (news.example, 2025-01)"]);
    expect(await runWith("Klaus has been acquired by Zendesk")).toEqual(["Reported acquisition (news.example, 2025-01)"]);
    expect(await runWith("Completed: the acquisition of Klaus")).toEqual(["Reported acquisition (news.example, 2025-01)"]);
  });

  it("employee reviews and blocklisted namesake URLs are not news", async () => {
    const exa: Exa = {
      ...fakeExa,
      searchNews: async (q) =>
        q.startsWith('"klaus"')
          ? [
              { url: "https://www.glassdoor.com/Reviews/Klaus-RVW1.htm", title: "Klaus - nice people but a lot of layoffs", publishedDate: "2025-01-10T00:00:00Z" },
              { url: "https://abc13.com/post/2-alvin-isd-elementary-schools-shut-down-early-summer-following-storm-damage/19139599/", title: "Klaus shut down", publishedDate: "2025-01-10T00:00:00Z" },
            ]
          : [],
    };
    const report = doneReport(await collect(createPipeline(deps({ exa, cala: fakeCala({ [KLAUS]: empty() }) })).run(FUND)));
    expect(report.portfolio.find((c) => c.calaId === KLAUS)!.signals).toEqual([]);
  });

  it("news needs the company name in the title, not just the highlights", async () => {
    const exa: Exa = {
      ...fakeExa,
      searchNews: async (q) =>
        q.startsWith('"klaus"')
          ? [{ url: "https://news.example/b", title: "Brewery to shut down this weekend", highlights: ["Klaus Brewing Co. is closing"], publishedDate: "2025-01-10T00:00:00Z" }]
          : [],
    };
    const report = doneReport(await collect(createPipeline(deps({ exa, cala: fakeCala({ [KLAUS]: empty() }) })).run(FUND)));
    expect(report.portfolio.find((c) => c.calaId === KLAUS)!.signals).toEqual([]);
  });

  it("one entry per founder: Cala duplicates and same-name company entities collapse", async () => {
    const person = { id: "p1", name: "Richard Nordström", entity_type: "Person", properties: { sources: [{ document: "https://hemby.com/team" }] } };
    const round = {
      id: "r1",
      name: "FINANCING_RAISED_OR_FACILITY_ENTERED",
      entity_type: "PrivateCompanyFundingRound",
      properties: { event_date: "2021-03-01", sources: [{ document: "https://x.com/r", date: "2021-03-01" }] },
    };
    const twin: CalaEntity = {
      properties: {},
      relationships: { outgoing: { PARTICIPATES_IN_CORPORATE_EVENT: [round] }, incoming: { FOUNDED: [person], IS_CEO_OF: [person] } },
    };
    // FLOWHAVEN OY (020ce4f1) and Flowhaven Oy (da87c715) are two Cala entities for one company.
    const report = doneReport(
      await collect(createPipeline(deps({ cala: fakeCala({ "020ce4f1": twin, "da87c715": twin, "32d9d83a": twin }) })).run(FUND)),
    );
    // Helppy (32d9d83a) stands in for IQM / "IQM Quantum Computers Oyj": different names, same people.
    expect(report.callList.filter((e) => e.founder.name === "Richard Nordström")).toHaveLength(1);
    expect(report.portfolio.find((c) => c.calaId.startsWith("020ce4f1"))!.founders).toHaveLength(1);
  });

  it("a company Cala gave up on is retried once at the end", async () => {
    const base = fakeCala();
    let vespiaCalls = 0;
    const cala: Cala = {
      ...base,
      getEntity: async (id, p, o) => {
        if (id === vespia.id && vespiaCalls++ === 0) throw new CalaGaveUp("429");
        return base.getEntity(id, p, o);
      },
    };
    const report = doneReport(await collect(createPipeline(deps({ cala })).run(FUND)));
    expect(vespiaCalls).toBe(2);
    expect(report.portfolio.find((c) => c.calaId === vespia.id)!.state).toBe("enriched");
    expect(report.callList.filter((e) => e.companyName === "Vespia OÜ")).toHaveLength(2);
  });

  it("budget stop: remaining companies unavailable, complete false", async () => {
    let t = Date.parse("2026-11-14T12:00:00Z");
    const now = () => new Date((t += 1000));
    const events = await collect(createPipeline(deps({ now, budgetMs: 10_000 })).run(FUND));
    assertProtocol(events);
    const report = doneReport(events);
    expect(report.complete).toBe(false);
    expect(events.some((e) => e.type === "progress" && e.message === "Stopped early; showing what was found")).toBe(true);
    expect(report.portfolio.some((c) => c.state === "unavailable")).toBe(true);
    expect(report.portfolio.some((c) => c.state === "enriched")).toBe(true);
  });

  it("a Cala failure on the fund is a single terminal error", async () => {
    const cala: Cala = { searchEntities: async () => ({ entities: [] }), getEntity: async () => Promise.reject(new Error("boom")) };
    const events = await collect(createPipeline(deps({ cala })).run(FUND));
    expect(events.at(-1)).toEqual({ type: "error", message: "boom" });
    expect(events.slice(0, -1).every((e) => e.type === "progress")).toBe(true);
  });
});
