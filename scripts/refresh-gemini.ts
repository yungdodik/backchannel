// Refresh writing from cached evidence only: no Cala or Exa requests.
// Run: npx tsx scripts/refresh-gemini.ts <calaId> ...
import { readFileSync, writeFileSync } from "node:fs";
import { createGemini } from "@/lib/gemini";
import { groundedQuestions } from "@/lib/call-brief";
import { checkOverview, overviewFacts, overviewPrompt } from "@/lib/overview";
import { checkQuestions, questionPrompt } from "@/lib/pipeline";
import { assertReport } from "@/lib/replay";
import type { CallListEntry } from "@/lib/types";

async function main() {
  process.loadEnvFile(".env.local");
  const onlyMissing = process.argv.includes("--only-missing");
  const ids = process.argv.slice(2).filter((arg) => arg !== "--only-missing");
  if (!ids.length || ids.some((id) => !/^[a-f0-9-]{36}$/.test(id))) throw new Error("Provide explicit cached report IDs");
  const stop = new AbortController();
  const gemini = createGemini(process.env.GEMINI_API_KEY!, stop.signal);
  let fatal: Error | undefined;
  async function attempt<T>(fn: () => Promise<T | null>): Promise<T | null> {
    for (let i = 0; i < 2 && !stop.signal.aborted; i++) {
      try {
        const value = await fn();
        if (value !== null) return value;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/"code"\s*:\s*(401|402|403)|API key not valid|credits are depleted/i.test(message)) {
          fatal = new Error("Gemini rejected authentication or billing; saved completed work and stopped.");
          stop.abort(fatal);
        }
      }
    }
    return null;
  }

  for (const id of ids) {
    const path = `data/reports/${id}.json`;
    const report: unknown = JSON.parse(readFileSync(path, "utf8"));
    assertReport(report);
    const groups = new Map<string, CallListEntry[]>();
    for (const entry of report.callList) {
      if (onlyMissing && JSON.stringify(entry.questions) !== JSON.stringify(groundedQuestions(report.fund.name, entry.why))
        && JSON.stringify(entry.questions) === JSON.stringify(checkQuestions(entry.questions, entry.why, report.fund.name, entry.companyName))) continue;
      const key = JSON.stringify([entry.companyId, entry.why]);
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    let questions = 0, overviews = 0, unresolved = 0, completed = 0;
    const jobs: (() => Promise<void>)[] = [];
    for (const entries of groups.values()) jobs.push(async () => {
      const entry = entries[0];
      const result = await attempt(async () => {
        const raw = await gemini.questions(questionPrompt(entry.companyName, report.fund.name, entry.why));
        const checked = checkQuestions(raw, entry.why, report.fund.name, entry.companyName);
        return checked.every((q) => raw.includes(q)) ? checked : null;
      });
      if (result) { for (const e of entries) e.questions = result; questions++; }
      else unresolved++;
    });
    for (const company of report.portfolio) {
      if (company.overview) continue;
      const { lines, sources } = overviewFacts(company);
      if (!lines.length || !sources.length) continue;
      jobs.push(async () => {
        const text = await attempt(async () => checkOverview(
          await gemini.overview(overviewPrompt(company.name, lines)), [company.name, ...lines],
        ));
        if (text) { company.overview = { text, sources }; overviews++; }
        else unresolved++;
      });
    }
    console.log(`${report.fund.name}: ${groups.size} question sets; ${jobs.length - groups.size} missing overviews`);
    let next = 0;
    await Promise.all(Array.from({ length: 5 }, async () => {
      while (next < jobs.length && !stop.signal.aborted) {
        await jobs[next++]();
        completed++;
        if (completed % 20 === 0) console.log(`${report.fund.name}: ${completed}/${jobs.length} processed`);
      }
    }));
    assertReport(report);
    // Preserve the source research timestamp: this only rewrites cached evidence.
    writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
    console.log(`${report.fund.name}: saved ${questions} question sets, ${overviews} new overviews; ${unresolved} unresolved; ${report.portfolio.filter((c) => c.overview).length}/${report.portfolio.length} total overviews`);
    if (fatal) throw fatal;
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Refresh failed"); process.exitCode = 1; });
