# Iritoken hypothesis benchmark protocol

## Status and scope

The statement “Iritoken reduces total LLM tokens by 50–90% without quality
loss” is a hypothesis, not a product guarantee. This protocol separates three
questions that are easy to conflate:

1. How many tokens did the provider process?
2. How much did those measured tokens cost at a dated price schedule?
3. Did the optimized arm remain functionally non-inferior to the raw arm?

The primary provider is DeepSeek Chat Completions and the primary model ID is
`deepseek-v4-flash`. That ID is a mutable hosted alias, so every live artifact
must retain the request time, returned model, and `system_fingerprint` when the
API supplies it.

## Pre-registered hypotheses

For each workload and compression level, let `B` be the raw control and `I` be
Iritoken. The requested targets are 25%, 50%, 60%, 70%, 80%, and 90%. Results
are assigned to their *achieved* reduction; a request for 90% that safely
achieves 37% is a 37% observation.

The primary token outcome is the ratio of sums:

```text
total_token_reduction =
  1 - sum(I_input + I_output + I_helper) /
      sum(B_input + B_output)
```

`I_helper` includes any LLM calls used to summarize, route, rank, or compress.
The deterministic local pipeline has zero helper-model tokens. Evaluator and
judge calls are benchmark overhead and are reported separately.

The primary quality outcome is task success: every mandatory deterministic
acceptance check passes. The secondary continuous outcome is the macro-average
fraction of acceptance criteria passed. A provisional non-inferiority margin of
2 percentage points is used for exploration:

```text
quality_delta = quality(I) - quality(B)
non_inferior only if lower_one_sided_95_CI(quality_delta) > -0.02
```

This margin is intentionally strict. A small synthetic pilot is underpowered
to prove it even when no regressions are observed. Such a run is labelled
“exploratory” or “inconclusive,” never “no quality loss.” A confirmatory claim
also requires an absolute quality floor and zero optimizer-only critical or
security regressions.

“Statistically equivalent” is stronger than non-inferior. It requires a TOST
equivalence test whose 90% two-sided confidence interval lies wholly inside a
pre-registered interval such as `[-0.02, +0.02]`. Failure to find a significant
difference is not equivalence.

## Experimental controls

Every paired arm uses the same:

- raw task and clean repository or conversation state;
- model ID, system instruction, thinking mode, temperature, response schema,
  tool availability, and output limit;
- retry and timeout policy;
- acceptance rubric and evaluator version.

DeepSeek does not document a seed parameter for this interface. Jobs are
therefore run in randomized paired blocks with balanced arm order. Repeated
calls estimate model variability but do not create new independent tasks. The
independent cluster is a task, repository, full conversation, or complete
multi-turn agent session.

The matrix includes:

- simple coding;
- medium and multi-file coding;
- naturally noisy large-repository context;
- an entire repeated coding-agent session;
- a long conversation;
- dense adversarial context where nearly everything is relevant.

Large and repeated-context cases may expose substantial opportunity, but dense
cases are required to ensure that noisy workloads cannot dominate the claim.
Synthetic cases are suitable for a reproducible pilot. A public claim requires
a sealed confirmation set containing independent real repository snapshots and
sanitized natural traces.

## Quality evaluation hierarchy

Coding outputs are checked in this order whenever the scenario supports the
check:

1. response and patch schema parsing;
2. patch applicability;
3. syntax/compilation and type checking;
4. unit, integration, acceptance, and security tests;
5. lint or static code-quality rules;
6. blind judging only for criteria that deterministic checks cannot decide.

The committed pilot deliberately does not execute arbitrary model-generated
code. Its deterministic evaluators check the fixed JSON contract, required
technical evidence, patch/code shape, and forbidden contradictions. A future
executable-code corpus must run candidate patches in fresh, isolated checkouts
with network disabled, strict resource limits, and hidden tests. Static pilot
success must not be described as full functional correctness.

For blind judging, variants are randomly labelled A/B. The judge must not see
the arm, token count, requested target, or benchmark objective. Raw synthetic
outputs are retained so independent reviewers can rescore them; a hash alone is
not enough. Model judging is secondary wherever deterministic evidence exists.

