# Backchannel: build spec (Part A: data, Part B: UI)

Start each session with `/mattpocock-skills:implement docs/spec.md Part A` (or `Part B`). If GitHub coordination is set up, follow "Coordination" at the end.
Background: `docs/CONTEXT.md` (terms) and `docs/decisions.md` (D1–D26, probe results).
The contract is `lib/types.ts`. Change it only by agreement between the sessions, and prefix the commit message with `contract:`.
Fixed point for `/code-review`: the commit that added this spec (see `git log -- docs/spec.md`).

## Problem statement
A founder about to take money from a fund checks the fund by calling references the fund hand-picked. The founders who know how the fund behaves when things go badly are never on that list. Finding them takes days of digging through Crunchbase and LinkedIn.

## Solution
The founder types a fund name and picks the right fund from the matches. Within seconds they see the fund's portfolio. Then a **call list** streams in: founders of the fund's portfolio companies, grouped by neutral facts. Each entry has sourced reasons and 3 questions to ask. The facts are: news of an acquisition, shutdown or layoffs; no recorded round in 24+ months; or a recent new round. Every claim links to its source.

## User stories
1. As a founder, I type a fund name and see the 3–5 matching Cala entities with descriptions, so I pick the right fund rather than a namesake.
2. As a founder, I see the fund's portfolio within ~2 s of picking, so I know the tool is working.
3. As a founder, I watch call-list entries appear as they're found, so I'm not staring at a spinner.
4. As a founder, I see entries grouped as "News found", "No recorded round in 24+ months" and "Raised again recently", so I can call both tough-time and happy references.
5. As a founder, every fact on an entry has a clickable source chip (domain + date), so I can verify it before calling.
6. As a founder, I get the founder's LinkedIn link when known, so I can reach out.
7. As a founder, I get 3 specific questions per entry, grounded in that company's facts, so my call is sharp.
8. As a founder, I can copy an entry's questions in one click.
9. As a founder, I see a collapsible portfolio table (company, last recorded round, fund led, founders found, state), so I can see the evidence behind the list.
10. As a founder, I see a note that a missing round is not proof of failure, so I read the facts fairly.
11. As a demo judge, I can click one of 5 preset funds and get a full report instantly from cache.
12. As a demo judge, I can type any fund and get a live, possibly partial, report, with the first entries within about 2 minutes.
13. As a founder, if the data source is slow or rate-limited, I see "waiting for data source…" rather than an error.
14. As a founder, if something fails midway or time runs out, I keep what has already loaded and see a clear message.
15. As a founder, I never see a fund's own partner listed as a "founder".
16. As a founder, I never see words like "failed" or "dead" in generated text; the tool states facts only.

## Pipeline (shared understanding for both parts)
0. **`normalise(name)`:** lowercase, strip trailing legal forms (`oy, oyj, oü, ab, as, asa, aps, ltd, limited, gmbh, inc, llc, sa, bv, nv, plc`), strip punctuation, collapse spaces. Use it in every Exa query and every name match ("FLOWHAVEN OY" becomes "flowhaven").
1. **Fund search:** Cala `GET /v1/entities?name=&limit=10`. Return the top 5 as `FundMatch`, ranked so that entities whose description matches `/venture|vc\b|capital|fund|invest/i` come first.
2. **Portfolio walk** (one call, ~0.5 s): `POST /v1/entities/{fund}` with relationships `outgoing.INVESTED_IN` and `outgoing.PARTICIPATES_IN_FUNDING_ROUND`, each with limit 200. Emit `portfolio`: all companies with `state: "pending"`, `rounds: []`, sources from the INVESTED_IN link. Keep the fund rounds (`is_lead`, sources) in memory for step 3.
3. **Enrich companies in priority order** (D17: oldest first, using the earliest source date on the INVESTED_IN link). One Cala call per company: `POST /v1/entities/{company}` with properties `description, operational_status, founding_date` and relationships `incoming FOUNDED / IS_CEO_OF` (limit 10) and `outgoing PARTICIPATES_IN_CORPORATE_EVENT` (limit 20). Fixtures: `test/fixtures/cala/company_*.json`.
   - **Company rounds:** these are the PrivateCompanyFundingRound links. The projection carries **no label, amount or investors**. Set `label = "Funding round"`, `amount` undefined, `coInvestors: []`. No per-round fetches.
   - **Round date:** `event_date`, unless it is missing or ends in `-01-01` (year precision; the Modash fund round shows 2019-01-01 against a 2022-11 announcement). Otherwise use the earliest source `date`.
   - **Acquisition, not a round:** a link whose source names match `/acqui|exit|merge/i` is not a round. It becomes a `news_event` signal, "Reported acquisition ({source domain}, {YYYY-MM})", with those sources. Fixture: Vespia ("Icebreaker.vc exits from Vespia").
   - **fund_led:** join each fund round from step 2 to a company round when they share a source `document` URL. On a match, set that `Round.fundIsLead = is_lead` and, if true, emit `fund_led`, "{fund} led a round ({YYYY-MM})". No match means `fundIsLead: null` and no signal. No issuer fetches.
   - **Sources:** drop any whose `document` is empty (e.g. `"Cala AI"`).
   - **Give-up:** if Cala gives up on a company after its retries, or the time budget is hit, set `state: "unavailable"`.
