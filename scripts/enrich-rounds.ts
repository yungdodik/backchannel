// Fills Round lead/amount/co-investors/partner in the committed reports from round announcements (D28, issue #22).
// Offline: no Cala calls. Rounds already enriched (have quotes) are skipped, so re-runs only retry the rest.
// Run: npm run enrich-rounds [-- <calaId>…]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createExa } from "@/lib/exa";
import { createGemini } from "@/lib/gemini";
import { profile } from "@/lib/fund-profile";
import { assertReport } from "@/lib/replay";
import { enrichRounds } from "@/lib/rounds";

async function main() {
  process.loadEnvFile(".env.local");
  const deps = { exa: createExa(process.env.EXA_API_KEY!), gemini: createGemini(process.env.GEMINI_API_KEY!) };
  const ids = process.argv.slice(2);
  const files = readdirSync("data/reports").filter((f) => f.endsWith(".json") && (!ids.length || ids.includes(f.slice(0, -5))));
  for (const f of files) {
    const path = `data/reports/${f}`;
    const t0 = Date.now();
    const { report, stats } = await enrichRounds(JSON.parse(readFileSync(path, "utf-8")), deps);
    assertReport(report);
    writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
    const p = profile(report);
    console.log(
      `${report.fund.name}: ${stats.enriched}/${stats.rounds} rounds enriched, ${stats.failed} failed, ${Math.round((Date.now() - t0) / 1000)}s | ` +
        `led ${p.ledRounds.n}/${p.ledRounds.of}, named in later round ${p.namedInLaterRound.n}/${p.namedInLaterRound.of}, ` +
        `top co-investors: ${p.topCoInvestors.slice(0, 3).map((c) => `${c.name} (${c.roundIds.length})`).join(", ")}`,
    );
  }
}

void main();
