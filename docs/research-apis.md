# Backchannel API research (fetched 2026-11-14)
Legend: [V] verified in docs fetched; [U] unverified / not in docs.

## 1. Cala (https://docs.cala.ai, index: https://docs.cala.ai/llms.txt, OpenAPI: https://api.cala.ai/openapi.json, "Beta 1.0")
- Interfaces: REST base `https://api.cala.ai` [V]; hosted MCP `https://api.cala.ai/mcp/` (tools: knowledge_search, knowledge_query, entity_search, entity_introspection, entity_retrieval) [V] https://docs.cala.ai/integrations/mcp.md. Also n8n + agent skill (`npx skills add cala-ai/cala-skill`). No official SDK documented; quickstart uses plain `requests`/`fetch` [V]. OpenAI MCP clients need `strict:false`.
- Auth: `X-API-KEY` header; key from console.cala.ai/api-keys; free account [V]. Claude Desktop uses OAuth.
- Rate limits: 429 `{"error":"rate_limit_exceeded"}` documented on every endpoint, but no quotas/window/Retry-After given [V]. Pricing, latency: not documented [U].
- Endpoints [V]:
  - POST /v1/knowledge/search {input, explainability=true, return_entities=true} -> {content (markdown), explainability[], context[KnowBit{id,content,origins}], entities[]}
  - POST /v1/knowledge/query {input, return_entities} -> {results: [free-form objects], entities[{id,name,entity_type,mentions}]}
  - GET /v1/entities?name=&entity_types=&limit= (fuzzy name search)
  - POST /v1/entities/lookup {cik|lei|siren|rssd_id|companies_house_uk_company_number: ...}
  - GET /v1/entities/{id}/introspection -> properties, relationships (incoming/outgoing), numerical_observations
  - POST /v1/entities/{id} (optional projection body: properties, relationships{outgoing/incoming: {TYPE:{limit,offset}}}, numerical_observations)
- Query model: `input` takes natural language OR "Cala QL" dot-notation (`startups.location=Spain.funding>10M`, `companies.founder.incorporation>2020.previous_job=Google`); supports = != > < >= <=, AND/OR, order_by, limit, return(...) [V] https://docs.cala.ai/features/structured-answer.md
- Investor/fund entity + per-investor round history: NOT documented. Entity types include Person, FundingRound, PrivateCompanyFundingRound, FundingRoundTranche, CorporateEvent [V in spec]; spec examples hint at `investors=A AND B` and `series=A OR B` filters [V as examples only]. Docs have zero investor-centric examples. Whether an "Investor"/"Fund" entity exists and links to rounds = must be tested live via entity_search + entity_introspection [U].
- Field availability: query result example rows show only company, sector, funding_amount, round_type, year (any can be null) [V]. Lead vs participant flag: not documented [U]. Round date: only `year` shown [U for exact date]. Company status (active/closed/acquired): not documented as a field; M&A/CorporateEvent entity type exists [U].
- People/founders: company profile "includes founders, executives, HQ, employee count"; relationships like IS_CEO_OF, IS_BOARD_MEMBER_OF; Person entity type [V]. Sources: search returns `context[].origins` + `explainability[].references` citations; query returns entity UUIDs only [V].
- Response: JSON; search is markdown + citations. Latency unknown [U]. Demo apps: none found beyond quickstart examples (Spanish startups).

## 2. Exa (https://docs.exa.ai -> https://exa.ai/docs/..., llms index https://docs.exa.ai/llms.txt)
- Search: POST https://api.exa.ai/search, `Authorization: Bearer` or `x-api-key` [V] https://exa.ai/docs/reference/search
  - types: `auto` (default), `lite` (cheap/low-latency, fewer params, no live fetch), `deep-lite` (~4s, synthesized), `deep` (multi-step, additionalQueries); legacy `instant`/`fast` -> lite, `deep-reasoning` -> deep. No "balanced" name; auto ≈ balanced [V].
  - categories: company, publication, news, personal site, financial report, people (other strings accepted as hints). `company`/`people` don't support date filters; `people` doesn't support excludeDomains. Unsupported filter -> 400 [V]. No "linkedin profile" category listed; `people` category is the route [V]; LinkedIn-specific coverage undocumented [U] (Exa Fiber.ai integration page is the only LinkedIn mention).
  - filters: startPublishedDate/endPublishedDate (ISO 8601); includeDomains/excludeDomains (<=1200, wildcard + path prefixes). numResults default 10, max 100.
  - contents: text, highlights, summary (optional JSON schema), extras(links), maxAgeHours, snapshotAsOf, livecrawlTimeout. `outputSchema` for structured synthesized output (not on lite) [V].
- Contents API (separate endpoint, same options) [V-ish]; Websets: async list-building + enrichments, POST /websets/v0/websets/, own credits, needs paid plan (free cap 25 results), minutes latency [V] https://exa.ai/docs/websets/quickstart.md. Monitors: recurring searches (min 1h interval) -> webhook, outputSchema supported [V] https://exa.ai/docs/monitors/quickstart.md. Exa Agent (task runs, schema-validated output with citations) mentioned [U details].
- MCP: hosted https://mcp.exa.ai/mcp [V]. SDKs: `exa-py` (`from exa_py import Exa`), `exa-js` [V].
- People search: via query e.g. "heads of security at Series B ..." type=auto; or category=people [V].
- Pricing per call (https://exa.ai/pricing) [V]: search lite $0.004; auto/fast $0.007; deep-lite/deep $0.012; deep-reasoning $0.015 (each +$0.001 per result >10); contents $0.001/page per content type; summaries +$0.001/page; monitors $0.002/run; Websets credit-based, rates not fetched [U].

## 3. Gemini API (https://aistudio.google.com/docs/models ; ai.google.dev redirects there)
- Stable flash: `gemini-3.8-flash`, `gemini-3.6-flash`; preview `gemini-3-flash-preview`. Flash-lite: `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`. Pro-ish: `gemini-3.1-pro-preview`; Gemini 4 family `gemini-4-carbon` (strongest reasoning), `gemini-4-argon`, `gemini-4-hydrogen` (docs recommend hydrogen for new projects; used in function-calling examples) [V]. Tier mapping of Gemini 4 names and per-model function-calling support not explicitly stated [U]; Gemini 3/4 combine built-in tools with function calling [V]. 2.5 models deprecated.
- Python SDK: `from google import genai; genai.Client()` [V]; pip name (`google-genai`) not on fetched page [U, from memory].
