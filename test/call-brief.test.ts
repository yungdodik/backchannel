import { describe, expect, it } from "vitest";
import { callBrief, contactLink, contactRole, groundedQuestions, INTRO_MAX, introMessage, shortlist } from "@/lib/call-brief";
import type { CallListEntry } from "@/lib/types";
const entry = (company: string, group: CallListEntry["group"], person = company, linked = false): CallListEntry => ({
  companyId: company, companyName: company, group,
  founder: { name: person, via: "cala", evidence: "Cala: FOUNDED", sources: [{ url: "https://example.com/person" }], linkedinUrl: linked ? "https://linkedin.com/in/person" : undefined },
  why: [{ kind: "last_round", text: "Last recorded round: 2021-01", date: "2021-01-01", sources: [{ url: "https://example.com/round" }] }], questions: ["One?", "Two?", "Three?"], writing: [],
});
describe("reference shortlist", () => {
  it("uses different companies and experiences, preferring a direct contact within each group", () => {
    const entries = [entry("A", "news_event", "A1"), entry("A", "news_event", "A2", true), entry("B", "no_recent_round"), entry("C", "recent_round"), entry("D", "recent_round")];
    expect(shortlist(entries).map((e) => e.founder.name)).toEqual(["A2", "B", "C"]);
    expect(shortlist([...entries].reverse())).toEqual(shortlist(entries));
  });
  it("does not fill the list with aliases of the same company or unsourced contacts", () => {
    const a = entry("Acme Oy", "recent_round");
    const b = entry("Acme", "recent_round");
    const unsourced = entry("Other", "news_event"); unsourced.founder.sources = [];
    expect(shortlist([a, b, unsourced])).toHaveLength(1);
  });
  it("labels CEOs correctly and provides an explicitly searched contact fallback", () => {
    const e = entry("Acme & Co", "recent_round", "Ann Lee"); e.founder.evidence = "Cala: IS_CEO_OF";
    expect(contactRole(e.founder)).toBe("CEO");
    expect(new URL(contactLink(e)).searchParams.get("keywords")).toBe("Ann Lee Acme & Co");
    const brief = callBrief("Fund", [e]);
    expect(brief).toContain("Ann Lee · CEO · Acme & Co");
    expect(brief).toContain("profile not verified");
    expect(brief).toContain("https://example.com/round");
    expect(brief).toContain("1. One?");
  });
  it("asks about recorded events without presuming a board role", () => {
    const qs = groundedQuestions("Fund", entry("Acme", "recent_round").why);
    expect(qs).toHaveLength(3); expect(qs[0]).toContain("2021-01"); expect(qs.join(" ")).not.toContain("board");
  });
});

describe("introMessage", () => {
  const entry = (name: string, evidence: string, company = "Alvin"): CallListEntry => ({
    companyId: "c", companyName: company, group: "news_event", questions: [], writing: [],
    why: [{ kind: "news_event", text: "Reported acquisition (techcrunch.com, 2024-02)", sources: [] }],
    founder: { name, via: "cala", evidence, sources: [] },
  });

  it("is short, neutral and personal", () => {
    const m = introMessage("Icebreaker.vc", entry("Kair Käsper", "Co-Founder, Alvin"));
    expect(m).toMatch(/^Hi Kair, /);
    expect(m).toContain("Icebreaker.vc");
    expect(m).toContain("as a founder of Alvin");
    expect(m).not.toMatch(/acqui|fail|layoff|shut/i);
    expect(m.length).toBeLessThanOrEqual(INTRO_MAX);
  });

  it("falls back to a shorter message for long names", () => {
    const m = introMessage("A".repeat(120), entry("Jo", "CEO", "B".repeat(120)));
    expect(m.length).toBeLessThanOrEqual(INTRO_MAX);
  });
});
