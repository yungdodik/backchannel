import type { CallListEntry, FundMatch, PortfolioCompany, Report, StreamEvent } from "@/lib/types";

export interface ReportState {
  fund?: FundMatch;
  companies: PortfolioCompany[];
  entries: CallListEntry[];
  progress?: string;
  error?: string;
  /** Set once `done` arrives. */
  complete?: boolean;
  /** The final report, once `done` arrives. */
  report?: Report;
}

/** Folds the events received so far into what the page shows. */
export function deriveReport(events: StreamEvent[]): ReportState {
  const s: ReportState = { companies: [], entries: [] };
  for (const ev of events) {
    switch (ev.type) {
      case "progress":
        s.progress = ev.message;
        break;
      case "portfolio":
        s.fund = ev.fund;
        s.companies = ev.companies;
        break;
      case "company":
        s.companies = s.companies.map((c) => (c.calaId === ev.company.calaId ? ev.company : c));
        break;
      case "entry":
        s.entries = [...s.entries, ev.entry];
        break;
      case "done": // authoritative: replaces everything streamed so far
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
  return s;
}