4. **Signals and group** (pure code, D6). Signals:
   - `last_round`: "Last recorded round: {YYYY-MM}".
   - `fund_led`.
   - `status`: "Cala status: {value}", only if present.
   - `news_event`: from step 3 and step 6.

   Group:
   - `news_event` if any news signal.
   - Otherwise `no_recent_round` if the last dated round was more than 24 months before `now`.
   - Otherwise `recent_round`.
   - A company with no dated round and no news gets **no group** (Cala coverage gap, not a fact).
5. **Founders** run only for companies that got a group (saves calls).
   - Cala FOUNDED and IS_CEO_OF people go first (`via: "cala"`, `evidence: "Cala: FOUNDED"`).
   - If fewer than 2: Exa search with `category: "people"`, query `founder of {normalise(name)} {description}`, 5 results. Founder rule (no LLM):
     - The person's `entities[0].properties.workHistory` has an item whose `title` matches `/founder|ceo/i` and `normalise(company.name) === normalise(portfolio name)`.
     - Exclude anyone with any workHistory company containing the fund name. Regression: Riku Seppälä, "Co-founder and General Partner, Icebreaker.vc".
     - Exact match only: "Alvin" ≠ "Alvin Technologies" ≠ "AlvinAI" (fixture `exa/exa_probe.json` → `people_Alvin`).
     - `evidence = "{title}, {company}"`, `linkedinUrl` = the result URL, source = that URL. `via: "exa+gemini"` (legacy name; the UI shows "via web").
   - Max 2 founders per company. A grouped company with 0 founders is **not** on the call list; it stays in the table.
6. **News** runs only for grouped companies whose group is `no_recent_round`, plus companies with no dated round. One Exa search: `"{normalise(name)}" shut down OR acquired OR layoffs OR bankruptcy`, `startPublishedDate` = now − 3 years, 5 results with highlights. Exclude the fund's own domain and its `medium.com/<fund>` blog (D22).
   - Keep a result only if title + highlight contains `normalise(name)` and matches `/shut ?down|acquir|layoff|bankrupt/i`.
   - The kind comes from the matched word. It becomes "Reported {acquisition|shutdown|layoffs|bankruptcy} ({domain}, {YYYY-MM})". Recompute the group.
   - No LLM in this step.
7. **Questions:** one Gemini call per company on the call list (shared by its ≤2 entries), given only its `why` signals, returning exactly 3 questions as JSON. Post-check:
   - Drop questions containing a 4-digit year or a number not present in the signals, or matching the banned-words regex.
   - Fill up to 3 from fixed templates.
