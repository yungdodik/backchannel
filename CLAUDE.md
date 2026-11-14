@AGENTS.md

# Backchannel — Junction 2026 (Cala track + Exa + Gemini)

Founder types a fund → picks the right Cala entity → gets a sourced **call list** of portfolio founders to
reference-check the fund with, especially from companies with no recent round or bad news.

Context, terms and all decisions (read before changing behaviour):
`../ideas/backchannel/CONTEXT.md`, `../ideas/backchannel/decisions.md`, API facts: `../ideas/backchannel/research-apis.md`.

## Run
- `npm run dev` → http://localhost:3000 · `npx tsc --noEmit` · `npm run lint`
- Keys in `.env.local` (git-ignored): `CALA_API_KEY`, `EXA_API_KEY`, `GEMINI_API_KEY` (+ Upstash vars later).

## Layout & ownership (D10 — two parallel sessions, don't cross lanes)
| Path | Owner | What |
|---|---|---|
| `lib/types.ts` | both — change only by agreement | Report / stream contract |
| `lib/` (rest), `app/api/` | session A (data) | Cala walk, Exa, Gemini, cache, NDJSON stream |
| `app/` (pages, components) | session B (UI) | fund picker, streaming call list, portfolio table |
| `mock/icebreaker.json` | — | real Cala data for Icebreaker.vc; `[mock]` founders/questions are placeholders |

## Rules that bite
- **Fixed pipeline, not a free agent (D4):** Cala walk → coded signals → Exa per founder → Gemini only verifies founders + writes 3 questions from retrieved facts.
- **Neutral, sourced facts only (D6):** never "failed/dead"; every Signal/Founder carries sources. No source → don't show it.
- **Cala:** use `POST /v1/entities/{id}` with relationship projection (fast, ~0.5 s). Never `/knowledge/query|search` live (50–90 s, errors).
  Rate limit is tight and undocumented → one shared queue, retry 429 with exponential backoff.
- **Exa:** `category: "people"` for founders (returns employees too → Gemini yes/no check, D20); exclude the fund's own domain/blog (D22).
- Stream NDJSON `StreamEvent`s; the portfolio goes out first, enrichment by priority (oldest last round first, D17).
- Demo must never depend on a live call: 5 precomputed funds in the repo (D8, D25).
