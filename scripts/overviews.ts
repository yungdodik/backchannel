// Writes PortfolioCompany.overview into the committed reports (D29). Offline: Gemini only, no Cala or Exa calls.
// Companies that already have an overview are skipped, so re-runs only retry the rest.
// Run: npm run overviews [-- <calaId>…]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createGemini } from "@/lib/gemini";
import { companyOverview } from "@/lib/overview";
import { assertReport } from "@/lib/replay";

async function main() {
  process.loadEnvFile(".env.local");
  const gemini = createGemini(process.env.GEMINI_API_KEY!);
  const ids = process.argv.slice(2);
  const files = readdirSync("data/reports").filter((f) => f.endsWith(".json") && (!ids.length || ids.includes(f.slice(0, -5))));
  for (const f of files) {
    const path = `data/reports/${f}`;
    const report: unknown = JSON.parse(readFileSync(path, "utf-8"));
    assertReport(report);
    let added = 0;
    await Promise.all(
      report.portfolio.map(async (c) => {
        if (c.overview) return;
        c.overview = await companyOverview(c, gemini);
        if (c.overview) added++;
        else delete c.overview;
      }),
    );
    writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
    console.log(`${report.fund.name}: ${added} overviews added, ${report.portfolio.filter((c) => c.overview).length}/${report.portfolio.length} companies have one`);
  }
}

void main();
