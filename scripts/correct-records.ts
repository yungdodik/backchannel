// Hand-checked corrections to the committed reports. No API calls; never refreshes generatedAt.
// Each rule removes a record whose own linked source does not support it (D6: no source, don't show it).
// Run: npx tsx scripts/correct-records.ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { groundedQuestions } from "../lib/call-brief";
import { NEWS_BLOCKLIST } from "../lib/news-blocklist";
import { assertReport } from "../lib/replay";
import { groupFor } from "../lib/signals";
import type { CallListEntry, Report } from "../lib/types";

/** Second and third Cala entities for a company the same report already lists: dropped only when `keep` is present. */
const DUPLICATES: { drop: string; keep: string }[] = [
  { drop: "03d55b53-cbac-4522-9954-fd3c648082e7", keep: "80b4b97c-8d48-4d53-9be9-2c27c8cbc60c" }, // "Exa Labs Inc.", no founders
  { drop: "3ef9236e-ee25-4458-bafc-705fe395c34d", keep: "80b4b97c-8d48-4d53-9be9-2c27c8cbc60c" }, // "Exa Labs Inc.", founder spelt "Will Bryn"
];
/** company id → contact names whose link to that company the cited source does not show. */
const NOT_A_CONTACT: Record<string, string[]> = {
  "8904884a-6a30-40a1-b839-dfddf82c7b0c": ["J. Frederic Kerrest"], // Okta: the same person as "Frederic Kerrest"
  "3ca364cf-e0a9-4366-928b-0d421a5e12f7": ["Nick Frosst"], // Character.AI: the cited article is about another startup of ex-Google staff
  "33957acc-7949-457f-a49a-7b7bd377097a": ["Kristy Rod"], // Figma: only a self-described LinkedIn title
  "27e97cdc-e78c-49f0-9260-33b132137db6": ["Kristy Rod"],
};
/** company id → round ids whose sources describe a different deal. */
const NOT_ITS_ROUND: Record<string, string[]> = {
  "45f15b76-f6f0-44bb-b5f7-1f8129380471": ["369db5b7-5909-40cf-9387-49d76aa345c2"], // Airbnb: articles are about Airbnb investing in Zeus
};
const ym = (d?: string) => d?.slice(0, 7);

for (const f of readdirSync("data/reports").filter((x) => x.endsWith(".json"))) {
  const path = `data/reports/${f}`;
  const r: Report = JSON.parse(readFileSync(path, "utf-8"));
  assertReport(r);
  const before = `${r.portfolio.length}/${r.callList.length}`;
  const ids = new Set(r.portfolio.map((c) => c.calaId));
  const dropped = new Set(DUPLICATES.filter((d) => ids.has(d.keep)).map((d) => d.drop));
  r.portfolio = r.portfolio.filter((c) => !dropped.has(c.calaId));
  const changed = new Set<string>();
  for (const c of r.portfolio) {
    const wrong = NOT_A_CONTACT[c.calaId] ?? [];
    c.founders = c.founders.filter((p) => !wrong.includes(p.name));
    const rounds = c.rounds.filter((x) => !NOT_ITS_ROUND[c.calaId]?.includes(x.calaId));
    const signals = c.signals.filter((s) => s.kind !== "news_event" || !s.sources.some((x) => NEWS_BLOCKLIST.has(x.url)));
    if (rounds.length === c.rounds.length && signals.length === c.signals.length) continue;
    const last = rounds.find((x) => x.date);
    c.rounds = rounds;
    c.lastRoundDate = last?.date;
    c.signals = signals.flatMap((s) => s.kind !== "last_round" ? [s]
      : last ? [{ kind: "last_round" as const, text: `Last recorded round: ${ym(last.date)}`, date: last.date, sources: last.sources }] : []);
    delete c.overview; // written from the facts just removed
    changed.add(c.calaId);
  }
  const byId = new Map(r.portfolio.map((c) => [c.calaId, c]));
  r.callList = r.callList.flatMap((e): CallListEntry[] => {
    const c = byId.get(e.companyId);
    if (!c || NOT_A_CONTACT[e.companyId]?.includes(e.founder.name)) return [];
    if (!changed.has(e.companyId)) return [e];
    const group = groupFor(c.signals, c.lastRoundDate, new Date(r.generatedAt));
    return group ? [{ ...e, group, why: c.signals, questions: groundedQuestions(r.fund.name, c.signals) }] : [];
  });
  assertReport(r);
  const after = `${r.portfolio.length}/${r.callList.length}`;
  if (before === after && !changed.size) continue;
  writeFileSync(path, JSON.stringify(r, null, 2) + "\n");
  console.log(`${r.fund.name}: companies/contacts ${before} → ${after}, ${changed.size} companies regrouped`);
}
