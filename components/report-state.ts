import type { CallListEntry, FundMatch, PortfolioCompany, Report, StreamEvent } from "@/lib/types";

export interface ReportState {
  fund?: FundMatch;
  companies: PortfolioCompany[];
  entries: CallListEntry[];
  progress?: string;
  /** "Cala: N companies and M rounds … in X s" from a live run; kept after later progress messages. */
  calaLine?: string;
  /** How many companies this run will check; fewer than `companies.length` when a live run is capped. */
  planned?: number;
  /** Companies checked so far (no longer pending). Once `done` arrives it stays at what the run reached. */
  checked: number;
  error?: string;
  /** Set once `done` arrives. */
  complete?: boolean;
  /** The final report, once `done` arrives. */
  report?: Report;
}

/** Folds the events received so far into what the page shows. */
export function deriveReport(events: StreamEvent[]): ReportState {
  const s: ReportState = { companies: [], entries: [], checked: 0 };
  const count = (cs: PortfolioCompany[]) => cs.filter((c) => c.state === "enriched" || c.state === "unavailable").length;
  let listed = false;
  for (const ev of events) {
    switch (ev.type) {
      case "progress":
        s.progress = ev.message;
        if (ev.message.startsWith("Cala: ")) s.calaLine = ev.message;
        break;
      case "portfolio":
        s.fund = ev.fund;
        s.companies = ev.companies;
        s.planned = ev.planned;
        listed = true;
        break;
      case "company":
        s.companies = s.companies.map((c) => (c.calaId === ev.company.calaId ? ev.company : c));
        break;
      case "entry":
        s.entries = [...s.entries, ev.entry];
        break;
      case "done": // authoritative: replaces everything streamed so far
        // the final report marks companies the run never reached as unavailable, so count before it replaces them
        s.checked = listed ? count(s.companies) : count(ev.report.portfolio);
        s.fund = ev.report.fund;
        s.companies = ev.report.portfolio;
        s.entries = ev.report.callList;
        s.complete = ev.report.complete;
        s.report = ev.report;
        s.progress = undefined;
        break;
      case "error":
        s.error = ev.message;
        break;
    }
  }
  if (s.complete === undefined) s.checked = count(s.companies);
  return s;
}
