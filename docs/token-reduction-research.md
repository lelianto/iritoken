# Token-reduction research and evidence boundaries

Research snapshot: **2026-08-11**

This note evaluates ways to reduce tokens around an LLM coding agent. It is a
design and evidence review, not a benchmark result. Percentages reported by a
paper apply only to that paper's models, datasets, prompts, compression method,
and quality metric. They are not expected Iritoken results and must not be copied
into product claims.

The central finding is that “token optimization” contains several different
operations that need separate accounting. Some shorten an executed model
request, some avoid a request, some lower provider compute or price without
shortening the request, and some shorten only application/network payloads.
Combining them into one reduction percentage would be misleading.

## Measurement vocabulary

For each executed request, use the provider's usage response:

```text
input_tokens     = all model-reported prompt/input tokens, cached or not
output_tokens    = all model-reported completion/output tokens, including reasoning
total_tokens     = input_tokens + output_tokens

token_reduction  = 1 - optimized_total_tokens / control_total_tokens
```

For a multi-turn workload, sum the provider-reported fields across every call,
including retries, tool-call continuations, compression-model calls, judge calls,
and fallbacks that are within the declared system boundary. Report preprocessing
models separately as well so a local or secondary-model cost is not hidden.

Use the following effect classes throughout this document:

| Class | Operation | What may improve | What may be called token reduction? |
| --- | --- | --- | --- |
| Removal | Delete content judged unnecessary | Executed-request input tokens, cost, latency | Yes, using API-reported before/after tokens |
| Compression | Encode the same useful content more compactly | Executed-request input or output tokens | Yes, after measuring quality and API usage |
| Retrieval/selection | Send only selected source material | Executed-request input tokens | Yes, but retrieval misses count as quality failures |
| Reference/delta | Replace content with an identifier or change set | Payload and sometimes model tokens | Only when the model can resolve the base/reference and API usage is lower |
| Provider prompt cache | Reuse provider KV/prefix work | Price and time-to-first-token | **No**: cached tokens remain input tokens |
| Exact/semantic response cache | Reuse a previous application response | Requests, latency, and spend | Treat as request avoidance, not per-request token compression |
| Summarization/memory | Replace history with a lossy or structured representation | Executed-request input tokens | Yes if the summary is sent and quality is preserved; summary-generation cost also counts |

An application-level cache hit can make the model usage for that event zero, but
there is no authoritative provider token count for the skipped counterfactual
request. Report cache hit rate, avoided-request count, latency, and spend. An exact
token-savings claim requires a paired replay that actually executes and records
the no-cache control. Semantic-cache reuse is especially unsuitable for being
folded into a “prompt compression percentage”: it changes whether a request is
made and can return an incorrect or stale answer.

## What the primary literature supports

