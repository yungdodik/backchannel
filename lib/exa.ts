import ExaClient from "exa-js";

// Raw Exa result; the pipeline applies the rules (D20b, D22), not the adapter.
export interface ExaResult {
  url: string;
  title?: string;
  publishedDate?: string;
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
}

const MAX = 5;
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

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
  };
}
