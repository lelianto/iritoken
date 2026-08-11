# Quality and token benchmark

This document records the live quality validation for iritoken's
quality-first `balanced` preset. The objective is not maximum compression; it
is measurable token reduction without a material loss in useful facts.

## Final result

Measured on 2026-08-11 with the official DeepSeek API:

| Setting | Value |
| --- | --- |
| Model | `deepseek-v4-flash` |
| Thinking mode | Disabled |
| Preset | `balanced` |
| Trials | 5 per task and variant |
| Corpus | `live-v2-2026-08-11-quartz` |
| Corpus SHA-256 | `2e411b8032845ac7b3c3d618834a90686bb087de703c31591c839ad4502a49c5` |
| Tasks | 6 (newly authored) |
| Requests | 60 |
| Maximum response | 256 tokens |
| Original input tokens | 7,170 |
| Optimized input tokens | 6,185 |
| API-reported reduction | **13.74%** |
| Original fact recall | 88.0% |
| Optimized fact recall | 88.0% |
| Paired mean difference | **0.00pp** |
| Task-cluster bootstrap 95% CI | **0.00pp to 0.00pp** |
| Non-inferiority margin | -5pp |
| Non-inferiority result | **PASS** |
| Approximate API cost | $0.002690 |

The result supports non-inferiority only for this model, fixture set, prompt,
and rubric. It is not a universal guarantee for every model or workload.

All task prompts, fixture facts, identifiers, and contexts in this campaign
were newly authored for this run. No previous live task or prompt text was sent
to the provider. The paired comparison is the relevant measure of iritoken's
effect; complete-task success was 15/30 for both variants.

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
