// Re-applies lib/news-blocklist.ts to the committed reports without any Cala call:
// drops blocklisted news sources, regroups, drops entries that lose their group, re-asks Gemini where the facts changed
// or where an entry only has template questions (Gemini was down when the report was made).
// Run: npm run apply-blocklist
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createGemini } from "@/lib/gemini";
import { NEWS_BLOCKLIST } from "@/lib/news-blocklist";
import { checkQuestions, questionPrompt, questionTemplates } from "@/lib/pipeline";
import { assertReport } from "@/lib/replay";
import { groupFor } from "@/lib/signals";
import type { Signal } from "@/lib/types";

const clean = (signals: Signal[]) =>
  signals.flatMap((s) => {
    if (s.kind !== "news_event") return [s];
    const sources = s.sources.filter((x) => !NEWS_BLOCKLIST.has(x.url));
    return sources.length === s.sources.length ? [s] : []; // a partly blocklisted news fact is dropped whole: its text names the blocked source
  });

async function main() {
  process.loadEnvFile(".env.local");
  const gemini = createGemini(process.env.GEMINI_API_KEY!);
  for (const f of readdirSync("data/reports").filter((x) => x.endsWith(".json"))) {
    const path = `data/reports/${f}`;
    const r = JSON.parse(readFileSync(path, "utf-8"));
    assertReport(r);
    const now = new Date(r.generatedAt);
    const changed = new Set<string>();
    for (const c of r.portfolio) {
      const signals = clean(c.signals);
      if (signals.length === c.signals.length) continue;
      c.signals = signals;
      changed.add(c.calaId);
    }
    const templates = questionTemplates(r.fund.name);
    for (const e of r.callList) if (e.questions.every((q: string) => templates.includes(q))) changed.add(e.companyId);
    if (!changed.size) continue;
    const byId = new Map(r.portfolio.map((c) => [c.calaId, c]));
    const asked = new Map<string, string[]>();
    const callList = [];
    for (const e of r.callList) {
      if (!changed.has(e.companyId)) {
        callList.push(e);
        continue;
      }
      const c = byId.get(e.companyId)!;
      const group = groupFor(c.signals, c.lastRoundDate, now);
      if (!group) continue;
      if (!asked.has(c.calaId)) {
        const raw = await gemini.questions(questionPrompt(c.name, r.fund.name, c.signals)).catch(() => []);
        asked.set(c.calaId, checkQuestions(raw, c.signals, r.fund.name));
      }
      callList.push({ ...e, group, why: c.signals, questions: asked.get(c.calaId)! });
    }
    console.log(`${r.fund.name}: ${changed.size} companies changed, entries ${r.callList.length} → ${callList.length}`);
    r.callList = callList;
    assertReport(r);
    writeFileSync(path, JSON.stringify(r, null, 2) + "\n");
  }
}

void main();
