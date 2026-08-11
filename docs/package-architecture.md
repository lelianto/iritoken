# Package architecture and use cases

`iritoken` is distributed as one npm package, but its capabilities are grouped
by responsibility. Installing one package does not imply that every application
must enable every capability.

The package's primary identity remains deterministic context optimization. The
other modules help applications decide what context to send, avoid repeated
work, choose a suitable model, integrate with providers, and verify the result.

```text
Your application, agent, or CLI
                 |
        optional orchestration
                 |
  +--------------+---------------+
  | Core         | Context       |
  | Cache        | Routing       |
  | Providers    | Evaluation    |
  | Observability                |
  +--------------+---------------+
                 |
       LLM provider (optional)
```

The core and context APIs can run locally without calling an LLM. Provider
adapters make network requests only when the application explicitly invokes
them.

![Solo-developer and enterprise adoption paths](https://raw.githubusercontent.com/lelianto/iritoken/main/assets/adoption-paths.png)

## Module map

### Core optimization

**Purpose:** mechanically remove known low-value input and enforce measurable
size limits.

**APIs:** `optimize()`, `optimizeContext()`, `optimizeStructured()`,
`optimizeSegments()`, `estimateTokens()`, tokenizer adapters, and cleaner
classes.

**What it does:** removes ANSI sequences, excessive whitespace, consecutive
duplicates, repeated stack frames, repeated terminal blocks, and supported
test-runner noise. It also compacts JSON/JSONL without changing parsed values
and reports character or caller-supplied exact-token statistics.

**Solo developer use cases:**

- Clean test, build, lint, or deployment output before pasting it into an AI
  assistant.
- Add a local CLI filter to an agent workflow without an API key or runtime
  dependency.
- Measure which preset works on a project's own logs before automating it.

**Enterprise use cases:**

- Apply a deterministic preprocessing policy to tool output across many agents.
- Reduce repeated context while retaining an auditable transformation record.
- Enforce bounded inputs at an internal AI gateway before provider submission.

### Context selection and budgeting

**Purpose:** decide which information deserves space in a limited context
window. This module may reduce sent tokens, but its defining responsibility is
relevance and budget compliance.

**APIs:** `rankContext()`, `fitTokenBudget()`, and `compactConversation()`.

**What it does:** scores context using inspectable signals, retains required and
recent messages, and selects high-value context without exceeding a hard token
budget.

**Solo developer use cases:**

- Keep the latest turns and relevant error evidence in a long coding session.
- Fit repository notes or search results into a model's context limit.
- Prevent a local agent from failing because a prompt is too large.

**Enterprise use cases:**

- Apply per-product, tenant, or model token limits at a shared gateway.
- Preserve mandatory policy or system messages while compacting user history.
- Make context-selection decisions inspectable for incident review.

### Retrieval

**Purpose:** find relevant source material instead of sending every available
document.

**APIs:** `SemanticIndex`, `ContextStore`, and `optimizeRetrievable()`.

**What it does:** performs bounded cosine-similarity search over embeddings
provided by the caller and supports content-addressed retrieval of originals.
The package does not upload content or bundle an embedding model.

**Solo developer use cases:**

- Select the most relevant project note or code explanation for a question.
- Keep recoverable originals while passing a compact representation to a model.
- Prototype retrieval with precomputed embeddings and no vector database.

**Enterprise use cases:**

- Insert a local selection layer in front of an existing embedding service.
- Limit retrieval fan-out and record which document IDs entered a prompt.
- Separate proprietary storage and embedding policy from optimization logic.

### Cache

**Purpose:** avoid repeated model work and prepare requests to benefit from
provider-managed prompt caching.

**APIs:** `SemanticCache`, `prepareCacheAwarePrompt()`, and
`cacheHitPercentage()`.

**What it does:** provides bounded exact/semantic cache lookup with TTL and
eviction, and arranges reusable messages into a stable prompt prefix. It does
not implement a provider's server-side prompt cache.

**Solo developer use cases:**

- Reuse answers for equivalent local queries during development.
- Reduce repeated calls in scripts or evaluation loops.
- Keep a stable system prefix for providers that support automatic caching.

**Enterprise use cases:**

- Reduce duplicate requests across controlled workloads with explicit TTLs.
- Track exact hits, semantic hits, misses, and provider-reported cache usage
  separately.
- Apply tenant isolation and invalidation policy around the package cache.

### Model routing

**Purpose:** select an eligible model based on requirements rather than alter
prompt content.

**API:** `routeModel()`.

**What it does:** filters a caller-managed model catalog by context capacity and
required capabilities, then selects by priority, estimated cost, or capacity.

**Solo developer use cases:**

- Send small routine tasks to a cheaper model and large tasks to a capable one.
- Fail early when no configured model supports the required context or feature.
- Experiment with routing without coupling application code to one provider.

**Enterprise use cases:**

- Enforce approved-model and capability policies in a central gateway.
- Route by workload class while retaining a deterministic decision reason.
- Control cost and capacity independently from context-compression policy.

### Provider adapters

**Purpose:** normalize explicit provider calls and actual usage reporting.

**APIs:** `createOpenAICompatibleAdapter()` and `createDeepSeekAdapter()`.

**What it does:** sends OpenAI-compatible Chat Completions requests when invoked
and normalizes prompt, completion, total, and cache token usage where reported.
Provider-specific authentication, availability, pricing, and feature behavior
remain external concerns.

**Solo developer use cases:**

- Call an OpenAI-compatible endpoint through one small interface.
- Compare local token estimates with usage returned by the provider.
- Replace an endpoint without rewriting the context pipeline.

**Enterprise use cases:**

- Put provider normalization behind an internal credential and egress layer.
- Reconcile estimated savings with billable provider usage.
- Add organization-specific adapters without changing deterministic core APIs.

### Observability

**Purpose:** explain and measure optimization decisions; it does not reduce
tokens by itself.

**APIs:** optimizer observers, `optimizeAudited()`, and `MetricsCollector`.

**What it does:** reports cleaner decisions, reductions, hashes, and bounded
numeric observations while allowing applications to choose their own telemetry
destination.

**Solo developer use cases:**

- Understand why an input changed or was preserved.
- Compare presets and workloads locally.
- Detect a regression before adopting a new optimization rule.

**Enterprise use cases:**

- Export aggregate savings, latency, cache, and routing metrics.
- Audit transformations without storing raw prompts in telemetry.
- Monitor policy adoption and anomalies across applications or teams.

### Evaluation

**Purpose:** verify that efficiency gains do not cross an accepted quality
threshold.

**API:** `evaluateQualityGate()` plus the repository benchmark runners.

**What it does:** evaluates paired original/optimized cases against saving and
quality requirements. It provides a gate, not a universal guarantee of semantic
equivalence.

**Solo developer use cases:**

- Build a small task set from real project prompts before enabling automation.
- Reject a preset that removes required facts even if it saves more tokens.
- Compare optimization changes reproducibly.

**Enterprise use cases:**

- Require per-domain evaluation before a policy reaches production.
- Track quality retention alongside token, cost, and latency changes.
- Use release gates and shadow traffic to manage optimization risk.

## Capability boundaries

Use separate metrics because the modules create different kinds of value:

| Metric | Meaning | Typical source |
| --- | --- | --- |
| `tokensRemoved` | Tokens mechanically removed from an input | Core optimization |
| `tokensSelectedOut` | Tokens omitted to satisfy relevance or budget policy | Context/retrieval |
| `tokensAvoided` | Tokens not sent because a request was served from cache | Cache |
| `providerInputTokens` | Actual prompt usage reported by a provider | Provider adapter |
| `costReduced` | Estimated or actual cost difference, possibly due to routing or cached-token pricing | Routing/provider billing data |
| `qualityRetention` | Task quality after optimization compared with the original | Evaluation |
| `latencyImpact` | Time added or avoided by the complete pipeline | Application telemetry |

Do not combine these into a single “token saving” number. For example, selecting
a cheaper model can reduce cost without removing a token, while a semantic-cache
hit can avoid an entire request without compressing its prompt.

## Recommended adoption paths

### Solo developer

Start with `optimize()` or the CLI, inspect the result, then add an exact
tokenizer and a hard budget if the workflow needs them. Add retrieval or cache
only when repeated requests or large document sets justify the extra policy.
Provider adapters and model routing are optional.

### Enterprise

Start in shadow mode with organization-specific fixtures and quality gates.
Separate deterministic transformation policy from retrieval, caching, routing,
credentials, and telemetry policy. Roll modules out independently, preserve
decision evidence, and reconcile local estimates with actual provider usage.

## Composition model

Applications can call the modules independently today. A future optional
orchestration API may compose them into a `chat()` workflow, but it should remain
configuration-driven and expose every module's separate result. Orchestration
must not erase the boundaries between compression, selection, avoided requests,
cost routing, and quality validation.
