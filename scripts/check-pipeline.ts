import type { ExaResult } from "@/lib/exa";
import { liveCala, liveDeps } from "@/lib/live";
import { BANNED, createPipeline, questionTemplates } from "@/lib/pipeline";
import { VERDICT } from "@/lib/overview";
import { normalise } from "@/lib/signals";
import type { Founder, PortfolioCompany, Signal, StreamEvent } from "@/lib/types";

const ICEBREAKER = "70fb3317-cd8c-4c52-aa86-66502789bce3";

async function main() {
  process.loadEnvFile(".env.local");
  const calaId = process.argv[2] ?? ICEBREAKER;
  const deps = liveDeps({ budgetMs: Infinity });
  const people = new Map<string, ExaResult>(); // by url, for the fund-in-workHistory gate
  const realSearch = deps.exa.searchPeople.bind(deps.exa);
  deps.exa.searchPeople = async (q) => {
    const rs = await realSearch(q);
    for (const r of rs) people.set(r.url, r);
    return rs;
  };

  const t0 = Date.now();
  const secs = (t = Date.now()) => ((t - t0) / 1000).toFixed(0);
  const events: { e: StreamEvent; t: number }[] = [];
  for await (const e of createPipeline(deps).run(calaId)) {
    events.push({ e, t: Date.now() });
    if (e.type === "progress") console.log(`[${secs()}s] ${e.message}`);
    else if (e.type === "entry") console.log(`[${secs()}s] entry: ${e.entry.companyName} / ${e.entry.founder.name}`);
  }
  const total = secs();
  const evs = events.map((x) => x.e);

  // Final state from events: portfolio, overridden by enriched companies.
  const portfolio = evs.find((e) => e.type === "portfolio");
  const fundName = portfolio?.type === "portfolio" ? portfolio.fund.name : "";
  const companies = new Map<string, PortfolioCompany>();
  for (const e of evs) {
    if (e.type === "portfolio") e.companies.forEach((c) => companies.set(c.calaId, c));
    if (e.type === "company") companies.set(e.company.calaId, e.company);
  }
  const done = evs.at(-1)?.type === "done" ? (evs.at(-1) as Extract<StreamEvent, { type: "done" }>).report : undefined;
  // done.report is authoritative (protocol); also gate what was streamed before it.
  const entries = [...evs.flatMap((e) => (e.type === "entry" ? [e.entry] : [])), ...(done?.callList ?? [])];
  const cs = [...companies.values(), ...(done?.portfolio ?? [])];
  const signals: Signal[] = [...cs.flatMap((c) => c.signals), ...entries.flatMap((e) => e.why)];
  const founders: Founder[] = [...cs.flatMap((c) => c.founders), ...entries.map((e) => e.founder)];

  let failed = false;
  const gate = (name: string, bad: string[]) => {
    if (bad.length) failed = true;
    console.log(`${bad.length ? "FAIL" : "PASS"}  ${name}${bad.length ? ` (${bad.length})` : ""}`);
    bad.slice(0, 5).forEach((b) => console.log(`        ${b}`));
  };
  const noSource = (s: { sources: { url: string }[] }) => !s.sources.length || s.sources.some((x) => !x.url);

  // exaFounders sets the founder's source url to the Exa result url: the key into `people`.
  const fundIn = normalise(fundName);
  const fundFounders = founders.flatMap((f) => {
    if (f.via !== "exa+gemini") return [];
    const r = people.get(f.linkedinUrl ?? "") ?? f.sources.map((s) => people.get(s.url)).find(Boolean);
    if (!r) return [`${f.name}: not found in recorded Exa results`];
    const hit = (r.entities?.[0]?.properties?.workHistory ?? []).find(
      (w) => w.company?.name && normalise(w.company.name).includes(fundIn),
    );
    return hit ? [`${f.name}: worked at ${hit.company!.name}`] : [];
  });

  const types = evs.map((e) => e.type);
  const pi = types.indexOf("portfolio");
  const last = evs[evs.length - 1];
  const orderErr: string[] = [];
  if (types.filter((t) => t === "portfolio").length !== 1) orderErr.push("portfolio count != 1");
  if (pi > 0 && types.slice(0, pi).some((t) => t !== "progress")) orderErr.push("non-progress before portfolio");
  if (types.slice(pi + 1, -1).some((t) => !["company", "entry", "progress"].includes(t)))
    orderErr.push("unexpected event after portfolio");
  if (types.filter((t) => t === "done" || t === "error").length !== 1 || !last || !["done", "error"].includes(last.type))
    orderErr.push("not exactly one terminal event, last");
  if (last?.type === "error") orderErr.push(`terminal error: ${last.message}`);
  else if (last?.type !== "done") orderErr.push("run did not end with done");

  console.log(`\n===== check:pipeline report (${calaId}, fund "${fundName}") =====`);
  gate("every Signal has >=1 source with url", signals.filter(noSource).map((s) => s.text));
  gate("every Founder has >=1 source with url", founders.filter(noSource).map((f) => f.name));
  gate("no founder worked at the fund (workHistory)", fundFounders);
  gate(
    "every entry has exactly 3 questions",
    entries.filter((e) => e.questions.length !== 3).map((e) => `${e.companyName}: ${e.questions.length}`),
  );
  gate(
    "no banned words in signals/questions",
    [...signals.map((s) => s.text), ...entries.flatMap((e) => e.questions)].filter((t) => BANNED.test(t)),
  );
  const overviews = cs.flatMap((c) => (c.overview ? [{ name: c.name, ...c.overview }] : []));
  gate("every overview has text, >=1 source with url and no verdict word (D29)", overviews.filter((o) => !o.text || noSource(o) || VERDICT.test(o.text)).map((o) => o.name));
  gate("protocol order", orderErr);
  const callList = done?.callList ?? entries;
  const templated = callList.filter((e) => e.questions.every((q) => questionTemplates(fundName).includes(q)));
  gate("Gemini wrote questions (not all entries on templates)", callList.length && templated.length === callList.length ? ["all entries use template questions"] : []);

  const groups: Record<string, number> = {};
  callList.forEach((e) => (groups[e.group] = (groups[e.group] ?? 0) + 1));
  const first = events.find((x) => x.e.type === "entry");
  const final = done?.portfolio ?? [...companies.values()];
  console.log("\n-- metrics --");
  console.log(`entries: ${done?.callList.length ?? entries.length} (target >= 8)  by group: ${JSON.stringify(groups)}`);
  console.log(`time to first entry: ${first ? secs(first.t) + "s" : "n/a"}  total: ${total}s`);
  console.log(`template-only entries: ${templated.length}/${callList.length}`);
  console.log(`overviews: ${final.filter((c) => c.overview).length}/${final.filter((c) => c.state === "enriched").length} enriched companies`);
  console.log(`cala 429s: ${liveCala().hits429}`);
  console.log(`unavailable companies: ${final.filter((c) => c.state === "unavailable").length}/${final.length}`);
  console.log(`CALA_MIN_GAP_MS: ${process.env.CALA_MIN_GAP_MS ?? "1000 (default)"}`);
  process.exit(failed ? 1 : 0);
}

void main();
