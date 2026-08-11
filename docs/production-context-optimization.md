# Production context optimization

`iritoken` separates compression claims from evidence. The production APIs are
local, deterministic, provider-neutral, and opt-in. They never execute command
strings and never send context to a network service.

## Unified routing

Use `optimizeContext()` when the content may be structured or when command
provenance is available:

```ts
import { optimizeContext } from "iritoken";

const result = optimizeContext(toolOutput, {
  command: "npm test",
  preset: "balanced"
});

console.log(result.strategy); // structured | command | generic
console.log(result.stats.reductionPercentage);
```

Valid JSON and JSONL are compacted lexically. The implementation validates the
format, then removes only whitespace outside strings. It does not parse and
re-serialize, so duplicate keys, number spellings, key order, and string bytes
are retained. Set `structured: false` when whitespace itself is evidence.

Command strings are classified but never evaluated or executed. Known test,
build, log, version-control, and read commands choose conservative default
presets. An explicit preset always wins.

## Shadow evidence

Shadow mode measures a candidate while returning the original input:

```ts
import { optimizeAudited } from "iritoken";

const result = optimizeAudited(context, { mode: "shadow", preset: "balanced" });

sendToModel(result.text);          // original
record(result.evidence);           // hashes and candidate measurements only
inspect(result.candidateText);     // optimized candidate
```

Evidence includes SHA-256 hashes for the original, candidate, and delivered
content. It does not embed source text. Hashes prove identity, not semantic
quality; use the quality gate for that.

## Original retrieval

For applications that want an escape hatch, use a bounded local store:

```ts
import { ContextStore, optimizeRetrievable } from "iritoken";

const store = new ContextStore({
  maxEntries: 500,
  maxBytes: 64 * 1024 * 1024,
  ttlMilliseconds: 10 * 60_000
});

const result = optimizeRetrievable(context, store, { preset: "balanced" });
const original = result.originalReference
  ? store.get(result.originalReference)
  : undefined;
```

References are content-addressed SHA-256 identifiers. The store evicts oldest
entries under entry or byte pressure and expires them by TTL. It is deliberately
in-memory: durable or distributed storage needs application-specific encryption,
authorization, deletion, and residency policies.

## Paired quality gates

`evaluateQualityGate()` replays every case with original and optimized context.
The runner may call a model, a deterministic task harness, or an application
simulator. The scorer defines useful quality for that workload.

```ts
import { evaluateQualityGate } from "iritoken/evaluation";

const report = await evaluateQualityGate(cases, {
  optimize: { preset: "balanced" },
  minimumReductionPercentage: 10,
  maximumMeanQualityRegression: 0.01,
  maximumCaseQualityRegression: 0.05
});

if (!report.passed) throw new Error(report.failures.join("; "));
```

An offline deterministic harness validates mechanics but cannot establish
real-model non-inferiority. Production adoption should start in shadow mode,
replay a representative private corpus against the actual model and rubric,
then deploy only the policy that passes its declared thresholds.

## Security boundaries

- Command provenance is treated only as untrusted text.
- All unified routes enforce the library input-character limit.
- Structured optimization fails open for malformed input.
- The retrieval store has explicit memory and lifetime bounds.
- Observer hooks and audit evidence contain metadata, not context.
- Optimization is not a sanitizer. Secrets and prompt injection remain present
  unless an application adds a separate, purpose-built policy.