8. **Entries:** one `CallListEntry` per (company, founder), with `why` = the company's signals and `writing: []`.
9. **Cache:**
   - `npm run precompute -- <calaId>…` runs the pipeline locally with no time budget. It writes `data/reports/{calaId}.json` and regenerates `lib/cached-reports.ts`, a static import map `{ [calaId]: () => import("@/data/reports/<id>.json") }`.
   - There is no runtime `fs` (Vercel doesn't bundle it) and no Upstash in v1.
10. **Limits:**
    - **Cala:** one shared queue, concurrency 1, configurable minimum gap (start 1 s). On a 429, retry with backoff 1, 2, 4, 8, 16 s, then give up on that item. While retrying, emit `progress: "waiting for data source…"`.
    - **Exa and Gemini:** concurrency 5 each.
    - **Live time budget** = `maxDuration` − 20 s. When it's hit, stop, set the remaining companies to `unavailable`, emit `progress: "Stopped early; showing what was found"`, then `done` with `complete: false`. Live runs enrich at most the first 25 companies by priority.

## Stream protocol (both parts implement exactly this)
- `GET /api/report?fund=<calaId>[&mock=1][&fresh=1]` returns `Content-Type: application/x-ndjson`, one `StreamEvent` per line.
- **Order:**
  1. Zero or more `progress` events.
  2. Exactly one `portfolio`.
  3. `company`, `entry` and `progress` events, interleaved.
  4. Exactly one terminal line: `done` or `error`.
- **Errors:**
  - A per-company failure is sent as a `progress` event, never `error`.
  - `error` is fatal and is the last line.
- **`done.report` is authoritative:** the UI replaces its state with it.
- **Source precedence:**
  1. `mock=1` → replay `mock/icebreaker.json`.
  2. Otherwise, a cached report exists for that id and no `fresh=1` → replay it.
  3. Otherwise, run live.
- **Replay:** `lib/replay.ts` exports `reportToEvents(report): StreamEvent[]`. It emits one progress → `portfolio` (companies as stored) → one `entry` per callList item → `done`. Mock and cache replays both use it, with ~150 ms between events.
- **Fund search:** `GET /api/funds?q=<text>[&mock=1]` returns `FundMatch[]` (200, and `[]` when nothing matches). With `mock=1` it reads `test/fixtures/cala/{slug(q)}_1_search.json` if that exists, else `icebreaker_vc_1_search.json`.

## Ownership
| Path | Owner |
|---|---|
| `lib/types.ts` | both, by agreement (`contract:` commits) |
| `lib/**` except `lib/utils.ts`; `app/api/**`; `scripts/**`; `data/**`; `mock/**`; `test/fixtures/**`; `vitest.config.ts` | A |
| `app/**` except `app/api/**`; `components/**` (including `components/use-report-stream.ts`); `lib/utils.ts`; `components.json`; `app/globals.css` | B |
| `package.json` / `package-lock.json` | both: add dependencies only via `npm i`, commit immediately, pull/rebase before the next install |

## Part A: data pipeline

### Seams (agreed; test only here)
1. **`createPipeline(deps)`**, where deps are `{cala, exa, gemini, now, budgetMs}` adapters, exposing `run(fundId): AsyncIterable<StreamEvent>`. Test with fake adapters:
   - Fake Cala returns the fixtures in `test/fixtures/cala/` by id, and `{properties:{}, relationships:{outgoing:{},incoming:{}}}` for ids without a fixture.
   - Fake Exa returns `test/fixtures/exa/*`.
   - Fake Gemini returns `test/fixtures/gemini/questions.json`.
   - Assert the protocol order, Vespia as `news_event` (acquisition), the Riku Seppälä exclusion, the Alvin exact match, and that the budget stop yields `complete: false`.
2. **Cala client**, with `fetch` injected. Test with a fake `fetch` and fake timers: the 429 backoff, the queue gap, and giving up after 5 tries.
3. **Pure signal and grouping function**: `(company links, fundRounds, now) → {rounds, signals, group | null}`. Test with worked examples:
   - The 24-month boundary.
   - No dated round.
   - A `-01-01` date falling back to the source date.
   - An empty-URL source being dropped.
   - The Vespia acquisition.
   - The fund_led join by shared source URL.
4. **`reportToEvents`**: order and count of events for `mock/icebreaker.json`. Also a runtime validation that the mock matches the contract (every company has a `state` and every round has `fundIsLead`).

### Milestones and delegation
`[sonnet]` = delegate to a subagent with `model: sonnet` and a precise brief, then **validate it yourself** (read the diff, run the tests). `[main]` = do it yourself.

| # | Task | Who | Done when |
|---|---|---|---|
| A0 | **First, within ~30 min; B depends on it.** Install vitest + jsdom + @testing-library/react + @testing-library/jest-dom and `vitest.config.ts` (node by default, jsdom for `*.test.tsx`). `lib/replay.ts` (seam 4). `/api/report?mock=1` and `/api/funds?mock=1` per the stream protocol. | [sonnet] | `curl` shows NDJSON in protocol order; seam-4 test and tsc pass |
| A1 | Cala client: typed calls, shared queue, 429 backoff (seam 2) | [main] | seam-2 tests pass |
| A2 | Exa and Gemini adapters (`exa-js`, `@google/genai`). Confirm the Flash model id against the live model list (D24). Record `test/fixtures/exa/news_klaus.json` (a real news search for Klaus) and `test/fixtures/gemini/questions.json` | [sonnet] | one real call each; fixtures committed |
| A3 | `normalise` + signals and grouping (seam 3) | [main] | seam-3 tests pass |
| A4 | Pipeline steps 0–8 behind `createPipeline` (seam 1) | [main] | seam-1 tests pass on fixtures |
| A5 | Live `/api/funds` and `/api/report`. Set `maxDuration` from Vercel's docs for our plan (look it up, don't guess) and wire the budget | [main] | local live stream for Icebreaker in the browser |
| A6 | Precompute script + `lib/cached-reports.ts` + cached replay | [sonnet] | `npm run precompute -- 70fb3317-cd8c-4c52-aa86-66502789bce3` writes a file; `/api/report?fund=…` replays it |
| A7 | `npm run check:pipeline` (see acceptance) | [sonnet] | runs and prints a report |
| A8 | Precompute the 5 demo funds (D25); resolve Inventure (Finnish) by hand; commit `data/reports/` | [main] | 5 files, each read through by hand |

