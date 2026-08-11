# Quality and token benchmark

This document records the live quality validation for iritoken's
quality-first `balanced` preset. The objective is not maximum compression; it
is measurable token reduction without a material loss in useful facts.

## Latest result: live v3 context router

Measured on 2026-08-11 with the official DeepSeek API:

| Setting | Value |
| --- | --- |
| Model | `deepseek-v4-flash` |
| Thinking mode | Disabled |
| Preset | `balanced` |
| Trials | 5 per task and variant |
| Corpus | `live-v3-2026-08-11-aurora` |
| Corpus SHA-256 | `d774fcfb09b49362c1feb4bd890ba80589bd92be8444f1fcd2f3b5eb6c30a743` |
| Tasks | 6 (newly authored) |
| Requests | 60 |
| Maximum response | 256 tokens |
| Original input tokens | 8,635 |
| Optimized input tokens | 8,170 |
| API-reported reduction | **5.39%** |
| Original fact recall | 92.5% |
| Optimized fact recall | 95.83% |
| Paired mean difference | **+3.33pp** |
| Task-cluster bootstrap 95% CI | **0.00pp to +10.00pp** |
| Non-inferiority margin | -5pp |
| Non-inferiority result | **PASS** |
| Approximate API cost | $0.003239 |

The result supports non-inferiority only for this model, fixture set, prompt,
and rubric. The positive point estimate is not evidence that optimization
generally improves quality; it may reflect task composition and model variance.

All task prompts, fixture facts, identifiers, and contexts in this campaign
were newly authored for this v3 run. No previous live task or prompt text was sent
to the provider. The paired comparison is the relevant measure of iritoken's
effect; complete-task success was 21/30 for original and 25/30 for optimized.

## Full context-engine campaign: v4.1

The separate `context-v4.1-2026-08-11-prismatic` campaign validates the new
context-engine components together rather than only the core optimizer. It uses
9 entirely new synthetic tasks (3 easy, 3 medium, 3 hard), 3 trials, paired
original/optimized variants, deterministic randomized request order, and 54
DeepSeek V4 Flash calls.

| Metric | Original | Optimized |
| --- | ---: | ---: |
| Complete runs | 27/27 | 27/27 |
| Fact recall | 100.0% | 100.0% |
| API prompt tokens | 4,425 | 3,894 |
| Prompt-token reduction | — | **12.0%** |

By difficulty, prompt-token reduction was 3.23% for easy tasks, 15.61% for
medium tasks, and 14.45% for hard tasks, with 100% recall in both variants at
every level. Provider-reported cache usage was 4,224 hit and 4,095 miss tokens.
Approximate campaign cost was $0.000961.

Each prompt is traced through raw input, deterministic routing/optimization,
semantic retrieval, context ranking, budget/compaction, model routing,
cache-aware prompt construction, semantic-cache probes, provider request,
provider response, and quality scoring. The JSON result contains exact synthetic
message arrays, stage hashes and counts, retrieval IDs, ranking details, omitted
indices, budgets, request IDs, exact API usage, answer hashes, and missing facts.
Answer text and API keys are not stored.

The first v4 attempt is intentionally preserved. It revealed that “report the
exception” was ambiguous while its rubric required the exception type. A
targeted diagnostic confirmed that context was intact. Version 4.1 clarified
“exception type and message,” received a new corpus ID/fingerprint, and reran
all 54 calls. See `DEEPSEEK-CONTEXT-V4.md`,
`DEEPSEEK-CONTEXT-V4-1.md`, and
`docs/deepseek-v4-context-campaign-analysis.md`.

The v3 campaign exercises `optimizeContext()` rather than only `optimize()`.
It covers lexical JSONL routing plus command provenance for application logs,
stack traces, failing tests, container builds, and rollout output. The complete
machine-readable and concise reports are `deepseek-live-v3.json` (ignored from
Git because it is environment-specific) and `DEEPSEEK-V3.md`.

## Methodology

For each task and trial, the runner sends the same task with either the
original or optimized context. Jobs are deterministically shuffled, and the
API never receives the variant label. DeepSeek thinking is disabled, output is
JSON-structured and capped at 256 tokens, and a hard cost limit is enforced.

Answers are scored against a predefined fact rubric after Unicode and
punctuation normalization. Full answers and API keys are not stored; the
result keeps request IDs, answer SHA-256 hashes, token usage, and missing
facts. The 95% interval resamples task-level mean paired differences, avoiding
the assumption that repeated trials of the same fixture are independent tasks.

Token figures come directly from DeepSeek API usage fields. They are not the
package's `char/4` heuristic.

## Quality-first changes

An earlier, more compressive implementation reduced live API input tokens by
28.26%, but reduced fact recall from 82.6% to 76.1%. Its paired mean was
-7.14pp and task-cluster bootstrap 95% CI was -14.29pp to -1.43pp, so it did
not satisfy the -5pp non-inferiority margin.

The following changes corrected that result:

- Preserve test-runner structure whenever a failure marker is present.
- Preserve diagnostic/source alignment unless content is confidently generic
  terminal output.
- Preserve repeated high-signal warning, error, failure, retry, lost,
  dead-letter, acknowledgement, and status lines.
- Continue collapsing lower-risk repetition and repeated stack frames.

The trade-off is intentional: deterministic character reduction fell from
28.7% to 13.5%, while the final live test passed the quality margin.

## Reproduction

Place `DEEPSEEK_API_KEY` in an ignored `.env.local` or the process environment,
then run:

```bash
npm run benchmark:deepseek -- --trials 5 --max-cost-usd 0.02
npm run benchmark:deepseek:campaign -- --trials 3 --max-cost-usd 0.03
```

Raw secret-free measurements are written to
`benchmark/results/deepseek-live-v2.json` (ignored by Git), and the concise
report is written to `benchmark/results/DEEPSEEK-V2.md`. Interrupted runs can be
continued with `--resume`; corpus fingerprint and model must match.

Before publishing a result, also run:

```bash
npm run lint
npm run typecheck
npm test
npm run benchmark:verify
npm run pack:smoke
```

The exact test count and deterministic gate results are recorded by CI rather
than frozen in this document. Benchmark commands also emit versioned JSON under
`benchmark/results/` for machine audit; raw JSON is intentionally ignored by
Git because it includes environment-specific measurements.
