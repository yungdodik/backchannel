// Records A2 fixtures from live APIs. Run: npx tsx scripts/record-a2.ts
import { writeFileSync } from "node:fs";
import { createExa } from "../lib/exa";
import { createGemini } from "../lib/gemini";

async function main() {
  process.loadEnvFile(".env.local");
  const start = new Date();
  start.setFullYear(start.getFullYear() - 3);
  const news = await createExa(process.env.EXA_API_KEY!).searchNews('"klaus" shut down OR acquired OR layoffs OR bankruptcy', {
    startPublishedDate: start.toISOString(),
    excludeDomains: ["icebreaker.vc"],
  });
  writeFileSync("test/fixtures/exa/news_klaus.json", JSON.stringify(news, null, 2));

  const qs = await createGemini(process.env.GEMINI_API_KEY!).questions(
    'Write 3 reference-call questions for a founder of a company with these signals: ["Last recorded round: 2021-05", "Icebreaker.vc led a round (2019-03)"]. Return a JSON array of 3 strings.',
  );
  writeFileSync("test/fixtures/gemini/questions.json", JSON.stringify(qs, null, 2));
}
main();
