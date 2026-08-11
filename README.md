<div align="center">
  <img src="https://raw.githubusercontent.com/lelianto/iritoken/main/assets/logo.svg" width="112" height="112" alt="iritoken logo" />

  <h1>iritoken</h1>

  <p><strong>Spend tokens on answers, not terminal noise.</strong></p>

  <p>
    A deterministic, zero-runtime-dependency TypeScript toolkit that removes<br />
    low-value noise from AI coding context—locally, safely, and without an LLM.
  </p>

  <p>
    <a href="https://www.npmjs.com/package/iritoken"><img src="https://img.shields.io/npm/v/iritoken?style=flat-square&color=2563eb" alt="npm version" /></a>
    <a href="https://github.com/lelianto/iritoken/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/lelianto/iritoken/ci.yml?branch=main&style=flat-square&label=CI" alt="CI status" /></a>
    <a href="https://github.com/lelianto/iritoken/actions/workflows/scorecard.yml"><img src="https://api.scorecard.dev/projects/github.com/lelianto/iritoken/badge" alt="OpenSSF Scorecard" /></a>
    <a href="https://bundlephobia.com/package/iritoken"><img src="https://img.shields.io/bundlephobia/minzip/iritoken?style=flat-square" alt="minified and gzipped bundle size" /></a>
    <a href="https://www.npmjs.com/package/iritoken"><img src="https://img.shields.io/node/v/iritoken?style=flat-square&color=339933" alt="supported Node.js version" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/npm/l/iritoken?style=flat-square&color=7c3aed" alt="npm license" /></a>
    <a href="https://www.npmjs.com/package/iritoken"><img src="https://img.shields.io/npm/dm/iritoken?style=flat-square&color=0f766e" alt="npm downloads" /></a>
    <img src="https://img.shields.io/badge/dependencies-0-16a34a?style=flat-square" alt="zero runtime dependencies" />
  </p>

  <p>
    <a href="#quick-start">Quick start</a> ·
    <a href="#cli">CLI</a> ·
    <a href="#library-api">API</a> ·
    <a href="#benchmarks">Benchmarks</a> ·
    <a href="#security">Security</a>
  </p>
</div>

---

<p align="center">
  <img src="https://raw.githubusercontent.com/lelianto/iritoken/main/assets/package-architecture.png" width="1100" alt="iritoken modular optimization toolkit: deterministic local core with optional context budgeting, retrieval, cache, routing, provider, observability, and evaluation modules" />
</p>

AI coding workflows repeatedly send ANSI codes, duplicate logs, redundant stack
frames, test-runner noise, and excessive whitespace to language models.
`iritoken` removes that deterministic noise before it consumes context-window
space or API budget.

```text
same input + same configuration = same output
```

The core optimization APIs make no network requests, use no model, need no API
key, and never summarize content. When a transformation is uncertain, the original
information is preserved.

## Table of contents