### Acceptance: `check:pipeline` (live Icebreaker.vc `70fb3317-cd8c-4c52-aa86-66502789bce3`, run locally with no budget)
- **Hard gates (fail the run):**
  - Every `Signal` and `Founder` has at least 1 source with a non-empty `url`.
  - No founder has a workHistory company containing the fund name (regression: Riku Seppälä).
  - Every entry has exactly 3 questions.
  - Signal text and questions do not match `/\b(fail(ed|ure)?|dead|died)\b/i`.
  - The stream follows the protocol order.
- **Soft (printed, not failing):** number of entries (target ≥ 8), time to the first `entry`, total time, number of 429s.

## Part B: UI

### Seams (agreed; test only here)
1. **`<ReportView events={StreamEvent[]}>`**: a pure render from the events received so far. Test with React Testing Library on `reportToEvents(mock)` slices:
   - A skeleton shows before `portfolio`.
   - The portfolio count shows after it.
   - Entries are placed in the right group; the mock has all 3 groups.
   - Each signal renders a source chip linking to its URL.
   - A `progress` message shows.
   - After an `error`, the partial content stays and a banner shows.
   - `state: "unavailable"` shows "not available", not a skeleton.
   - `via: "exa+gemini"` renders "via web".
2. **`useReportStream(url)`** in `components/use-report-stream.ts`: NDJSON over a `ReadableStream`. Test with a fake stream where lines are split across chunks and one line is malformed; it must be skipped without crashing.

### Screens
- **`/`:**
  - A search box. On submit, call `GET /api/funds?q=` and show the matches (name and description); click one to go to `/report/[calaId]`.
  - 5 preset fund buttons (D25).
  - One sentence explaining what the tool does.
