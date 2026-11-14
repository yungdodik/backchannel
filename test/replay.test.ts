import { describe, expect, it } from "vitest";
import mock from "@/mock/icebreaker.json";
import { assertReport, reportToEvents } from "@/lib/replay";

type Loose = { portfolio: { state?: string; rounds: { fundIsLead?: unknown }[] }[] };
const clone = () => structuredClone(mock) as unknown as Loose;

describe("mock/icebreaker.json", () => {
  it("matches the contract", () => {
    expect(() => assertReport(mock)).not.toThrow();
  });

  it("replays in protocol order", () => {
    assertReport(mock);
    const ev = reportToEvents(mock);
    expect(ev).toHaveLength(14);
    expect(ev[0].type).toBe("progress");
    expect(ev[1].type).toBe("portfolio");
    expect(ev[1].type === "portfolio" && ev[1].companies).toHaveLength(58);
    expect(ev.filter((e) => e.type === "portfolio")).toHaveLength(1);
    expect(ev.slice(2, 13).every((e) => e.type === "entry")).toBe(true);
    expect(ev[13]).toEqual({ type: "done", report: mock });
  });
});

describe("assertReport", () => {
  it("rejects a round without fundIsLead", () => {
    const r = clone();
    const c = r.portfolio.find((c) => c.rounds.length)!;
    delete c.rounds[0].fundIsLead;
    expect(() => assertReport(r)).toThrow(/fundIsLead/);
  });

  it("rejects a company without state", () => {
    const r = clone();
    delete r.portfolio[0].state;
    expect(() => assertReport(r)).toThrow(/state/);
  });
});
