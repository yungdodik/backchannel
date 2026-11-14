@AGENTS.md

# Backchannel — Junction 2026 (Cala track + Exa + Gemini)

Founder types a fund → picks the right Cala entity → gets a sourced **call list** of portfolio founders to
reference-check the fund with, especially from companies with no recent round or bad news.

Context, terms and all decisions (read before changing behaviour):
`../ideas/backchannel/CONTEXT.md`, `../ideas/backchannel/decisions.md`, API facts: `../ideas/backchannel/research-apis.md`.

## Run
- `npm run dev` → http://localhost:3000 · `npx tsc --noEmit` · `npm run lint`
- Keys in `.env.local` (git-ignored): `CALA_API_KEY`, `EXA_API_KEY`, `GEMINI_API_KEY`.

## Spec & ownership
Build spec: `docs/spec.md` (Part A = data, Part B = UI, stream protocol, ownership table, coordination). Two parallel sessions (D10): stay in your lane per the spec's Ownership table.

## Rules that bite
- **Fixed pipeline, not a free agent (D4):** Cala walk → coded signals → Exa per founder → Gemini only writes 3 questions from retrieved facts.
- **Neutral, sourced facts only (D6):** never "failed/dead"; every Signal/Founder carries sources. No source → don't show it.
- **Cala:** use `POST /v1/entities/{id}` with relationship projection (fast, ~0.5 s). Never `/knowledge/query|search` live (50–90 s, errors).
  Rate limit is tight and undocumented → one shared queue, retry 429 with exponential backoff.
- **Exa:** `category: "people"` for founders; founder = workHistory title /founder|ceo/ at exactly that company, never anyone who worked at the fund (D20b). Exclude the fund's own domain/blog from news (D22).
- Stream NDJSON `StreamEvent`s; the portfolio goes out first, enrichment by priority (oldest last round first, D17).
- Demo must never depend on a live call: 5 precomputed funds in the repo, loaded via static imports (no runtime fs on Vercel).
