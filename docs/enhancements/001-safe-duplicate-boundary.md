# Enhancement 001: safe duplicate-line boundary

Date: 2026-08-11  
Status: implemented and locally validated

## Objective

Prevent the duplicate-line cleaner from rewriting repeated source code,
instructions, prose, or otherwise ambiguous text. Exact repetition can carry
meaning outside terminal output, so determinism and non-expansion alone are not
sufficient safety properties.

## Reproduced baseline defect

The pre-change `0.1.0` build was executed with `preset: "safe"`.

| Case | Detection | Pre-change result |
| --- | --- | --- |
| TypeScript array with the same entry three times | `generic-terminal-output / medium` | Rewritten to `"same-value", [repeated 3 times]`, producing invalid TypeScript |
| Natural-language instruction repeated three times | `unknown / high` | Rewritten to one line with `[repeated 3 times]` |

This demonstrated two false positives that were absent from the original ten-task
corpus.

## Change

`DuplicateLinesCleaner` now runs only when content detection is both:

- type `generic-terminal-output`; and
- confidence `high`.

All other input is returned unchanged by this cleaner. ANSI-bearing terminal
output is one current source of high-confidence terminal detection. The boundary
applies consistently to direct cleaner use and every preset.

Two deterministic benchmark tasks were added:

- repeated source-code entry preservation;
- repeated instruction preservation.

The benchmark verifier now supports exact occurrence-count assertions, because
`mustContain` alone cannot detect a reduction from three occurrences to one.

## Measured results

All measurements below were produced locally on 2026-08-11. Token figures are
the project's documented estimate unless explicitly described otherwise.

| Check | Before | After |
| --- | ---: | ---: |
| Unit/integration/property tests | 117 passed | 120 passed |
| Deterministic corpus | 10 tasks × 3 presets | 12 tasks × 3 presets |
| Corpus success, `safe` | 10/10 | 12/12 |
| Corpus success, `balanced` | 10/10 | 12/12 |
| Estimated token reduction, `safe` | 11.3% | 0.0% |
| Estimated token reduction, `balanced` | 11.3% | 5.5% |
| 10 MiB balanced runtime, single run | 240.7 ms | 225.2 ms |
| 10 MiB balanced heap delta, single run | 85.0 MiB | 62.7 MiB |

Runtime and heap measurements are single-process observations and must not be
interpreted as a statistically significant performance improvement. They show
that this change did not introduce an obvious performance regression.

The original corpus compression falls because its plain-text logs are generally
classified as medium-confidence terminal output. This is an intentional
quality-first trade-off: uncertain repetition is now preserved. A later,
separately measured enhancement may improve terminal detection recall without
weakening this cleaner's safety boundary.

No new paid live-model benchmark was run for this change. The previously
published DeepSeek result therefore remains historical evidence for the earlier
implementation, not evidence for this revision.

## Validation commands

```bash
npm run lint
npm run typecheck
npm test
npm run benchmark -- safe
npm run benchmark -- balanced
npm run benchmark:quality -- safe
npm run benchmark:quality -- balanced
npm run benchmark:corpus
npm run benchmark:perf
npm run pack:smoke
```

All commands passed. The packed artifact smoke test produced and installed
`iritoken-0.1.0.tgz` successfully.

## Acceptance criteria

- Repeated source-code entries remain byte-for-byte unchanged: passed.
- Repeated unknown instructions remain byte-for-byte unchanged: passed.
- Confirmed high-confidence terminal duplicates still collapse: passed.
- Determinism, idempotence, and non-expansion properties remain green: passed.
- No deterministic corpus fact or required occurrence is lost: passed.
- Lint, strict typecheck, tests, and package smoke test pass: passed.

## Follow-up

Improve content detection using independently labelled terminal/non-terminal
fixtures. The target should be higher terminal recall while maintaining zero
false-positive duplicate collapsing on the semantic preservation corpus.