Prompt compression is a real, active research area, but its reported results are
not universal. [LLMLingua](https://arxiv.org/abs/2310.05736) uses a learned
coarse-to-fine, token-level compressor, while
[LongLLMLingua](https://arxiv.org/abs/2310.06839) adds question-aware document
ranking and position handling for long contexts. Both report large savings on
their evaluated tasks. [RECOMP](https://openreview.net/pdf?id=mlJLVigNHp)
trains extractive and abstractive compressors for retrieved evidence and can
choose not to augment. [Selective Context](https://arxiv.org/abs/2304.12102)
filters lower-information content. These are evidence that the methods can work,
not evidence that a fixed compression ratio preserves coding quality on DeepSeek
V4 Flash.

A large 2026 evaluation of prompt compression measured quality, preprocessing
overhead, and end-to-end latency across 30,000 queries and found that the useful
operating window depended on prompt length, compression ratio, hardware, and task;
outside that window compression overhead erased the latency benefit
([Kummer et al.](https://arxiv.org/abs/2604.02985)). This is a strong reason to
measure latency and compressor cost rather than infer them from fewer prompt
tokens.

Long context does not make selection unnecessary. The original
[Lost in the Middle](https://arxiv.org/abs/2307.03172) experiments showed that
answer quality could change substantially with the position of relevant evidence.
The result is model- and task-dependent, but it establishes that “it fits in the
context window” is not equivalent to “the model will use it reliably.”

For repositories, the primary research supports retrieval that respects both
text and program structure. [RepoCoder](https://arxiv.org/abs/2303.12570) uses
iterative similarity retrieval and generation;
[Repoformer](https://arxiv.org/abs/2403.10059) selectively avoids retrieval when
it predicts retrieval will not help; and
[GraphCoder](https://arxiv.org/abs/2406.07003) retrieves through control, data,
and control-dependence structure. These studies support testing hybrid and
dependency-aware selection. They do not establish a universal top-k, similarity
threshold, or reduction target.

## Input optimization techniques

### Technique-by-technique assessment

| Technique from the brief | Effect class | Defensible implementation | Principal quality or accounting risk |
| --- | --- | --- | --- |
| Prompt compression | Compression | Apply an extractive or learned compressor under an explicit token budget; preserve protected spans and provenance | A compact prompt can be semantically similar yet omit a task-critical token, constraint, identifier, number, or negation; learned-compressor tokens and latency count |
| Semantic compression | Compression/summarization | Replace a passage with task-conditioned facts, entities, relationships, citations, and unresolved uncertainty | Embedding or summary similarity is not functional equivalence; hallucinated or merged facts can be hard to detect |
| Redundant instruction removal | Removal | Remove byte-identical repetitions from the same authority level; retain one canonical copy and an audit map | Repetition may be deliberate emphasis; apparently similar instructions can differ in scope, priority, exception, or negation |
| Duplicate context detection | Detection, enabling removal/reference | Hash normalized-safe units and also track source path, range, revision, and multiplicity | Normalization can create false duplicates; repeated errors/events can encode frequency and order |
| Context deduplication | Removal/reference | Collapse exact duplicate blobs or messages while preserving a list of origins and occurrence counts | Two identical files at different paths may have different architectural meaning; removing provenance damages repository tasks |
| Whitespace normalization | Compression | Use grammar-aware transformation: remove only insignificant JSON whitespace, normalize known terminal artifacts, or run a language formatter whose output is verified | Whitespace is significant in strings, Markdown, Python/YAML, diffs, stack traces, tables, and column-aligned diagnostics |
| Structured prompt compaction | Compression | Minify validated JSON/JSONL without reordering or changing values; shorten repeated field wrappers only when both producer and consumer understand the compact schema | Re-serialization can change duplicate keys, numeric spellings, ordering, or invalid-but-diagnostic input; schemas and examples themselves consume input tokens |
| AST-aware code compression | Compression/retrieval | Parse first; retain imports, exports, signatures, types, referenced definitions, control/data dependencies, relevant bodies, and compiler directives; emit omission markers with source ranges and hashes | Incomplete code may not parse; reflection, generated code, decorators, side effects, dynamic imports, overload ordering, and macro systems evade a shallow AST |
| Comment removal where safe | Removal | Remove only language-classified, non-directive comments that are not requirements, licenses, API contracts, security notes, test intent, or requested documentation | Comments can affect tools or compilation and often contain the reason behind non-obvious code; blanket regex removal is unsafe |
| Irrelevant file/context elimination | Retrieval/removal | Exclude generated/vendor/binary content by policy, then select task-related files with a protected include set | “Irrelevant” is the decision most likely to cause missing-context failures; config, migrations, tests, and callers may be distant from the named file |
| Relevance-based context selection | Retrieval | Combine lexical matches, symbols, paths, task entities, diagnostics, recency, and embeddings; retain scores and rejected candidates | Pure semantic similarity under-ranks exact identifiers, rare error strings, numbers, and negative requirements |
| Dependency-aware context selection | Retrieval | Expand from named symbols/files through imports, callers/callees, types, tests, configuration, build graph, and ownership boundaries | Static graphs miss reflection, dependency injection, framework conventions, runtime loading, generated sources, and external services |
| Retrieval-based context selection | Retrieval | Index addressable chunks with repository revision and provenance; query using the task, target symbols, error text, and current edit; use bounded top-k plus protected items | Retrieval recall is a quality bottleneck; stale indexes and chunk boundaries can separate a definition from its contract |
| Context ranking | Retrieval | Score candidates, enforce per-class quotas, diversity, dependency closure, and token budget, then log all score components | A single scalar hides hard requirements; ranking all variants with the same biased query can produce correlated misses |
| Context caching | Provider cache | Keep stable reusable content at the beginning of the request and record provider hit/miss fields | DeepSeek still counts and requires cached input tokens; best-effort hits cannot be assumed; prefix layout optimized for price may be poor for relevance |
| Delta/diff-based context transmission | Reference/delta | Send a revision identifier plus a validated patch and enough surrounding context; allow a tool to retrieve the base; fall back to the full unit on hash mismatch | A stateless model cannot reconstruct an omitted base merely from its hash; diffs can hide invariants and move/rename context |
| Repeated system prompt elimination | Removal/cache | Canonicalize and shorten the prompt once, but resend the instructions required by a stateless endpoint; keep the stable copy as a cacheable prefix | Omitting required instructions changes the task. DeepSeek caching discounts prefix work but does not remove tokens |
| History compression | Summarization/retrieval | Keep recent raw turns plus a structured ledger of requirements, decisions, attempts, observations, open questions, and superseded facts | Summaries flatten authority and chronology; old facts can conflict with later corrections; tool-call IDs and reasoning state may be protocol-required |
| Conversation summarization | Summarization | Use task-aware, provenance-linked summaries with explicit uncertainty and source turn IDs; periodically re-ground from raw history | Summary generation can hallucinate or omit; repeated summarization compounds error; its own model usage belongs in system cost |
| Semantic memory | Retrieval/summarization | Store atomic facts with subject, value, source, time, scope, confidence, repository revision, and supersession links; retrieve only relevant records | Similarity is not truth; temporal updates, user isolation, deletion, poisoning, and conflicting memories require policy |
| Repository knowledge indexing | Retrieval infrastructure | Index files, AST symbols, definitions/references, imports, tests, configuration, documentation, commit/revision, and content hashes; update incrementally | An index alone reduces no tokens. Benefits arise only when selection sends fewer tokens; staleness and secret retention are material risks |

### Deterministic normalization and exact duplication

The lowest-risk savings come from transforms whose semantics can be checked
without an LLM. RFC 8259 defines whitespace around JSON structural characters as
insignificant, so validated JSON can be lexically minified outside strings
([RFC 8259](https://www.rfc-editor.org/rfc/rfc8259)). The same rule does not apply
to arbitrary text or source code. Preserve original bytes on parse failure and
verify that the compact form parses to the intended structure.

Exact content hashing is useful for duplicate detection and references. Git's
data model is a relevant primary example: object identifiers are hashes of type
and content, and unchanged files reuse existing blob IDs
([Git data model](https://git-scm.com/docs/gitdatamodel.html)). An LLM prompt
still needs provenance. A safe duplicate record therefore looks conceptually like:

```json
{
  "contentHash": "sha256:...",
  "occurrences": [
    { "path": "src/a.ts", "range": "1:40", "revision": "..." },
    { "path": "src/b.ts", "range": "1:40", "revision": "..." }
  ]
}
```

Do not collapse log events, stack frames, test failures, or warnings solely
because their text repeats. Count, ordering, timing, and which source produced an
event may be part of the evidence. Exact deduplication should be independently
toggleable and evaluated by content class.

### Structure-aware code compression and comments

An AST/CST lets the optimizer work with declarations and dependencies instead of
regular-expression line deletion. Tree-sitter is an incremental parser that
builds concrete syntax trees and remains useful in the presence of some syntax
errors ([official Tree-sitter documentation](https://tree-sitter.github.io/tree-sitter/)).
Parsing is a mechanism, not proof of safe omission. The minimum protected set for
a coding task normally includes:

- the user request, acceptance criteria, and security constraints;
- target declarations and complete signatures;
- referenced types, constants, imports/exports, and public contracts;
- relevant callers, callees, tests, schemas, configuration, and error text;
- code with initialization or import-time side effects;
- language and tool directives embedded in comments;
- exact source locations, revision, and hashes for every retained or referenced unit.

Blanket comment removal is unsafe. TypeScript triple-slash comments can declare
file or package dependencies and affect compilation
([TypeScript triple-slash directives](https://www.typescriptlang.org/docs/handbook/triple-slash-directives.html));
`@ts-expect-error` changes type-checking behavior
([TypeScript 3.9 notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-9.html));
and ESLint configuration comments alter lint rules
([ESLint configuration comments](https://eslint.org/docs/latest/use/configure/rules#using-configuration-comments)).
Other ecosystems have shebangs, pragmas, annotations, doc tests, formatter
controls, source-map directives, licensing requirements, and generated-code
markers. Comment removal needs a language-specific directive allowlist and must
fail open.

### Retrieval, relevance, dependencies, and repository indexes

Retrieval-augmented generation establishes the general pattern of combining a
model with a non-parametric index
([Lewis et al., NeurIPS 2020](https://papers.nips.cc/paper_files/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html)).
For a coding agent, a practical candidate score should keep its components
inspectable rather than pretending to be a calibrated probability:

```text
candidateScore =
    lexicalExactMatch
  + symbolMatch
  + pathAndLanguageMatch
  + diagnosticMatch
  + semanticSimilarity
  + dependencyProximity
  + taskRecency
  + explicitPriority
  - generatedOrVendorPenalty
```

Hard inclusion rules override that score. Relevant target files, referenced
definitions, requested constraints, error messages, and acceptance tests should
not compete with optional documentation for the final token. Use diversity and
per-source caps so near-duplicate chunks do not consume the whole budget.

Dependency expansion should operate over more than imports. Useful edges include
definition/reference, call, type use, inheritance, test-to-subject, route-to-
handler, schema-to-consumer, config-to-tool, project references, migrations, and
build targets. Each expansion consumes budget, so retain the edge reason in the
trace and test the policy by ablation. GraphCoder's result is motivation for this
design, not a guarantee that a particular graph is sufficient.

Repository indexes should be content- and revision-addressed. Incremental parsing
can update changed files; unchanged entries can be reused. Retrieval must reject or
refresh entries whose repository revision, build configuration, generated source,
or dependency lock state no longer matches. Index construction and embedding cost
belong in system measurements even when they are amortized over many requests.

### Delta transmission, references, and repeated state

Git's unified diff represents additions, deletions, and bounded unchanged context,
and `--unified=<n>` controls context lines
([git-diff](https://git-scm.com/docs/git-diff)). RFC 6902 defines an analogous
operation list for JSON documents
([JSON Patch](https://www.rfc-editor.org/rfc/rfc6902)). Deltas are effective when
the receiver has an authenticated base. A robust envelope includes:

```text
base content hash + base revision + patch + target hash + context lines
```

If the model has a repository-read tool, it can resolve the base on demand. If the
model has no such tool and the endpoint is stateless, replacing a file with “same
as hash X” removes information the model cannot access. In that case a reference
may reduce application payload while leaving the actual model prompt unchanged,
or it may simply damage quality.

DeepSeek Chat Completions and Responses are stateless. The client must send the
history needed for each call. The current Responses implementation does not support
`previous_response_id` or server-stored conversations. Consequently, repeated
system instructions cannot safely be omitted on the assumption that the API
remembers them. Stable prefixes may be cheaper through provider caching, but they
still appear in reported input usage.

### History, summaries, and semantic memory

History compression should preserve a typed state, not merely a prose synopsis.
A useful coding-session ledger separates:

- immutable requirements and acceptance criteria;
- current repository revision and environment;
- decisions with rationale and source turn;
- files/symbols inspected and their content hashes;
- attempted changes and deterministic outcomes;
- unresolved errors and open questions;
- superseded or contradicted statements;
- the recent raw-message window.

[MemGPT](https://arxiv.org/abs/2310.08560) motivates hierarchical memory and
moving information between limited working context and external storage.
[Generative Agents](https://arxiv.org/abs/2304.03442) combines a complete memory
stream with relevance/recency/importance retrieval and higher-level reflections.
These architectures show plausible mechanisms, not lossless memory. The
[LongMemEval](https://arxiv.org/abs/2410.10813) results document substantial
difficulty with information extraction, multi-session reasoning, temporal
reasoning, updates, and abstention. Iritoken therefore needs adversarial tests for
corrections, negation, ownership, temporal changes, and facts whose relevance is
not lexically obvious.

Summaries and memories also create security and privacy boundaries. Retrieved
content can contain indirect instructions; compression must not be treated as a
sanitizer. The original indirect-prompt-injection research shows that untrusted
retrieved data can steer application-integrated models
([Greshake et al.](https://arxiv.org/abs/2302.12173)). Maintain source labels and
authority boundaries, isolate users and repositories, apply retention/deletion
policies, and keep sensitive actions behind deterministic authorization.

## Repeated coding-agent context

The following table states what can usually be removed, compressed, referenced,
cached, summarized, or retrieved. “Usually” is a starting policy that still needs
task-specific evaluation.

| Repeated material | Preferred treatment | Must remain available | Important caveat |
| --- | --- | --- | --- |
| Repository structure | Retrieve a bounded subtree; compress untouched branches to counts or path prefixes; reference by revision | Target paths, nearby modules, tests, build/config roots | A path name can be the only signal for framework conventions |
| `package.json` or equivalent manifest | Parse and select scripts, package metadata, engines, relevant dependencies, and workspace links; reference full hash | Exact versions/ranges and scripts involved in the task | Dependency fields interact; do not summarize an install/debugging task loosely |
| `tsconfig.json` and project references | Parse and retain effective options relevant to module/type resolution, includes/excludes, paths, JSX, strictness, output, and references | The exact effective configuration and inheritance chain | `extends`, project references, and defaults can make a small field decisive |
| Coding conventions | Canonicalize one authoritative copy; retrieve sections by language/path; provider-cache as stable prefix | Applicable MUST/NEVER rules and file-scoped exceptions | Repeated system text still counts as tokens; conflicting rule scopes must not be merged |
| Architecture documentation | Index by component and decision; retrieve relevant sections; summarize with source links and dates | Constraints, trust boundaries, data flow, ownership, and explicit exceptions | Stale architecture prose is a common failure mode |
| Previously read files | Reference by content hash/revision and retrieve only when needed; send diffs after change | Current target body, relevant dependencies, and any changed file | A hash is useful only when a tool or local assembler can resolve it |
| Unchanged source code | Omit from a patch response; select/retrieve for later prompts; provider-cache a stable prefix only for cost | Interfaces and invariants required to reason about changes | DeepSeek does not remember omitted source between stateless requests |
| Dependency information | Parse manifests/lockfiles and retrieve the relevant dependency closure | Exact installed/resolved version for API or vulnerability questions | Package name similarity is not dependency relevance |
| Previous conversation history | Retain recent raw turns plus a structured task ledger and retrievable raw archive | Requirements, corrections, decisions, tool outcomes, pending work | Summary drift compounds over turns; tool-call protocol fields may be required |

The system should record the treatment used for each item. “Not sent because it
was cached” is invalid for a provider prefix cache. “Not sent because a local tool
can retrieve content hash X” is a reference decision and should be tested by
forcing retrieval and hash verification.

## Output optimization techniques

| Technique from the brief | Effect class | Defensible implementation | Risk or non-result |
| --- | --- | --- | --- |
| Concise response instructions | Output compression | Ask for the artifact and only the minimal explanation needed by the consumer | The model may ignore the instruction; shortness can omit caveats or verification evidence |
| Structured output | Output compression/validation | Return a small task-specific object or tool call with required fields only | Field names and JSON punctuation are tokens; structure can be longer than a concise natural answer |
| Verbosity control | Output compression | Define observable levels such as patch-only, patch-plus-test-summary, or full rationale | DeepSeek Responses currently accepts `text.verbosity` but documents that it has no effect; implement through prompt/schema and measure |
| Schema-constrained output | Validation, sometimes compression | Use the smallest schema that captures required content; reject malformed or incomplete output | A schema assures form, not factual correctness, and its schema text adds input tokens |
| Eliminate repeated explanations | Removal | Deduplicate sections locally or request one canonical explanation with references | Similar paragraphs can describe different scopes or caveats |
| Patch/diff instead of complete files | Reference/output compression | Return an applicable unified diff with base revision/hash and sufficient context | Patch may not apply, may hide required neighboring changes, or may be larger for rewrites |
| Suppress unchanged code | Removal/reference | Return changed hunks plus file paths, hashes, and validation commands/results | The consumer must possess the exact base; new files and generated files need complete content |
| Reference-based responses | Reference | Return stable artifact IDs, file/range references, or tool-call handles that the application resolves | A human or model without the referenced store cannot use the answer; access control and revision checks are required |
| Adaptive output budgets | Output compression | Select a cap from task type and required schema, reserve space for reasoning when enabled, retry only on explicit truncation policy | `max_tokens`/`max_output_tokens` is a ceiling, not quality control; truncation can create invalid code or JSON and retries add tokens |

DeepSeek Chat Completions supports JSON-object output. DeepSeek Responses supports
`text.format` values `text`, `json_object`, and `json_schema`. Structured output is
valuable for validation, but it does not by itself prove lower output usage. Compare
API-reported output tokens for the same required information.

Diff output is most compelling when the application already owns the exact base
file and can validate the patch. Store the base and result hashes, apply the patch
in a disposable worktree, and run format/type/test checks. If patch application or
quality checks fail, the fallback call and tokens are part of the optimized arm.

Adaptive budgets should be derived from the required artifact, not a desired
reduction claim. A utility function may need tens of tokens; a multi-file patch and
test evidence may need thousands. DeepSeek Responses documents that
`max_output_tokens` includes visible and reasoning tokens, so an overly small cap
in thinking mode can truncate the final answer even if the visible schema is small.

## Caching: three mechanisms that must not be conflated

### DeepSeek provider context caching

DeepSeek's context cache is automatically enabled. A later request can hit
persisted units of an identical prefix. The cache is best-effort, takes time to
construct, and is generally cleared after hours to days of disuse. It changes
input price and latency. It does not change what the client sends or what the API
counts:

```text
prompt_tokens = prompt_cache_hit_tokens + prompt_cache_miss_tokens
```

Therefore:

- keep reusable content in a stable prefix when optimizing cost;
- record cache hit and miss tokens separately;
- include all `prompt_tokens` in the token-reduction denominator and numerator;
- do not label a cache hit as repeated-system-prompt elimination;
- do not assume a hit, TTL, or cold-cache state;
- isolate benchmark arms with distinct `user_id` values when testing cache effects.

### Exact application response caching

An exact cache can key the complete effective request: provider, model, model
fingerprint/version policy, thinking mode, tools and schemas, system instructions,
user content, repository revision/content hashes, dependency state, permissions,
and relevant environment. A valid hit avoids a request. Report it as an avoided
request and cost/latency saving. It is not evidence that Iritoken compressed an
executed request.

### Semantic response caching

A semantic cache retrieves a previous answer for a sufficiently similar request.
[MeanCache](https://arxiv.org/abs/2403.02694) is a primary example and explicitly
frames the benefit as avoiding repeated LLM inference. Similarity is not answer
equivalence. Coding requests that differ by a negation, version, error message,
repository revision, user permission, or requested side effect can be close in
embedding space and require different answers.

Semantic caching should be off by default for state-changing agent actions,
security decisions, personalized data, live-state questions, debugging against a
mutable repository, and tasks whose output contains unique identifiers. Where it
is enabled, measure false-hit and false-miss rates on labeled pairs, namespace by
all effective context, use short TTLs/invalidation, and preserve a low-cost escape
path to the model. Cache hit rate alone is not a quality metric.

## DeepSeek V4 Flash facts for reproducible benchmarking

The following facts were verified against official DeepSeek pages on
**2026-08-11**. Pricing and mutable aliases must be rechecked on every live run.

### Model identity and mutability

- The callable model ID is `deepseek-v4-flash`.
- DeepSeek's 2026-07-31 change log calls the updated API release a public beta.
- The current pricing page labels the served model version
  `DeepSeek-V4-Flash-0731`.
- The documented `/models` response lists `deepseek-v4-flash` and
  `deepseek-v4-pro`; it does not list a version-pinned Flash ID.
- The July update kept the preview architecture and size but changed post-training.
- `deepseek-v4-flash` must therefore be treated as a mutable alias. Record the
  requested model, returned `model`, request timestamp, endpoint, and Chat
  Completions `system_fingerprint`. No official field makes a future replay
  identical after an alias update.

Official sources, retrieved 2026-08-11:

- [DeepSeek change log](https://api-docs.deepseek.com/updates/)
- [Models and pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [`GET /models` reference](https://api-docs.deepseek.com/api/list-models/)
- [DeepSeek V4 announcement](https://api-docs.deepseek.com/news/news260424/)
- [Official DeepSeek V4 Flash model card and technical-report links](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash)

The open model card documents the architecture and open weights, but it should
not be used to assert byte-for-byte equivalence with the evolving hosted API.

### Endpoints and state

| Interface | Official base/endpoint | Current relevant behavior |
| --- | --- | --- |
| OpenAI-compatible Chat Completions | `https://api.deepseek.com/chat/completions` | Supports `deepseek-v4-flash`; exposes cache hit/miss usage and `system_fingerprint` |
| OpenAI-compatible Responses | `https://api.deepseek.com/responses` | Supports Flash; stateless; no `previous_response_id`, stored conversation, or `store` |
| Anthropic-compatible Messages | `https://api.deepseek.com/anthropic` | Supports V4 models with documented field mappings and ignored features |

Official sources, retrieved 2026-08-11:

- [Chat Completions reference](https://api-docs.deepseek.com/api/create-chat-completion/)
- [Responses reference](https://api-docs.deepseek.com/api/create-response/)
- [Responses compatibility guide](https://api-docs.deepseek.com/guides/responses_api/)
- [Anthropic compatibility guide](https://api-docs.deepseek.com/guides/anthropic_api/)

The official model page states a 1M-token context length and maximum 384K output
for V4 Flash. Those are capacity limits, not evidence that dense million-token
prompts preserve quality.

### Usage fields

Chat Completions returns:

```text
usage.prompt_tokens
usage.prompt_cache_hit_tokens
usage.prompt_cache_miss_tokens
usage.completion_tokens
usage.completion_tokens_details.reasoning_tokens
usage.total_tokens
```

Responses returns:

```text
usage.input_tokens
usage.input_tokens_details.cached_tokens
usage.output_tokens
usage.output_tokens_details.reasoning_tokens
usage.total_tokens
```

Reasoning tokens are part of output/completion tokens. Calculate output cost from
the full provider field, not from a local tokenizer over visible answer text. For
streaming Chat Completions, request usage in the final stream chunk; for Responses,
read the terminal response event. DeepSeek's token-usage guide says the API's usage
result is authoritative; offline character ratios are approximate
([official token-usage guide](https://api-docs.deepseek.com/quick_start/token_usage/),
retrieved 2026-08-11).

### Thinking, sampling, and seed

Thinking mode is enabled by default. Fix it explicitly in every benchmark arm.
When thinking is enabled, DeepSeek documents that `temperature` and `top_p` have
no effect; fix `reasoning_effort` instead. For non-thinking runs, fix the sampling
configuration but do not assume deterministic output.

Neither the current Chat Completions request schema nor the Responses request
schema documents `seed`. The Responses compatibility guide also warns that
unsupported parameters can be silently ignored. The defensible conclusion is:

> Seeded reproducibility is not officially supported for this benchmark.

Do not send or log a seed as if it controlled output. Use repeated trials,
randomized paired ordering, confidence intervals, and backend fingerprints.
Source: [DeepSeek thinking-mode guide](https://api-docs.deepseek.com/guides/thinking_mode/),
retrieved 2026-08-11.

### Context-cache behavior

DeepSeek caching is automatic and prefix-based. A hit requires a complete match to
a persisted prefix unit. Construction takes seconds; hits are best-effort; unused
entries are normally cleared within hours to days; and cached input does not fix
output randomness. The API exposes `user_id`/`user` for KV-cache isolation.

Official sources, retrieved 2026-08-11:

- [Context caching](https://api-docs.deepseek.com/guides/kv_cache/)
- [`user_id` isolation](https://api-docs.deepseek.com/quick_start/rate_limit/)

For paired benchmarks, use separate user IDs for control and optimized arms to
prevent cross-arm cache contamination. Preserve one ID within a repeated-session
arm when measuring realistic warm-prefix economics. Since cache state cannot be
fully disabled or guaranteed, report observed hit/miss tokens instead of labeling
runs “cold” without evidence.

### Pricing snapshot and cost formula

The official 2026-08-11 Flash prices per one million tokens were:

| Token class | USD / 1M tokens |
| --- | ---: |
| Input, cache hit | $0.0028 |
| Input, cache miss | $0.14 |
| Output, including reasoning | $0.28 |

Calculate cost as:

```text
cost_usd =
    cache_hit_input_tokens  / 1_000_000 * 0.0028
  + cache_miss_input_tokens / 1_000_000 * 0.14
  + output_tokens           / 1_000_000 * 0.28
```

For Responses, `cache_miss_input_tokens = input_tokens - cached_tokens`. Store the
pricing table and retrieval date inside every result artifact. The official page
warns that pricing may change; historical DeepSeek cache announcements contain
older prices and must not be substituted for the live pricing page.

## Evidence-based implementation priorities

1. **Protect before optimizing.** Mark user requirements, acceptance criteria,
   security constraints, referenced code, exact diagnostics, signatures, types,
   dependency edges, tests, and protocol-required fields as non-removable.
2. **Start with verifiable deterministic transforms.** Use format-aware
   normalization, validated structured minification, exact duplicate detection,
   content hashes, and provenance-preserving references.
3. **Select before summarizing.** In noisy repository workloads, hybrid retrieval
   and dependency expansion have a clearer failure model than abstractive
   rewriting. Track required-source recall and every omitted candidate.
4. **Keep retrieval adaptive.** Dense, highly relevant tasks should retain most
   context. Do not force a target percentage when coverage or dependency closure
   is low.
5. **Treat learned/abstractive compression as experimental.** Put it behind a
   toggle and quality gate; preserve critical spans verbatim; include compressor
   cost and latency; fall back when confidence is not validated.
6. **Use summaries as indexed state, not truth.** Retain source turn IDs, raw
   history retrieval, temporal/supersession metadata, and an uncompressed recent
   window.
7. **Use diffs when the base is real.** Require revision/hash verification and an
   applicable-patch check. Otherwise send the necessary full content.
8. **Control output by required artifact.** Prefer patches, tool calls, or compact
   schemas when the consumer can validate them. Count retries and truncated calls.
9. **Optimize provider-prefix layout for cost only after quality.** Stable prefixes
   can produce cache discounts, but cache hits never enter the token-reduction
   claim.
10. **Separate every metric.** Publish input, visible output, reasoning output,
    total tokens, cache hits/misses, avoided requests, latency, preprocessing cost,
    API cost, quality, and fallback rate independently.

## Required risks and falsification tests

Every optimization should be independently toggleable and tested against at least
the following failure classes:

- a dense task where nearly every input fact is required;
- duplicated text whose path or occurrence count changes meaning;
- exact identifiers, versions, numbers, negative requirements, and security rules;
- config inheritance, project references, generated code, reflection, dynamic
  imports, and framework-convention dependencies;
- incomplete or syntactically invalid code;
- comments that contain compiler/linter directives or requested documentation;
- corrected, contradicted, or time-varying conversation facts;
- retrieval misses and stale repository indexes;
- a diff with the wrong base hash and a reference the model cannot resolve;
- summary hallucination and repeated-summary drift;
- semantic-cache near-collisions and stale answers;
- output truncation, malformed structured output, patch-application failure, and
  fallback retries;
- randomized provider output with no seed control;
- backend alias or pricing changes between runs.

The most important falsifier is the highly relevant dense-context case. A
quality-first optimizer should choose little or no compression there. Failure to
reach a requested 50%, 70%, or 90% reduction is correct behavior when further
removal would cross the declared quality-risk threshold.

## Claim boundary

Primary sources justify implementing and testing these mechanisms. They do not
justify claiming that Iritoken reduces tokens by 50–90%, that any reduction is
quality-neutral, or that one technique contributes a particular percentage on
DeepSeek V4 Flash. Such claims require the repository's paired, API-measured,
quality-gated benchmark across representative and adversarial workloads.

Until that evidence exists, the defensible description is:

> Iritoken provides independently testable context selection, deterministic
> compaction, retrieval, memory, cache-aware prompting, and concise-output
> mechanisms. Achievable token and cost reductions depend on workload redundancy
> and are reported from measured benchmarks, not assumed targets.
