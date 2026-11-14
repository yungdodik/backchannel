import { readdir, readFile, writeFile } from "node:fs/promises";
import { groundedQuestions } from "../lib/call-brief";
import { companyDisplayName, EXCLUDED_COMPANIES } from "../lib/data-quality";
import type { Report } from "../lib/types";

// Only deterministic corrections supported by the existing linked sources. Never refresh generatedAt here.
async function main() {
  for (const file of await readdir("data/reports")) {
    if (!file.endsWith(".json")) continue;
    const path = `data/reports/${file}`;
    const report: Report = JSON.parse(await readFile(path, "utf8"));
    report.portfolio = report.portfolio.filter((c) => !EXCLUDED_COMPANIES.has(c.calaId));
    report.callList = report.callList.filter((e) => !EXCLUDED_COMPANIES.has(e.companyId));
    for (const c of report.portfolio) {
      c.name = companyDisplayName(c.name);
      for (const e of report.callList.filter((e) => e.companyId === c.calaId)) e.companyName = c.name;
      if (c.name === "AI & Robotics-Powered IVF Platform" && c.signals.some((s) => s.sources.some((src) => src.url.includes("fertility-startup-mojo-")))) {
        const old = c.name;
        c.name = "Mojo";
        if (c.overview) c.overview.text = c.overview.text.replaceAll(old, c.name);
        for (const e of report.callList.filter((e) => e.companyId === c.calaId)) e.companyName = c.name;
      }
    }
    for (const e of report.callList) e.questions = groundedQuestions(report.fund.name, e.why);
    report.complete = report.complete && report.portfolio.every((c) => c.state === "enriched");
    await writeFile(path, JSON.stringify(report, null, 2) + "\n");
    console.log(`${report.fund.name}: ${report.portfolio.length} companies, ${report.callList.length} contacts`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
