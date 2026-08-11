# TokenSlim

> TokenSlim removes deterministic noise from AI coding context before it reaches an LLM.

Don't spend AI tokens on information your model doesn't need.

TokenSlim is a lightweight, **deterministic** preprocessing library (and CLI) that reduces unnecessary tokens from AI coding context — CLI output, TypeScript compiler errors, test results, stack traces, repetitive logs, ANSI formatting, and stray whitespace — **without using an LLM**.

Everything is local, stateless, and cheap to run.

```text
same input + same configuration = same output
```

- Built with TypeScript, zero runtime dependencies
- ESM only
- Programmatic API + CLI
- No API key, no network access, no telemetry — nothing ever leaves your machine
- Optional token counting, character stats always

---

## Why

AI coding workflows repeatedly send large, noisy contexts to LLMs: `npm test` walls, redundant stack frames, `Connecting...` repeated hundreds of times, `\x1b[31m` color codes, trailing whitespace. A large share of that text carries almost no information. You pay for those tokens on every call.

TokenSlim v0.1 removes the obviously-low-value parts while preserving the information a model actually needs — like error types, file names, failed test names, expected/received values, and stack frames.

The core safety rule:

> When uncertain, preserve the original information.

TokenSlim prefers lower compression over destructive compression.

---

## Install

```bash
npm install tokenslim
```

## Library usage

```ts
import { optimize } from "tokenslim";

const result = optimize(rawContext);

console.log(result.text);
console.log(result.stats);
```

```ts
{
  text: "...optimized context...",
  stats: {
    originalCharacters: 18420,
    optimizedCharacters: 10281,
    charactersRemoved: 8139,
    reductionPercentage: 44.19,
    transformations: { ansi: 42, whitespace: 28, "duplicate-lines": 17 },
    detection: { type: "generic-terminal-output", confidence: "high" }
  }
}
```