- [Why iritoken?](#why-iritoken)
- [Features](#features)
- [Package architecture](#package-architecture)
- [Quick start](#quick-start)
- [CLI](#cli)
- [Library API](#library-api)
  - [Presets](#presets)
  - [Cleaner overrides](#cleaner-overrides)
  - [Exact token measurement](#exact-token-measurement)
  - [Explainability and observability](#explainability-and-observability)
- [Integrations](#integrations)
  - [Chat messages](#chat-messages)
  - [Node streams](#node-streams)
- [Production context controls](#production-context-controls)
- [How core optimization works](#how-core-optimization-works)
- [Safety guarantees](#safety-guarantees)
- [Benchmarks](#benchmarks)
- [Security](#security)
- [Development](#development)
- [Project structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Why iritoken?

Raw tool output is useful, but it is rarely token-efficient. A typical agent
loop may resend the same noisy context several times. Even small deterministic
savings compound across prompts, retries, models, and users.

<p align="center">
  <img src="https://raw.githubusercontent.com/lelianto/iritoken/main/assets/context-optimization.png" width="900" alt="Raw coding context is reduced to meaningful errors, evidence, locations, values, and summaries" />
</p>

`iritoken` is intentionally narrower than a summarizer. It removes patterns it
can verify mechanically and leaves unique content alone.

## Features

- **Deterministic:** reproducible output with no probabilistic model behavior.
- **Local core:** optimization has no telemetry, network requests, storage, or
  API keys. Optional provider adapters perform outbound calls only when invoked.
- **Zero runtime dependencies:** small supply-chain and installation footprint.
- **Conservative by default:** `safe` is the default preset.
- **Idempotent:** optimizing an optimized result produces the same text.
- **Non-expanding:** transformations never return more text than they receive.
- **Explainable:** every cleaner reports whether it ran, changed, or skipped.
- **Composable:** library API, Unix filter, JSON output, chat helpers, and streams.
- **Measured:** deterministic regression corpus plus live-model quality results.
- **Typed:** ESM TypeScript package with bundled declaration files.

## Package architecture

`iritoken` is one npm package with modular responsibilities. Its primary job is
deterministic context optimization; optional modules add context selection,
retrieval, caching, routing, provider integration, observability, and quality
evaluation.

<p align="center">
  <img src="https://raw.githubusercontent.com/lelianto/iritoken/main/assets/adoption-paths.png" width="1000" alt="Separate progressive adoption paths for solo developers and enterprises using the same modular iritoken package" />
</p>

| Module | Primary responsibility | Does it directly remove tokens? |
| --- | --- | --- |
| Core | Clean and compact supported input deterministically | Yes |
| Context | Rank, select, and fit information to a hard budget | Sometimes |
| Retrieval | Fetch only relevant source material | Indirectly |
| Cache | Avoid repeated requests or prepare stable prefixes | No compression |
| Routing | Select an eligible model by policy | No |
| Providers | Send explicit requests and normalize actual usage | No |
| Observability | Explain and measure decisions | No |
| Evaluation | Verify savings and quality retention together | No |

The modules can be adopted independently by a solo developer or combined behind
an enterprise AI gateway. Metrics remain separate: tokens removed, context
selected out, requests avoided, provider usage, cost reduction, latency impact,
and quality retention are not interchangeable.

See [package architecture and use cases](docs/package-architecture.md) for each
module's APIs, boundaries, and solo-developer and enterprise adoption examples.

## Quick start

### Install

```bash
npm install iritoken
```

Node.js 18 or newer is required.

### Optimize text

```ts
import { optimize } from "iritoken";

const result = optimize(rawContext, { preset: "balanced" });

console.log(result.text);
console.log(result.stats.reductionPercentage);
```

### Use it as a Unix filter

```bash
npm test 2>&1 | npx iritoken --preset balanced --stdout > context.txt
```

That is the core workflow: produce context, optimize it locally, then send the
result to the model or agent of your choice.

## CLI

```text
Usage:
  iritoken [file] [options]
  command | iritoken [options]

Options:
  -o, --output <path>   Write optimized text to a file
  --preset <name>       safe (default) | balanced | aggressive
  --stdout              Emit optimized text only
  --json                Emit a versioned machine-readable result
  --json-version <1|2>  Select JSON schema (v1 remains the default)
  --check               Enforce CI policies and fail with exit code 1
  --min-reduction <pct> Require minimum character reduction
  --max-output-bytes <n> Require a maximum UTF-8 output size
  --require-detection <type> Require a detected content type
  --segments            Optimize labelled terminal-output Markdown fences only
  --dry-run             Report statistics without writing output
  --explain             Explain the transformations
  --max-input-mb <n>    Override the 16 MiB input limit
  -q, --quiet           Suppress the report when using --output
  -h, --help            Show help
  -v, --version         Show version
```

### Common recipes

```bash
# Analyze a log without modifying it
iritoken build.log --dry-run

# Save optimized context securely
iritoken build.log --preset balanced --output build.optimized.log

# Compose with another command
npm test 2>&1 | iritoken --stdout | pbcopy

# Inspect machine-readable statistics
iritoken build.log --json | jq '.stats'

# Enforce a context budget in CI and receive the complete policy result
iritoken build.log --check --min-reduction 10 --max-output-bytes 100000 --json-version 2

# Understand why cleaners changed or skipped the input
iritoken build.log --preset balanced --explain
```

`--stdout` writes only optimized text. Human reports never contaminate the
pipeline. `--json` uses a top-level `schemaVersion` so automation can validate
the response format, and reports UTF-8 byte counts independently from character
and optional exact-token counts.

JSON v1 remains the compatibility default. Schema v2 is opt-in and adds a
stable policy result. A failed policy prevents `--output` from being written.

### GitHub Action

```yaml
- uses: lelianto/iritoken@v0.4.0
  with:
    input: test-output.log
    output: test-output.optimized.log
    preset: balanced
    min-reduction: "10"
    max-output-bytes: "100000"
```

The action writes a job summary, exposes `passed`, `reduction-percentage`, and
`optimized-bytes` outputs, and uploads the optimized file by default.

## Library API

For mixed Markdown, `optimizeSegments(markdown, options)` is an opt-in API that
only changes explicitly labelled terminal-output fences. Prose, source-code
fences, and fence markers are preserved exactly.

### `optimize(input, options?)`

```ts
import { optimize } from "iritoken";

const result = optimize("\u001b[31mERROR\u001b[0m\n\n\nDetails", {
  preset: "safe",
  maxInputCharacters: 2_000_000
});
```

The result contains optimized text and character statistics:

```ts
{
  text: "ERROR\n\nDetails",
  stats: {
    originalCharacters: 27,
    optimizedCharacters: 14,
    charactersRemoved: 13,
    reductionPercentage: 48.15,
    transformations: { ansi: 2, whitespace: 1 },
    detection: { type: "generic-terminal-output", confidence: "high" },
    decisions: [
      { cleaner: "ansi", enabled: true, changes: 2, reason: "applied" }
    ]
  }
}
```

### Presets

| Preset | Behavior | Recommended for |
| --- | --- | --- |
| `safe` | ANSI plus whitespace and consecutive exact duplicates in confidently detected terminal output | Default and unknown input |
| `balanced` | `safe` plus conservative stack and test-output cleanup | Coding-agent and CI context |
| `aggressive` | `balanced` plus repeated identical multiline blocks | Opt-in repetitive terminal output |

The published live-model quality result applies to `balanced`. The additional
aggressive block cleaner is deterministic and corpus-tested, but has not yet
received the same live-model validation.

### Cleaner overrides

Every cleaner can be enabled or disabled independently:

```ts
const result = optimize(context, {
  preset: "balanced",
  cleaners: {
    whitespace: false,
    testOutput: true,
    repeatedBlocks: false
  }
});
```

Available keys are `ansi`, `whitespace`, `duplicateLines`, `stackTrace`,
`testOutput`, and `repeatedBlocks`.

### Exact token measurement

Character statistics always work. Exact token statistics require the tokenizer
for the model you intend to use:

```ts
import { fromEncoder, optimize } from "iritoken";

const result = optimize(context, {
  tokenCounter: fromEncoder(modelEncoder)
});

console.log(result.stats.tokens);
```

Tokenizers exposing `tokenize()` can use `fromTokenizer()` instead. The
adapters are structural and introduce no dependency. Without a supplied
counter, the library does not claim exact model-token savings.

### Explainability and observability

`stats.decisions` records an outcome for every cleaner:

- `applied`
- `not-applicable`
- `disabled-by-preset`

For metrics, use synchronous metadata-only observer hooks. Input text is never
passed to the observer:

```ts
optimize(context, {
  observer: {
    onCleaner(decision) {
      metrics.increment(`iritoken.${decision.cleaner}.${decision.reason}`);
    },
    onComplete(stats) {
      metrics.observe("iritoken.reduction", stats.reductionPercentage);
    }
  }
});
```

## Integrations

### Chat messages

Optimize OpenAI-compatible message objects without coupling the package to any
provider SDK:

```ts
import { optimizeMessages } from "iritoken";

const { messages, stats, messageStats, totalStats } = optimizeMessages(request.messages, {
  preset: "balanced",
  roles: ["tool", "user"]
});
```

The input array is never mutated. By default, only `user` and `tool` messages
are optimized; system instructions and assistant messages are copied unchanged.
`stats` preserves the original ordered result shape, `messageStats` identifies
the source index and role, and `totalStats` aggregates savings and cleaner
counts across optimized messages.

### Node streams

```ts
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createOptimizeTransform } from "iritoken/stream";

await pipeline(
  createReadStream("build.log"),
  createOptimizeTransform({
    preset: "balanced",
    maxInputBytes: 8 * 1024 * 1024
  }),
  createWriteStream("context.txt")
);
```

The transform honors backpressure and enforces a byte limit. It buffers input
up to that limit before emitting because content detection requires the full
context to remain exactly equivalent to `optimize()`.

For input already known to be terminal output, use the memory-bounded variant:

```ts
import { createTerminalOptimizeTransform } from "iritoken/stream";

await pipeline(
  createReadStream("build.log"),
  createTerminalOptimizeTransform({ maxLineBytes: 1024 * 1024 }),
  createWriteStream("context.txt")
);
```

It incrementally removes ANSI noise, normalizes terminal whitespace, and
collapses consecutive duplicate lines. It deliberately skips global detection
and the balanced/aggressive cleaners.

See [the integration guide](docs/integrations.md) for additional examples.

## Production context controls

The unified router uses lexical-lossless JSON/JSONL compaction, command
provenance, or the conservative generic pipeline as appropriate:

```ts
import { optimizeContext } from "iritoken";

const result = optimizeContext(toolOutput, { command: "npm test" });
console.log(result.strategy, result.stats.reductionPercentage);
```

Additional opt-in APIs support shadow-mode measurement with SHA-256 evidence,
bounded content-addressed original retrieval, and paired quality gates that fail
when saving or quality thresholds are missed. See the
[production context optimization guide](docs/production-context-optimization.md)
for examples, security boundaries, and validation requirements.

For unit-based repository or conversation context, `createIritoken()` adds
fail-open target budgeting and a decision ledger:

```ts
import { createIritoken, estimateTokens } from "iritoken";

const iritoken = createIritoken({
  tokenCounter: { count: estimateTokens },
  targetReductionPercentage: 50,
  relevanceFiltering: true,
  historyCompression: true,
});

const result = iritoken.optimize({ query, units });
console.log(result.metrics.targetAchievable, result.metrics.requiredCoverage);
```

Mandatory requirements, direct references, system instructions, signatures,
errors, and dependency-protected units are retained even when that makes the
requested target impossible.

## How core optimization works

<p align="center">
  <img src="https://raw.githubusercontent.com/lelianto/iritoken/main/assets/cleaning-pipeline.png" width="720" alt="iritoken cleaning pipeline from input through content detection and cleaners to optimized text, statistics, and decisions" />
</p>

| Cleaner | What it changes | What it preserves |
| --- | --- | --- |
| ANSI | CSI and OSC control sequences | Visible text |
| Whitespace | Trailing space and excessive blank lines | Indentation and meaningful alignment |
| Duplicates | Consecutive exact duplicate lines | One copy plus repetition count |
| Stack trace | Consecutive identical frames | Errors, unique frames, paths, line numbers |
| Test output | Repeated passing-test runs in fully passing reports | Failures, assertions, values, summaries |
| Repeated blocks | Three or more identical 2–8-line terminal blocks | One complete block plus repetition count |

Content is classified as terminal output, source code, stack trace, test
output, or unknown. Riskier transformations only run when their expected
content type is recognized.

## Safety guarantees

The implementation and regression suite enforce these invariants:

1. **Deterministic:** identical inputs and options produce identical outputs.
2. **Idempotent:** `optimize(optimize(x).text).text === optimize(x).text`.
3. **Non-expanding:** optimized text is never longer than the original.
4. **Bounded:** library and CLI inputs are limited by default.
5. **Conservative:** unique or ambiguous information is preserved.
6. **Content-blind telemetry:** observer hooks receive metadata, not source text.

Deterministic optimization does not mean semantic perfection. Evaluate the
chosen preset against your own corpus before inserting it into a critical
automated workflow.

## Benchmarks

Benchmarks are generated by running the real implementation against committed
fixtures. Compression is useful only when task quality survives.

### 50–90% hypothesis status

The current DeepSeek V4 Flash evidence does **not** support a general 50–90%
end-to-end reduction claim. Recalculated from the stored API usage, the live-v3
campaign reduced total tokens **10,226 → 9,745 (4.70%)** and estimated cost
**4.21%**. The context-v4.1 campaign reduced total tokens **5,078 → 4,584
(9.73%)** and estimated cost **2.32%**. Dense cases sometimes correctly save
0% because relevant context is retained.

The honest current claim is: *Iritoken reduced prompt tokens by 5.39–12.0%
(4.70–9.73% end to end) on the named DeepSeek V4 Flash synthetic campaigns
with comparable fact recall; savings vary by workload.* This is exploratory,
not proof of statistical equivalence or production generalization. See the
[research review](docs/token-reduction-research.md) and
[hypothesis protocol](docs/hypothesis-benchmark-protocol.md). The
[competitor landscape](docs/competitor-landscape.md) records the nearest
alternatives, their published claims, and the accounting differences that
prevent direct percentage comparisons.

<p align="center">
  <img src="https://raw.githubusercontent.com/lelianto/iritoken/main/assets/benchmark-evidence.png" width="1100" alt="Dated iritoken benchmark evidence separating deterministic local estimates from the 2026-08-11 DeepSeek V4 Flash live context campaign" />
</p>

### Current deterministic results

| Metric | Result |
| --- | ---: |
| Quality tasks | **20/20 → 20/20** |
| Success regression | **0 percentage points** |
| Estimated input tokens | **3,117 → 2,669** |
| Estimated token reduction | **14.4%** |
| Balanced corpus character reduction | **15.7%** |
| Corpus regression matrix | **20 tasks × 3 presets passed** |
| Semantic invariants | **33/33 passed** |
| Terminal eligibility | **100% recall, 100% specificity** |
| Unit and integration tests | **188/188 passed** |

The deterministic corpus includes npm, TypeScript, Vitest, Jest, pytest, Go,
Cargo, JavaScript and Python stack traces, repetitive logs, mixed agent
context, Docker, Docker Compose, Kubernetes, Terraform, ESLint, GitHub Actions,
and Python failures.

The fixture percentages describe character reduction, not information loss.
For example, Python decreases from 544 to 401 characters by replacing three
identical frame/source records with one record and an explicit repetition
count. Fully passing pytest, Go, and Cargo reports remove repetitive case lists
while retaining their authoritative summaries. If a supported failure marker
is present, the complete test report is preserved.

| New 0.3.0 fixture | Original | Optimized | Character reduction |
| --- | ---: | ---: | ---: |
| Python traceback | 544 | 401 | **26.3%** |
| pytest passing report | 377 | 103 | **72.7%** |
| Go passing report | 269 | 63 | **76.6%** |
| Cargo passing report | 214 | 114 | **46.7%** |

The 15.7% corpus figure is calculated from total characters across every
fixture, including sensitive inputs deliberately left unchanged. The 14.4%
token figure is a heuristic estimate—an average of `characters / 4` and a
word-like count—not an exact model tokenizer result. See the
[0.3.0 coverage methodology](docs/enhancements/005-python-and-test-runner-coverage.md)
and [0.4.0 CI/release methodology](docs/enhancements/006-ci-adoption-and-release-integrity.md)
for examples, formulas, safeguards, validation evidence, and limitations.

### Live-model quality result

The latest quality-first run used `deepseek-v4-flash`, thinking disabled, five
trials, and 60 requests on a newly authored six-task suite:

| Metric | Original | Optimized |
| --- | ---: | ---: |
| API-reported input tokens | 8,635 | 8,170 |
| Fact recall | 92.5% | 95.8% |
| Complete tasks | 21/30 | 25/30 |

- Actual API token reduction: **5.39%**
- Paired mean quality change: **+3.33 percentage points**
- Task-cluster bootstrap 95% CI: **0.00 to +10.00 percentage points**
- Pre-registered −5pp non-inferiority margin: **passed**
- Recorded cost: approximately **$0.003239**

This result supports non-inferiority for that model, configuration, and task
suite—not every model or workload. The corpus ID and SHA-256 fingerprint are
recorded with the report so the result can be traced to exact fresh inputs.
The apparent quality improvement is specific to this sample and is not claimed
as proof that optimization generally improves model quality.

The full context-engine campaign separately tested retrieval, ranking, hard
budgets, conversation compaction, model routing, prompt-prefix preparation,
semantic-cache probes, provider usage normalization, and scoring. It used nine
new synthetic tasks from easy to hard, three randomized trials per variant, and
54 DeepSeek V4 Flash requests:

| Context-engine metric | Original | Optimized |
| --- | ---: | ---: |
| Complete runs | 27/27 | 27/27 |
| Fact recall | 100.0% | 100.0% |
| API-reported prompt tokens | 4,425 | 3,894 |
| Prompt-token reduction | — | **12.0%** |

Every prompt records eleven checkpoints from raw context through provider
response and fact scoring. The initial campaign exposed an ambiguous
prompt/rubric mismatch; that result was preserved, diagnosed, corrected under a
new corpus fingerprint, and the complete campaign was rerun. See the
[full analysis](docs/deepseek-v4-context-campaign-analysis.md) and
[final report](benchmark/results/DEEPSEEK-CONTEXT-V4-1.md).

### Performance

Latest isolated balanced-preset run (median of three processes):

| Input | Time | Peak RSS | Throughput cost |
| --- | ---: | ---: | ---: |
| 10 KiB | ~3.0 ms | ~75.0 MiB | ~308 ms/MiB |
| 100 KiB | ~6.9 ms | ~76.3 MiB | ~71 ms/MiB |
| 1 MiB | ~31.2 ms | ~90.9 MiB | ~31 ms/MiB |
| 10 MiB | ~265.3 ms | ~233.5 MiB | ~27 ms/MiB |

For a 12 MiB terminal workload, the incremental transform used ~89.5 MiB peak
RSS versus ~276.3 MiB for the generic buffered transform while producing the
same output size.

The context-engine benchmark covers ranking, hard-budget selection, 64-dimension
semantic indexing, and top-k retrieval in isolated processes:

| Context entries | Median time | Peak RSS |
| ---: | ---: | ---: |
| 100 | 2.5 ms | 79.2 MiB |
| 1,000 | 9.9 ms | 83.5 MiB |
| 10,000 | 81.4 ms | 128.5 MiB |

See the [generated compression report](benchmark/results/REPORT.md) and
[quality methodology](docs/quality-benchmark.md) for fixtures, limitations,
historical results, and reproduction instructions. Security controls,
complexity, performance gates, and current measurements are recorded in the
[security/performance report](docs/security-performance.md).

### Reproduce locally

```bash
npm run benchmark                    # offline hypothesis preflight; no API calls
npm run benchmark:compression -- balanced
npm run benchmark:quality
npm run benchmark:corpus
npm run benchmark:perf
npm run benchmark:context-perf
npm run report
```

Live-provider benchmarks are intentionally separate and cost-capped:

```bash
npm run benchmark:groq -- --trials 1
npm run benchmark:deepseek -- --trials 1 --max-cost-usd 0.01
npm run benchmark:deepseek:campaign -- --trials 3 --max-cost-usd 0.03
```

## Security

Core optimization is local: it does not execute input, open sockets, query
databases, fetch URLs, parse sessions, or expose an HTTP server. Optional
provider adapters do perform an outbound request when `complete()` is invoked.
Their `baseUrl` is trusted configuration and must never be accepted directly
from an untrusted user; doing so would create an SSRF boundary in the host
application. The package itself does not provide an inbound server.

Resource-exhaustion and filesystem protections include:

- 16 Mi-character library input limit by default
- 16 MiB CLI and stream input limit by default
- bounded stdin accumulation
- rejection of symlink and non-regular input/output paths
- refusal to overwrite the input through the same path or a hard-link alias
- exclusive owner-only temporary output followed by atomic rename
- removal of OSC clipboard, C1, DCS, SOS, PM, APC, and partial escape sequences
- sanitized diagnostic messages
- bounded context candidates, conversation messages, total characters, semantic
  index entries, embedding dimensions, cache entries, and metric observations
- rejection of duplicate budget-item and model-route identifiers
- provider request character/message ceilings, abort propagation, and a 30-second
  default timeout
- provider authorization headers cannot be overridden by custom headers

Applications exposing `iritoken` over HTTP must still implement authentication,
authorization, body/time limits, rate limiting, CSRF controls, SSRF protection,
parameterized database queries, and edge-level DDoS mitigation at their own
trust boundary.

Please report vulnerabilities privately using [SECURITY.md](SECURITY.md).

## Development

```bash
git clone https://github.com/lelianto/iritoken.git
cd iritoken
npm install

npm run build
npm run lint
npm run typecheck
npm test
npm run test:security
npm run test:real-cases
npm run benchmark:verify
npm run benchmark:detection
npm run pack:smoke
npm run release:check
```

GitHub Actions verifies Node.js 18, 20, and 22, audits production dependencies,
runs deterministic benchmarks, and installs the generated tarball before a
release can be published. Security and real-case suites are separate required
CI jobs and explicit release-workflow steps.

The npm `prepublishOnly` lifecycle also runs both suites. Consequently, a local
`npm publish` and the trusted-publishing workflow stop before packaging if any
security regression, required-fact loss, unexpected semantic transformation,
or labelled detection regression is found. `test:security` covers resource
limits, terminal-control injection, filesystem alias/symlink handling, CLI
input boundaries, and stream limits. `test:real-cases` covers the committed
corpus, labelled detection set, and executable semantic invariants. The manual
release workflow defaults to dry-run and supports npm provenance.

## Project structure

```text
iritoken/
├── src/
│   ├── cache/             bounded semantic response cache
│   ├── cleaners/          deterministic transformation stages
│   ├── context/           ranking, budgets, and conversation compaction
│   ├── detectors/         content-type detection
│   ├── evaluation/        paired saving and quality gates
│   ├── integrations/      provider-neutral message helpers
│   ├── observability/     bounded metrics collection
│   ├── pipeline/          optimize() and presets
│   ├── prompt/            cache-aware prompt preparation
│   ├── providers/         optional outbound provider adapters
│   ├── retrieval/         semantic and content-addressed retrieval
│   ├── routing/           capability and cost-aware model selection
│   ├── stats/             character and token statistics
│   ├── token/             counters and tokenizer adapters
│   ├── cli/               command-line interface
│   ├── stream.ts          bounded Node Transform
│   └── index.ts           public API
├── test/                  unit, integration, security, and property tests
├── benchmark/             fixtures, tasks, live runners, and reports
├── docs/                  methodology and integration guides
└── .github/workflows/     CI and release gates
```

## Contributing

Contributions are welcome, especially new real-world fixtures, conservative
cleaners, tokenizer examples, and provider-neutral quality evaluations.

Before opening a pull request:

1. Add tests for normal, malformed, Unicode, large, unchanged, and repeated input.
2. Preserve determinism, idempotence, and non-expansion.
3. Add required facts to the benchmark manifest for new fixtures.
4. Run `npm run prepublishOnly` and `npm run benchmark:corpus`.
5. Do not commit API keys, `.env.local`, generated secrets, or model responses.

## License

Licensed under the [Apache License 2.0](LICENSE). Copyright attributed to dan.

<div align="center">
  <sub>Built to make every context window count.</sub>
</div>