- **`/report/[calaId]`:**
  - **Header:** fund name and description, plus a progress line: the latest `progress` message and "{non-pending}/{total} companies checked", computed client-side.
  - **Call list:** three sections, in this order:
    - "News found (acquisition, shutdown, layoffs)"
    - "No recorded round in 24+ months"
    - "Raised again recently"

    Empty sections are hidden.
  - **Card:**
    - Founder name, with a LinkedIn link if present.
    - Company.
    - A badge: "via Cala" or "via web".
    - The evidence in muted text.
    - Signals as bullets, each with a source chip (domain + YYYY-MM, opening in a new tab).
    - 3 numbered questions and a "Copy questions" button.
  - **Portfolio:**
    - A collapsible table, collapsed by default, showing the count: company, last recorded round, fund led (✓ / — when null), founders found, state.
    - State shows a skeleton when pending, "not available" when unavailable.
  - **Footer note:** "Facts from public sources via Cala and Exa. A missing round is not evidence that a company failed."
  - **States:**
    - Skeleton before `portfolio`.
    - An empty call list shows an explanation.
    - An `error` shows a banner and keeps the partial report.
    - `done` with `complete: false` shows "partial report".
- **Look:** Tailwind + shadcn/ui (input, button, card, badge, collapsible, table, skeleton). Calm and readable, works on mobile. No charts. No "In their own words" section in v1.

### Milestones and delegation
| # | Task | Who | Done when |
|---|---|---|---|
| B0 | `shadcn init` and components **only** (A0 installs vitest/RTL; pull `main` after A0, or wait) | [sonnet] | components render in a scratch page |
| B1 | `useReportStream` (seam 2). Until A0 lands, test against a local fake stream | [main] | seam-2 tests pass |
| B2 | `ReportView`: groups, cards, chips, table, states (seam 1) | [main] | seam-1 tests pass |
| B3 | Pages `/` and `/report/[calaId]`, wired to `/api/report?fund=…&mock=1` and `/api/funds?mock=1` | [sonnet] | clicking through works in `npm run dev` |
| B4 | Polish: copy button, 375 px layout, empty, error and partial states, footer note | [sonnet] | visual check at 375 px and desktop |
| B5 | Drop `mock=1` once A5 is live (one constant) | [main] | live Icebreaker report renders |

### Acceptance
- seam-1 and seam-2 tests pass.
- `npm run build` passes.
- Manual browser check: the mock report renders progressively; all 3 groups show; source chips open the right URLs; Copy puts the questions on the clipboard; no layout break at 375 px.

## Integration (both, ~h12)
- B drops `mock=1`. Run a live Icebreaker report end to end, then `check:pipeline`.
- Deploy to Vercel with the environment variables set. Verify one cached and one live fund on the public URL.

## Testing decisions
- Test behaviour through the seams only. No tests against internal helpers.
- No live network calls in unit tests. Live calls happen only in `check:pipeline`, `precompute` and A2's recording script.
- Expected values come from fixtures and worked examples, never recomputed the way the code computes them.

## Out of scope (v1)
- Upstash or any runtime cache beyond committed reports.
- Gemini for founder checks or news classification (rules only).
- Founder writing ("In their own words"); `writing` is always `[]`.
- Issuer fetches for the lead flag.
- Watch mode and monitors; Oxylabs; Context.dev.
- Accounts and payments.
- Scoring investors.
- The pitch deck.

## Coordination (GitHub, if set up)
- **Worktrees:** session A works in `../backchannel-a` on branch `a/pipeline`, session B in `../backchannel-b` on `b/ui`.
- **PRs:**
  - One PR to `main` per milestone, title `A3: …`.
  - Merge your own PR when CI is green.
  - `git pull --rebase origin main` before starting each milestone.
- **Issues:**
  - Questions to the other side go in an issue labelled `for-A` or `for-B`.
  - Contract changes go in an issue labelled `contract`, with the proposed diff. The other side replies "ok" before you merge.
  - Close issues when done.
- **Each loop round:**
  1. `gh issue list --label for-<me> --state open` and answer.
  2. Check that CI on `main` is green.
  3. Continue with the next milestone.
- **Blocked:** if you're blocked on the other side, open a `for-<them>` issue and work on the next unblocked milestone.

## Further notes
- Next.js 16 differs from training data: read `node_modules/next/dist/docs/` before writing route handlers and streaming code (`AGENTS.md`).
- Keys live in `.env.local`. Never log keys or commit them.
- Ask the Cala team at the Saturday 11:00 workshop about the rate limit. Until then, tune the queue gap from the 429 count printed by `check:pipeline`.
