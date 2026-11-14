// Shared contract between the data pipeline (lib/) and the UI (app/). Change only by agreement (D10).
// Rule (D6): every claim is a neutral, sourced fact. No "failed"/"dead" verdicts anywhere.

export interface Source {
  url: string;
  name?: string;
  date?: string; // ISO date, as precise as the source gives
}

/** A Cala entity that matched the user's fund name (D18: the user picks one). */
export interface FundMatch {
  calaId: string;
  name: string;
  description?: string;
}

export interface Round {
  calaId: string;
  label: string; // "Seed", "Series A", "Funding Round"…
  date?: string; // ISO
  amount?: string; // as reported, e.g. "€2M"
  fundIsLead: boolean | null; // null = Cala doesn't say
  coInvestors: string[];
  sources: Source[];
}

/** Neutral fact about a portfolio company (D6, D21). */
export interface Signal {
  kind:
    | "last_round" // "Last recorded round: Seed, Mar 2023"
    | "fund_led" // "Fund led the Seed round (Nov 2022)"
    | "news_event" // "Reported layoffs (TechCrunch, Jun 2025)"
    | "status"; // Cala operational_status, e.g. "Cala status: ACTIVE"
  text: string;
  date?: string;
  sources: Source[];
}

export interface Founder {
  name: string;
  linkedinUrl?: string;
  /** Where the founder link came from (D14b, D20). "exa+gemini" is a legacy name: means Exa workHistory rule; UI shows "via web". */
  via: "cala" | "exa+gemini";
  /** Proof of the founder role, e.g. "Co-Founder, Alvin" (Exa workHistory) or "Cala: FOUNDED". */
  evidence?: string;
  sources: Source[];
}

/** Founder's own public words about the fund (bonus, D7/D22). Never from the fund's own domain. */
export interface FounderWriting {
  title: string;
  url: string;
  date?: string;
  quote: string;
}

export interface PortfolioCompany {
  calaId: string;
  name: string;
  description?: string;
  rounds: Round[]; // newest first
  lastRoundDate?: string; // ISO, newest round any investor
  signals: Signal[];
  founders: Founder[];
  sources: Source[]; // why Cala links this company to the fund
  /** pending = not fetched yet; unavailable = data source gave up (429s) or time budget hit (D17). */
  state: "pending" | "enriched" | "unavailable";
}

/** Neutral grouping by fact, never by verdict (D6). */
export type CallGroup =
  | "no_recent_round" // last recorded round > 24 months ago
  | "news_event" // news of shutdown / acquisition / layoffs found
  | "recent_round"; // follow-on round in last 24 months (the "happy" references)

export interface CallListEntry {
  companyId: string;
  companyName: string;
  founder: Founder;
  group: CallGroup;
  why: Signal[]; // the facts that put this entry on the list
  questions: string[]; // 3, grounded only in `why` (D4)
  writing: FounderWriting[]; // always [] in v1 (out of scope); kept for later
}

export interface Report {
  fund: FundMatch;
  generatedAt: string; // ISO
  complete: boolean;
  portfolio: PortfolioCompany[];
  callList: CallListEntry[];
  mock?: true; // set on hand-built fixtures
}

/** Server → client stream (D12): NDJSON, one event per line. Protocol rules: docs/spec.md "Stream protocol". */
export type StreamEvent =
  | { type: "progress"; message: string }
  | { type: "portfolio"; fund: FundMatch; companies: PortfolioCompany[] } // instant, unenriched
  | { type: "company"; company: PortfolioCompany } // one company enriched
  | { type: "entry"; entry: CallListEntry }
  | { type: "done"; report: Report }
  | { type: "error"; message: string };
