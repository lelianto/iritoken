# Context engine APIs

The context-engine layer remains local and provider-neutral. Semantic APIs accept
caller-produced embeddings; the package does not upload text or bundle an embedding
model.

## Selection and conversation budgets

- `rankContext()` combines lexical relevance, explicit priority, and recency with
  inspectable signal scores.
- `fitTokenBudget()` performs hard-budget selection using a caller-supplied exact
  tokenizer when exact model limits matter.
- `compactConversation()` first applies safe deterministic body optimization, then
  retains required/recent messages and relevant history within the token budget.

## Retrieval and caching

- `SemanticIndex` performs bounded top-k cosine retrieval over supplied vectors.
- `SemanticCache` supports exact-key hits, similarity-threshold hits, TTL, and
  entry-count eviction.
- `prepareCacheAwarePrompt()` keeps reusable messages as a stable prefix and emits
  a SHA-256 fingerprint. DeepSeek prefix caching itself is automatic; cache hit/miss
  usage is normalized by the provider adapter.

## Routing, providers, and telemetry

- `routeModel()` filters routes by context capacity and capabilities, then selects
  by priority, cost, or capacity.
- `createOpenAICompatibleAdapter()` supports OpenAI-compatible Chat Completions
  endpoints; `createDeepSeekAdapter()` supplies the official DeepSeek base URL.
- `MetricsCollector` buffers bounded numeric observations and flushes them to a
  caller-provided exporter. Callers must keep attribute values metadata-only;
  the collector cannot infer whether an arbitrary string contains source content.

These modules provide mechanisms, not policy defaults. Applications remain
responsible for choosing embedding models, similarity thresholds, route catalogs,
tokenizers, retention requirements, and telemetry destinations.

## Validation

`npm run benchmark:deepseek:context` runs a two-variant live smoke test against
`deepseek-v4-flash`. It uses only an explicitly synthetic astronomy conversation,
checks fact recall, verifies the hard budget, and reports API-provided cache usage.

For the full easy-to-hard campaign, use
`npm run benchmark:deepseek:campaign -- --trials 3 --max-cost-usd 0.03`.
The methodology, checkpoint map, initial failed gate, corrected rerun, and limitations
are documented in `deepseek-v4-context-campaign-analysis.md`.
