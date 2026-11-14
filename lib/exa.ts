import ExaClient from "exa-js";
import { limiter } from "@/lib/limit";

// Raw Exa result; the pipeline applies the rules (D20b, D22), not the adapter.
export interface ExaResult {
  url: string;
  title?: string;
  publishedDate?: string;
  text?: string;
  highlights?: string[];
  entities?: {
    properties?: {
      name?: string;
      workHistory?: { title?: string | null; company?: { name?: string } | null }[] | null;
    };
  }[];
}

export interface Exa {
  searchPeople(query: string): Promise<ExaResult[]>;
  searchNews(query: string, opts: { startPublishedDate: string; excludeDomains: string[] }): Promise<ExaResult[]>;
  /** Page text for known URLs (round sources). */
  pages(urls: string[]): Promise<ExaResult[]>;
  /** Round announcements with page text, published in the window. */
  searchRound(query: string, opts: { startPublishedDate: string; endPublishedDate: string }): Promise<ExaResult[]>;
}

const limited = limiter(5);
const TEXT = { text: { maxCharacters: 8000 } }; // round announcements fit; keeps Gemini prompts small

export function createExa(apiKey: string): Exa {
  const exa = new ExaClient(apiKey);
  return {
    // category "people" returns `entities` (workHistory) by default; no contents option needed.
    searchPeople: (query) =>
      limited(async () => (await exa.search(query, { type: "auto", category: "people", numResults: 5 })).results as ExaResult[]),
    searchNews: (query, opts) =>
      limited(async () =>
        (await exa.search(query, { type: "auto", numResults: 5, contents: { highlights: true }, ...opts })).results as ExaResult[],
      ),
    pages: (urls) => limited(async () => (await exa.getContents(urls, TEXT)).results as ExaResult[]),
    searchRound: (query, opts) =>
      limited(async () => (await exa.search(query, { type: "auto", numResults: 2, contents: TEXT, ...opts })).results as ExaResult[]),
  };
}