## Token and cost accounting

Authoritative token counts come from the API response:

```text
input  = usage.prompt_tokens
output = usage.completion_tokens
total  = usage.total_tokens = input + output
```

DeepSeek cache-hit input tokens still appear in input and total usage. They
reduce price and often latency, but they are not removed tokens. The benchmark
reports cache-hit and cache-miss tokens separately and never subtracts hits
from the primary token metric.

Using the price snapshot committed with the runner:

```text
estimated_cost_usd =
    cache_hit_input  * hit_input_price_per_million  / 1_000_000
  + cache_miss_input * miss_input_price_per_million / 1_000_000
  + output            * output_price_per_million     / 1_000_000
  + helper_cost
```

This is an estimate from measured usage, not a provider invoice. Rates and the
retrieval date are embedded in every report because provider prices can change.

## Statistics and the frontier

The runner reports counts, means, medians, standard deviations, paired deltas,
ratios of sums, discordant pairs, failures, retries, and deterministic
task-cluster bootstrap intervals. Bootstrap resampling retains every arm and
repetition for a cluster and uses at least 10,000 resamples.

Each achieved level is classified as:

- **green**: all functional/critical gates pass and non-inferiority is proven;
- **gray**: evidence is inconclusive or underpowered;
- **red**: a material regression is observed.

The quality-preserving frontier is the greatest achieved reduction that is
green on a sealed confirmation set, has a supported lower reduction bound, and
has no failed less-aggressive level. The pilot additionally reports an
exploratory frontier, but it cannot authorize a broad README claim.

## Ablations

Every stage is measured both alone and by removal from the full pipeline:

- normalization;
- exact deduplication;
- structured compaction;
- relevance filtering/retrieval;
- dependency-aware selection;
- history/delta optimization;
- output policy.

Stage savings overlap and therefore must not be added. Provider caching is a
separate cost/latency condition, not a compression stage. Output optimization
changes the request instruction or output cap, so it is reported as a declared
full-stack experiment rather than silently mixed into the context-only primary
comparison.

## Adaptive safety metrics

Runtime metrics are deterministic audit indices, not probabilities:

- `requiredCoverage`: retained required units divided by required units;
- `contextCoverage`: retained declared importance mass divided by total mass;
- `verifiedRemovedTokenShare`: tokens removed through exact, mechanically
  verifiable transformations divided by all removed tokens;
- `targetAchievable`: whether the requested budget can be reached without
  dropping mandatory content;
- ledger reasons for every retained, transformed, or omitted unit.

`requiredCoverage` must be 100%. If mandatory content alone exceeds a target,
Iritoken fails open and reports the smaller achieved reduction. A future
`qualityRiskScore` may be introduced only after it is calibrated out of fold as
the probability that Iritoken fails while the control succeeds, with Brier
score and calibration error published on a sealed set.

## Anti-gaming and artifact policy

- Gold facts, expected retrieval IDs, hidden tests, and answer keys are never
  visible to the optimizer.
- Preflight context-loss checks become recorded Iritoken failures; they do not
  abort or exclude the case.
- Every error, timeout, parse failure, refusal, and retry remains in the raw
  ledger under a symmetric policy.
- Corpus, configuration, rubric, and analysis fingerprints are recorded before
  inspecting results.
- No target, workload, trial, or unfavorable arm may be silently excluded.
- Raw and optimized prompt hashes, full API usage, returned model identity, and
  scored synthetic outputs are retained for audit.
- A changed task, prompt, rubric, price, or analysis method receives a new
  corpus or methodology version and a complete rerun.

## Interpretation rule

Until a sealed, sufficiently powered run clears the gates, the README must use
scoped wording of the form:

> On the named corpus and dated DeepSeek V4 Flash configuration, Iritoken
> reduced end-to-end tokens by X% (95% CI A–B) for the listed workloads while
> quality changed by Y percentage points (95% CI C–D; margin M). Dense relevant
> contexts achieved Z%, where the optimizer failed open.

“Up to” results must name the workload and cannot be presented as the typical
or universal reduction.