Character-based statistics always work. Token counting is optional (see [Token measurement](#token-measurement)).

### Configuration and presets

```ts
optimize(context, { preset: "safe" });        // default
optimize(context, { preset: "balanced" });
optimize(context, { preset: "aggressive" });
```

| Preset | What it enables |
| --- | --- |
| `safe` (default) | ANSI removal, trailing whitespace, excessive blank lines, consecutive exact duplicates |
| `balanced` | Everything in `safe` + recognized test-output collapse + conservative stack-trace cleanup |
| `aggressive` | Placeholder — for v0.1 it behaves like `balanced`. No destructive semantic compression yet. |

Each cleaner is independently toggleable:

```ts
optimize(context, { cleaners: { ansi: true, testOutput: false } });
```

### Token measurement

Token counting is a separate, optional layer. Supply your own tokenizer when you have one:

```ts
optimize(context, {
  tokenCounter: {
    count(text) {
      return myTokenizer(text);
    }
  }
});
```

When a counter is provided, stats additionally include `originalTokens`, `optimizedTokens`, `tokensRemoved`, and `tokenReductionPercentage`.

TokenSlim **never claims exact model token savings** from character counts. The CLI and benchmarks use a documented `char/4` heuristic for display and label it as an estimate.

### Idempotence

Optimization is idempotent wherever possible:

```ts
optimize(optimize(input).text).text === optimize(input).text
```

An already-optimized fixture is not reduced further (asserted in tests and by the benchmark runner).

---

## CLI

```bash
# summary report
tokenslim build.log

# write the optimized text to a file
tokenslim build.log --output optimized.log

# read from stdin — pipe any CLI tool's output in
npm test 2>&1 | tokenslim

# choose a preset
tokenslim build.log --preset balanced

# stats without writing anything
tokenslim build.log --dry-run

# explain what changed
tokenslim build.log --explain
```

### Example report

```text
TokenSlim

Original size     84.2 KB    86212 chars
Optimized size    51.8 KB    53024 chars
Reduction         38.5%
Tokens (est.)     18,412 -> 10,281 (heuristic)

Transformations
ANSI              142
Whitespace         81
Duplicates         37
Stack frames        0
Test output         0
```

### Explain mode

```text
TokenSlim Analysis

ANSI escape sequences
Removed: 142

Excessive whitespace
Edits: 81

Consecutive duplicate lines
Groups collapsed: 37

Recognized content
Type: generic-terminal-output
Confidence: high

Token estimate
42101 -> 25312 tokens (heuristic, not exact model tokens)
```

Explain mode describes categories of edits without dumping source content.

---

## Optimization pipeline

```text
Raw Context
    ↓
ANSI Cleaner
    ↓
Whitespace Cleaner
    ↓
Duplicate Cleaner
    ↓
Stack-Trace Cleaner (balanced+)
    ↓
Test-Output Cleaner (balanced+)
    ↓
Optimized Context
```

### ANSI Cleaner
Strips CSI and OSC escape sequences (`\x1b[31m`, `\x1b]0;title\x07`, …) while keeping all underlying text.

### Whitespace Cleaner
- Removes trailing whitespace on every line
- Collapses 3+ newlines to 2 (at most one blank line)
- Collapses runs of 3+ mid-line spaces to a single space **only** in terminal-ish content (never in detected source code, never inside table-like lines, never leading indentation)

### Duplicate Cleaner
Collapses runs of consecutive, exact-duplicate lines:

```text
Connecting...
Connecting...
Connecting...
Connecting...
Connection failed
```

becomes

```text
Connecting... [repeated 4 times]
Connection failed
```

Non-consecutive identical lines are left alone. The marker preserves the fact that repetition occurred. Never enlarges output (short lines are left as-is).

### Stack-Trace Cleaner
Conservative: collapses consecutive, identical stack frames (V8 / Chrome / Python style) into a single frame with a `[repeated N times]` marker. Nothing else is removed — error type, message, file names, and line/column numbers are preserved byte for byte.

### Test-Output Cleaner (Vitest / Jest)
Collapses runs of 3+ consecutive passing test lines into one summary line (`✓ 12 test cases passed`). Failing test names, assertions, expected/received values, failure stacks, and the runner's summary are preserved byte for byte. Only runs when the content is confidently recognized as test-runner output.

---

## Privacy

TokenSlim v0.1 is fully local:

- No telemetry, no analytics, no API calls
- No cloud processing, no external storage
- No network connection is ever made
- No API key is required

Your context text never leaves your machine. The benchmark quality harness does not call any model by default, and the provider interface is never invoked from the library.

## Security boundaries

TokenSlim is a local text-processing library/CLI, not an HTTP server. It does
not open sockets, execute SQL, fetch URLs, parse cookies, or manage sessions;
therefore SQL injection, CSRF, and SSRF have no attack surface inside this
package. Applications exposing TokenSlim over HTTP must implement those
controls at their own trust boundary (parameterized database queries, CSRF
tokens/SameSite cookies, URL allowlists plus private-network blocking, request
rate limits, body/time limits, and an edge/WAF for volumetric DDoS).

For resource-exhaustion protection, the library rejects input above 16 Mi
characters by default. Override it explicitly when appropriate:

```ts
optimize(untrustedText, { maxInputCharacters: 2_000_000 });
```

The CLI similarly limits files and stdin to 16 MiB (`--max-input-mb` changes
the limit), refuses to overwrite its input, refuses output symlinks, creates
new output files with owner-only permissions, and sanitizes terminal control
characters in diagnostics.

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

---

## Development

```bash
npm install
npm run build        # TypeScript -> dist/
npm run typecheck    # strict typecheck of src, test, benchmark
npm run lint         # ESLint for source, tests, and benchmarks
npm test             # unit + deterministic fuzz/property tests (node:test)
npm run benchmark:verify # compression, quality, performance, and report
npm run pack:smoke   # pack, clean install, import API, and execute bin
```

GitHub Actions runs lint, strict typechecking, tests, and packed-artifact
smoke tests on Node 18, 20, and 22. Separate jobs verify benchmarks and audit
runtime dependencies. Dependabot checks npm and GitHub Actions dependencies
weekly. The property suite exercises adversarial Unicode/control input and all
96 preset/cleaner-override combinations.

## Testing

- Every cleaner is covered for: normal input, empty input, malformed input, very large input, Unicode, source code, content that must NOT be modified, already-optimized input, and repeated execution (idempotence).
- The optimization pipeline asserts idempotence and asserts output is never larger than input.
- Deterministic fuzz/property tests cover malformed control sequences, mixed newlines, Unicode (including unpaired surrogates), and every preset/cleaner override combination.
- The CLI is exercised end-to-end against the built binary.

## Benchmarking

Benchmarking is a first-class feature. All measurements below are generated by actually running `optimize()` against the fixtures in `benchmark/fixtures/` — nothing is hard-coded.

```bash
npm run benchmark            # compression table (balanced), writes benchmark/results/
npm run benchmark -- safe    # same, safe preset
npm run report               # README-ready markdown from real results
npm run benchmark:quality    # deterministic task-success benchmark
npm run benchmark:perf       # processing time/memory for 10 KiB..10 MiB
npm run benchmark:groq       # live Groq usage + task-quality validation
npm run benchmark:deepseek   # cost-capped DeepSeek V4 Flash validation
```

The live Groq benchmark reads `GROQ_API_KEY` from the process environment or
an ignored `.env.local`, verifies that the selected model is active, and runs
paired original/optimized requests. It records Groq's API-reported
`usage.prompt_tokens`; API keys and full model answers are never written.

```bash
npm run benchmark:groq -- --model llama-3.1-8b-instant --trials 3
```

Use `--pace-ms` to stay within the Groq project's tokens-per-minute limit
(default: 9000 ms between requests). A secret-free partial checkpoint is
written after every response so a rate-limit failure remains auditable.

The DeepSeek runner uses `deepseek-v4-flash` with thinking disabled, caps
responses at 256 tokens, shuffles variants blindly, requests structured JSON,
and scores normalized per-fact recall. Start with one trial; only repeat when
the original baseline is strong:

```bash
npm run benchmark:deepseek -- --trials 1
npm run benchmark:deepseek -- --task jest-failure-analysis --trials 3
npm run benchmark:deepseek -- --trials 5 --max-cost-usd 0.02
```

Latest quality-first result (`deepseek-v4-flash`, thinking disabled, 5 trials /
70 requests): API-reported input tokens fell 13.77%, while fact recall changed
from 83.2% to 85.2% (paired mean +2.14pp; task-cluster bootstrap 95% CI 0.00pp
to +6.43pp). The balanced preset passed the pre-registered -5pp
non-inferiority margin on this model/task suite. See
[`benchmark/results/DEEPSEEK.md`](benchmark/results/DEEPSEEK.md).
The full methodology, historical failed benchmark, quality-first changes, and
scope limitations are documented in
[`docs/quality-benchmark.md`](docs/quality-benchmark.md).

### Compression benchmark (from actual execution, balanced preset)

| Fixture             | Original (chars) | Optimized (chars) | Reduction | Token reduction* |
| --- | ---: | ---: | ---: | ---: |
| vitest-output       | 1,685 | 1,685 | 0.0% | 0.0% |
| repetitive-logs     | 2,105 | 1,554 | 26.2% | 25.8% |
| stack-trace         | 2,616 | 1,660 | 36.5% | 36.8% |
| npm-install         | 1,990 | 1,787 | 10.2% | 10.0% |
| jest-output         | 1,166 | 1,166 | 0.0% | 0.0% |
| tsc-errors          | 1,982 | 1,982 | 0.0% | 0.0% |
| mixed-agent-context | 1,156 | 1,156 | 0.0% | 0.0% |

\* token figures use the documented `char/4` heuristic and are estimates, **not** exact model counts.

Unique content (e.g. `tsc-errors`, `mixed-agent-context`) is intentionally reduced very little — TokenSlim does not invent compression (yet). The full generated report lives at [`benchmark/results/REPORT.md`](benchmark/results/REPORT.md).

### Quality benchmark (deterministic verification, balanced preset)

| Run       | Input tokens (est.) | Success | Rate |
| --- | ---: | ---: | ---: |
| Baseline  | 2,305 | 7/7 | 100% |
| TokenSlim | 2,014 | 7/7 | 100% |

Token reduction (est.): ~12.6% · Success regression: 0pp

Verification is **deterministic**: each task defines facts (error codes, file names, failed-test names, expected/received values, summaries) that must survive optimization. A task succeeds only when every fact is still present.

### Performance (from actual execution)

| Input | Time | Δheap | ms per MiB |
| --- | ---: | ---: | ---: |
| 10 KiB  | ~2 ms   | <1 MiB | — |
| 100 KiB | ~3 ms   | ~1 MiB | ~34 |
| 1 MiB   | ~33 ms  | ~12 MiB | ~33 |
| 10 MiB  | ~313 ms | ~117 MiB | ~31 |

Roughly linear behavior across sizes — no accidental O(n²) on large logs.

### Quality benchmark architecture

Compression alone is not the goal. The benchmark is designed so the same task can later run through an LLM using the identical task manifest:

```text
ORIGINAL CONTEXT   
    ↓ LLM          OPTIMIZED CONTEXT   
RESULT A               ↓ LLM           
                       RESULT B
```

The provider interface lives in [`benchmark/provider.ts`](benchmark/provider.ts):

```ts
interface BenchmarkProvider {
  readonly name: string;
  run(input: string): Promise<BenchmarkResponse>;
}
```

TokenSlim never calls models. Adapters for DeepSeek, OpenAI, Anthropic, Gemini, OpenRouter, or local models can be added later without coupling the package to any provider. The metric of interest is *cost per successful task*, not raw tokens removed — a config saving 70% tokens that hurts task success is considered worse.

---

## Non-goals for v0.1

Not implemented (and intentionally out of scope for the deterministic MVP):

- Embeddings, vector databases, RAG
- LLM summarization or semantic compression
- AST code compression
- Conversation-memory management
- Coding-agent plugins, IDE extensions, proxy servers, SaaS dashboards
- Remote telemetry, automatic prompt rewriting
- MCP server, agent framework

These can be explored only after the deterministic MVP has measurable results.

---

## Project structure

```text
src/
├── cleaners/          ansi, whitespace, duplicate-lines, stack-trace, test-output
├── detectors/         content-type detection
├── pipeline/          optimize() + presets
├── stats/             character/token stats
├── token/             optional token counter
├── cli/               tokenslim CLI
├── types.ts           public types
└── index.ts           public entry
test/                  unit + integration tests
benchmark/
├── fixtures/          realistic deterministic fixtures
├── tasks/             quality-benchmark task manifest
├── provider.ts        provider-neutral model interface
├── run.ts             compression benchmark
├── quality.ts         deterministic success benchmark
├── performance.ts     processing-time/memory benchmark
├── report.ts          README-ready markdown from real results
└── results/           generated measurements (REPORT.md is committed)
```

## License

Apache-2.0
