import { describe, expect, it } from "vitest";
import { analyseCompany, normalise } from "@/lib/signals";
import type { CalaEntity, CalaLink } from "@/lib/cala";
import vespia from "@/test/fixtures/cala/company_vespia.json";
import klaus from "@/test/fixtures/cala/company_klaus.json";
import flowhaven from "@/test/fixtures/cala/company_flowhaven.json";

const now = new Date("2026-11-14T12:00:00Z");
const fundName = "Icebreaker.vc";

const link = (id: string, props: CalaLink["properties"]): CalaLink => ({
  id,
  name: "FINANCING_RAISED_OR_FACILITY_ENTERED",
  entity_type: "PrivateCompanyFundingRound",
  properties: props,
});
const company = (links: CalaLink[], properties: CalaEntity["properties"] = {}): CalaEntity => ({
  properties,
  relationships: { outgoing: { PARTICIPATES_IN_CORPORATE_EVENT: links }, incoming: {} },
});
const run = (entity: unknown, fundRounds: CalaLink[] = [], news = []) =>
  analyseCompany({ entity: entity as CalaEntity, fundRounds, fundName, news }, now);

describe("normalise", () => {
  it.each([
    ["FLOWHAVEN OY", "flowhaven"],
    ["Vespia OÜ", "vespia"],
    ["Modash OÜ", "modash"],
    ["Acme Holdings Ltd.", "acme holdings"],
    ["  Alvin   Technologies, Inc. ", "alvin technologies"],
    ["Icebreaker.vc", "icebreaker vc"],
  ])("%s → %s", (raw, expected) => expect(normalise(raw)).toBe(expected));
});

describe("analyseCompany", () => {
  it("Vespia: acquisition becomes a news_event, not a round", () => {
    const r = run(vespia);
    expect(r.rounds.map((x) => [x.calaId, x.date])).toEqual([["ccfec275-1d74-497d-94c4-bbd3a43320d5", "2026-02-05"]]);
    expect(r.rounds[0]).toMatchObject({ label: "Funding round", fundIsLead: null, coInvestors: [] });
    expect(r.signals.map((s) => [s.kind, s.text])).toEqual([
      ["last_round", "Last recorded round: 2026-02"],
      ["news_event", "Reported acquisition (balticvc.com, 2026-02)"],
    ]);
    expect(r.signals[1].sources.map((s) => s.url)).toEqual([
      "https://www.balticvc.com/2026/02/estonian-icebreakervc-exits-from-vespia.html",
      "https://www.estvca.ee/news/exit-icebreaker-vc-portfolio-company-vespia-has-been-acquired-by-veriff",
    ]);
    expect(r.group).toBe("news_event");
  });

  it("Klaus: dated rounds with an acquisition source stay rounds and also yield the news", () => {
    const r = run(klaus);
    expect(r.rounds.map((x) => x.date)).toEqual(["2022-09-29", "2019-07-03"]);
    expect(r.rounds[0].sources.map((s) => s.url)).not.toContain(
      "https://techcrunch.com/2024/02/13/ai-powered-estonian-qa-startup-klaus-acquired-by-zendesk",
    );
    expect(r.lastRoundDate).toBe("2022-09-29");
    expect(r.signals.map((s) => s.text)).toEqual([
      "Last recorded round: 2022-09",
      "Reported acquisition (techcrunch.com, 2024-02)",
    ]);
    expect(r.signals[1].sources).toHaveLength(1);
    expect(r.group).toBe("news_event");
  });

  it("Flowhaven: last round 2021-01 → no_recent_round, with Cala status", () => {
    const r = run(flowhaven);
    expect(r.rounds.map((x) => x.date)).toEqual(["2021-01-28", "2020-04-26"]);
    expect(r.signals.map((s) => [s.kind, s.text])).toEqual([
      ["last_round", "Last recorded round: 2021-01"],
      ["status", "Cala status: ACTIVE"],
    ]);
    expect(r.signals[1].sources[0].url).toBe(
      "https://find-and-update.company-information.service.gov.uk/company/FC037274",
    );
    expect(r.group).toBe("no_recent_round");
  });

  it("24-month boundary: exactly 24 months is recent, one day more is not", () => {
    const at = (d: string) => run(company([link("r", { event_date: d, sources: [{ document: "https://x.com/a", date: d }] })]));
    expect(at("2024-11-14").group).toBe("recent_round");
    expect(at("2024-11-13").group).toBe("no_recent_round");
  });

  it("no dated round and no news → no group", () => {
    const r = run(company([], { operational_status: { value: "ACTIVE", sources: [{ document: "https://reg.example/1" }] } }));
    expect(r.rounds).toEqual([]);
    expect(r.group).toBeNull();
    expect(run(company([])).group).toBeNull();
  });

  it("a -01-01 event_date falls back to the earliest source date", () => {
    const r = run(
      company([
        link("r", {
          event_date: "2019-01-01",
          sources: [
            { document: "https://en.ain.ua/2022/11/24/modash-closes-2m-round", date: "2022-11-24" },
            { document: "https://tech.eu/2022/11/23/modash/", date: "2022-11-23" },
          ],
        }),
      ]),
    );
    expect(r.rounds[0].date).toBe("2022-11-23");
  });

  it("drops sources with an empty document, and anything left without a source", () => {
    const r = run(
      company(
        [
          link("kept", { event_date: "2025-03-02", sources: [{ name: "Cala AI", document: "" }, { document: "https://a.com/x" }] }),
          link("gone", { event_date: "2025-06-01", sources: [{ name: "Cala AI", document: "", date: "2025-06-01" }] }),
        ],
        { operational_status: { value: "ACTIVE", sources: [{ name: "Cala AI", document: "" }] } },
      ),
    );
    expect(r.rounds.map((x) => [x.calaId, x.sources.map((s) => s.url)])).toEqual([["kept", ["https://a.com/x"]]]);
    expect(r.signals.map((s) => s.kind)).toEqual(["last_round"]);
  });

  it("fund_led: joins fund rounds to company rounds by shared source URL", () => {
    const doc = "https://tech.eu/2022/11/23/modash/";
    const fundRound = (id: string, is_lead: boolean, document: string) =>
      ({ id, name: "Seed", entity_type: "FundingRound", properties: { is_lead, sources: [{ document, date: "2022-11-23" }] } }) as CalaLink;
    const co = company([
      link("led", { event_date: "2022-11-23", sources: [{ document: doc, date: "2022-11-23" }] }),
      link("followed", { event_date: "2023-06-01", sources: [{ document: "https://b.com/follow", date: "2023-06-01" }] }),
      link("unknown", { event_date: "2024-01-10", sources: [{ document: "https://c.com/other", date: "2024-01-10" }] }),
    ]);
    const r = run(co, [fundRound("f1", true, doc), fundRound("f2", false, "https://b.com/follow")]);
    expect(r.rounds.map((x) => [x.calaId, x.fundIsLead])).toEqual([
      ["unknown", null],
      ["followed", false],
      ["led", true],
    ]);
    expect(r.signals.filter((s) => s.kind === "fund_led").map((s) => s.text)).toEqual(["Icebreaker.vc led a round (2022-11)"]);
  });

  it("news signals passed in put the company in news_event", () => {
    const news = [{ kind: "news_event" as const, text: "Reported layoffs (yle.fi, 2025-04)", sources: [{ url: "https://yle.fi/a" }] }];
    const r = analyseCompany({ entity: company([]), fundRounds: [], fundName, news }, now);
    expect(r.group).toBe("news_event");
    expect(r.signals).toEqual(news);
  });
});
