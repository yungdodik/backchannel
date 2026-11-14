# Backchannel — decisions (2026-11-14)

| # | Decision | Why |
|---|---|---|
| D1 | Team: 2 people, no domain experience; Claude Code writes the code, humans steer + pitch | user |
| D2 | Tracks: Cala (main) + Exa/Internet Butler (2nd main, if organisers allow) + Gemini bonus. Drop Oxylabs, Context.dev | focus; Exa $2.5k cash; 2 integrations max |
| D3 | LLM: Gemini | bonus eligibility; LLM only does light work |
| D4 | Fixed pipeline, not free agent: Cala walk → coded signals → Exa per founder → LLM writes questions only | repeatable demo, cacheable |
| D5 | One Next.js (TypeScript) app: API routes + UI | one deploy, fewer moving parts |
| D6 | Neutral factual signals only, group by fact, never "dead/failed" | false positives, defamation |
| D7 | Main output = call list; portfolio table collapsible as evidence | Cala: one need done well |
| D8 | Deploy on Vercel + cached results for ~5 demo funds | judges type live; fallback |
| D9 | Docs live in repo docs/ (CONTEXT, decisions, research, spec, sessions); moved from ideas/backchannel/ for 2-laptop setup | |
| D10 | 2 Claude Code sessions: A = data pipeline (lib/), B = UI (app/) on mock JSON; shared contract lib/types.ts written first (first 30 min), integrate ~h12 | no edit collisions |
| D11 | Cache: pre-run JSON for 5 demo funds committed in repo + Upstash Redis (Vercel) for live runs | Vercel FS not persistent; fallback can't fail |
| D12 | Stream progress + call-list entries as they arrive | demo wow; stays under Vercel timeout |
| D13 | UI: Tailwind + shadcn/ui | fast, looks finished |
| D14 | Founders: names from Cala (people-company links); Exa people search only if Cala has none; Exa for contact links + public writing | Use-of-Cala score; Exa for coverage |
| D15 | Go bar: 2 of 3 test funds return >=15 portfolio companies with round date + >=1 founder. Big-EU-only pass -> demo on big EU funds. Fail -> pivot to NightShift / Claim Ledger. Test funds: Creandum, Inventure, Icebreaker | go/no-go |
| D16 | GO on Backchannel. Cala = portfolio, rounds, lead flags, co-investors; Exa = most founders + news | probe: Cala portfolio strong, founders ~25% |
| D17 | Live run: portfolio shown instantly, enrichment streamed by priority (oldest last round first); 5 demo funds fully precomputed; ask Cala (Sat 11:00 workshop) for higher rate limit | Cala 429s, ~6 s/call |
| D18 | Fund disambiguation: show top 3–5 Cala matches with description, user clicks | "Inventure" resolves to Belgian firm |
| D14b | (amends D14) Founders mostly via Exa people search; Cala FOUNDED/IS_CEO_OF links used when present | Cala founders ~25% |
| D20 | Founder verification: top-5 Exa people per company → summary → Gemini yes/no "founder of X" + quote; keep only yes, with LinkedIn URL | Exa returns employees + even fund partners |
| D21 | "Went badly" signal: last recorded Cala round; if >24 mo, one Exa news search (shut down/acquired/layoffs/bankruptcy, last 3 y) → sourced fact | Cala status never shows closed |
| D22 | Exclude fund's own domain/blog from founder-voice search; use it only as event source for timeline | Exa returned mostly fund PR |
| D23 | Code: new git repo junction/backchannel/ (Next.js), private GitHub → Vercel; public at submission. .env git-ignored, keys in Vercel env | |
| D24 | Gemini: one Flash model (gemini-3.8-flash unless model list says otherwise), GEMINI_API_KEY; no Pro | many cheap calls |
| D24b | (amends D24) Gemini model `gemini-3.5-flash`: 3.8/3.7/3.6-flash are listed but returned 504/503 on every call (2026-11-14); 20 s timeout, templates fill in | A2 probe |
| D25 | Demo funds: Icebreaker.vc, Creandum, Inventure (FI), Lifeline Ventures, Maki.vc; ask Cala for a favourite | Nordic, varied |
| D26 | h0–0:30: lib/types.ts + mock report from real Icebreaker probe data + project CLAUDE.md; then 2 sessions in parallel | |
| D11b | (amends D11) No Upstash in v1: cached = committed reports via static imports; live = no cache | spec review: scope, Vercel fs |
| D20b | (amends D20) Founder check = rule on Exa workHistory (title /founder|ceo/ at exact normalised company; exclude anyone who worked at the fund), no Gemini. News classification = keyword rule. Gemini only writes questions | Exa returns workHistory; cuts ~60 LLM calls |
| D27 | Spec: docs/spec.md, reviewed once by fresh agent (15 findings applied): stream protocol, ownership, time budget, acquisition-as-news, fund_led via shared source URL | |
| D28 | (amends D4, D20b) Gemini may also *extract* round facts (lead, amount, investors, fund partner) from a fetched announcement. Each fact needs a verbatim quote that code finds in the page, or it's dropped; Gemini never classifies or judges. Runs offline on committed reports (`npm run enrich-rounds`). Fund profile = counts with ids, no peer ranking (D6) | Cala gives lead for ~0 rounds, no amounts or co-investors; issue #22 |
| D29 | (amends D4, D28) Gemini may also write a short company *overview* (1–3 sentences: what the company is, its rounds and news), only from facts the pipeline already retrieved: company description, signals, round data, news titles. It is stored as `PortfolioCompany.overview` with the sources of those facts. Neutral under D6: code drops an overview that has a verdict word ("failed", "struggling"…), a number or a name that is not in the facts, or no text; then nothing is shown. Offline for the 5 demo reports (`npm run overviews`, no Cala calls); live in the pipeline beside the questions, and a Gemini failure leaves the field empty | user wants to see what a company is and what happened to it without opening the sources |

## Open
- (resolved: GO, see D16)

## Cala probe results (2026-11-14, Icebreaker.vc sample of 15/58; raw in probe_out/)
- Fast path works: `POST /entities/{fund}` with relationships INVESTED_IN + PARTICIPATES_IN_FUNDING_ROUND → 58 portfolio cos + 16 rounds in 0.5 s, every link sourced. Rounds carry `is_lead` (6 lead), day-precision dates, co-investors.
- Per company: rounds found 12/15, founders (FOUNDED/IS_CEO_OF/WORKS_AT Person links) 3–4/15, operational_status 5/15 (all ACTIVE — no "closed" signal seen).
- Slow path unusable live: /knowledge/query + /search take 50–90 s each, NL query errors ("too complex") or 500. Cala QL `funding_rounds.investors=X` returned 34–48 rows for Creandum/Icebreaker.
- Rate limit undocumented and tight: 12× 429 in ~30 calls; ~6 s/call effective → full 58-co enrichment ≈ 3–6 min.
- Name resolution is ambiguous: "Inventure" → Belgian firm first; "Creandum" → 10 entities.
- Verdict vs D15 bar: portfolio + round dates PASS; founders from Cala FAIL (~25%) → Exa must find most founders. Status: no death signal from Cala.
