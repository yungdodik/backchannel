# Parallax

Reference-check a VC fund through people who already took its money. A fund becomes a star, its recorded portfolio becomes planets, and a sourced shortlist gives you people to contact and questions to ask. Built for Junction 2026.

## Run locally

Use Node 22 and npm. Run `npm ci`, then `npm run dev`. Open http://localhost:3000.

The five prepared examples work without API keys. Live search/research requires these server-only variables in `.env.local`:

```dotenv
CALA_API_KEY=
EXA_API_KEY=
GEMINI_API_KEY=
# Optional minimum delay between Cala requests in this process
CALA_MIN_GAP_MS=1000
```

Never commit `.env.local`. The initial production build needs network access for Google fonts.

## Demo path (about 90 seconds)

1. Choose **Icebreaker.vc**, then Fly. The prepared snapshot loads without external services.
2. Show **Start with these 3**: different companies and recorded experiences. Open a contact for evidence and questions.
3. Open a source. Explain that missing funding records are reasons to ask questions, never verdicts about a fund.
4. Use **Copy call brief**: person, company, contact route, questions and sources travel together. Missing direct profiles are explicitly labeled **Search LinkedIn**.
5. Switch **Map / List**. Both use the same report without restarting research. The list includes fund context and round sources.
6. If showing live search, say it researches up to 25 companies and may take minutes. Keep a prepared example ready. Errors offer retry and the map offers a prepared-example fallback.

Before presenting: `npm run lint`, `npm test -- --run`, `npm run build`, then `npm start`. Check the actual projector size and a narrow viewport.

## Architecture

- `lib/pipeline.ts`: Cala records, Exa news and role evidence, Gemini questions and summaries.
- `lib/signals.ts`: neutral facts. Map color is independent of contact availability.
- `lib/call-brief.ts`: shortlist across companies and experiences, prioritizing article evidence, direct profiles and sourced founder roles. CEO-only evidence stays labeled CEO.
- `lib/rounds.ts`: optional offline enrichment; extracted facts require a quote found in the source.
- `app/api/report/route.ts`: NDJSON streaming, prepared snapshots and shared live runs.
- `components/parallax-app.tsx`: map and reading view share one report stream.
- `data/reports/`: five snapshots, with the original research date displayed.

## Coverage and limits

Live runs read up to 200 portfolio links and research up to 25 companies, prioritizing older investment records. Researched, unavailable and not-researched companies are distinct. Partial coverage stays visible when research finishes.

Live runs do not perform the offline funding-announcement enrichment. Insufficient follow-on evidence is labeled, not represented as a meaningful zero.

Live reports are reused for ten minutes within one server process. Simultaneous readers share work; abandoned runs are cancelled after a short reconnect grace period. This is not persistent or cross-instance caching. Provider calls and the total run have deadlines. Gemini failure falls back to neutral questions.

Entity matching and generated summaries can still be wrong. Inspect linked evidence before relying on it. One known aggregate entity is excluded before analysis. Source publication dates can differ from event dates; recorded round dates are not guaranteed exact transaction dates.

## Maintain prepared examples

`npm run precompute`, `npm run enrich-rounds`, and `npm run overviews` use paid APIs to retrieve/enrich snapshots.

`npx tsx scripts/repair-reports.ts` applies deterministic local repairs: excludes the known aggregate, normalizes Mojo using its existing source, grounds prepared questions, and marks unavailable coverage partial. It preserves research timestamps.

Tests cover pipeline fixtures, source rules, streaming, coverage, question guards, shortlist diversity, contact fallbacks and shared-run cancellation. They do not call live providers.
