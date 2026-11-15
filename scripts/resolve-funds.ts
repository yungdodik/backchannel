// Prints the top Cala matches (with portfolio counts) for fund names, to pick ids for precompute.
// Usage: npx tsx scripts/resolve-funds.ts "Northzone" "EQT Ventures" ...
import { toFundMatches, withPortfolioCounts } from "@/lib/funds";
import { liveCala } from "@/lib/live";

async function main() {
  process.loadEnvFile(".env.local");
  const cala = liveCala();
  for (const name of process.argv.slice(2)) {
    const matches = await withPortfolioCounts(toFundMatches(await cala.searchEntities(name, 10)), cala, { budgetMs: 60_000 });
    console.log(`\n## ${name}`);
    for (const m of matches.slice(0, 3)) console.log(`${m.calaId}\t${m.companies ?? "?"}\t${m.name}\t${(m.description ?? "").slice(0, 90)}`);
  }
}
void main();
