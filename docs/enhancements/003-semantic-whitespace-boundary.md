# Enhancement 003: semantic whitespace boundary

Date: 2026-08-11  
Status: implemented and locally validated

## Objective

Prevent whitespace cleanup from changing Markdown hard breaks, YAML block
scalars, snapshots, source code, instructions, and other ambiguous text while
retaining cleanup for confidently identified terminal output.

## Reproduced baseline defects

The build before this enhancement was run with `preset: "safe"`.

| Input | Detection | Pre-change behavior |
| --- | --- | --- |
| Two Markdown lines ending in two spaces | `unknown / high` | Both hard-break markers removed |
| YAML block scalar containing three consecutive newlines | `generic-terminal-output / medium` | Newline run collapsed |
| Snapshot-like text with trailing spaces and blank lines | `generic-terminal-output / medium` | Trailing spaces and blank-line structure collapsed |

The transformations were deterministic and non-expanding but not necessarily
meaning-preserving.

## Change

`WhitespaceCleaner` now requires both:

- `generic-terminal-output`; and
- `high` detection confidence.

Otherwise the cleaner returns the input unchanged. This is the same quality-first
eligibility boundary already used by duplicate-line cleanup. ANSI-bearing output
and terminal formats admitted by the labelled detector still qualify.

A semantic-whitespace fixture was added to the deterministic corpus. It requires
exact preservation of:

- both trailing-space Markdown hard breaks; and
- the three-newline sequence inside a YAML block scalar.

Direct cleaner and full-pipeline tests verify Markdown, YAML, and embedded source
text. Existing large-input and packed-artifact fixtures were updated to include
explicit terminal evidence instead of relying on ambiguous text being modified.

## Measured results

| Metric | Before | After |
| --- | ---: | ---: |
| Tests | 122 passed | 124 passed |
| Deterministic corpus | 12/12 | 13/13 |
| Corpus across presets | 12 tasks × 3 | 13 tasks × 3 |
| `safe` estimated token reduction | 5.6% | 5.6% |
| `balanced` estimated token reduction | 11.2% | 11.1% |
| Terminal eligibility recall | 3/3 | 3/3 |
| Terminal eligibility specificity | 5/5 | 5/5 |
| 10 MiB balanced runtime, single run | 238.1 ms | 168.2 ms |
| 10 MiB balanced heap delta, single run | 74.0 MiB | 42.4 MiB |

The one-decimal change in balanced reduction is caused by adding a new unchanged
134-character semantic fixture to the denominator. Measurements for the existing
fixtures are unchanged.

Performance values are single-run observations and do not establish a speed or
memory improvement. They only show no obvious regression against the existing
10-second guard.

No live-model call was made. Token numbers use the project's documented
heuristic.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run benchmark:detection
npm run benchmark -- safe
npm run benchmark -- balanced
npm run benchmark:quality -- safe
npm run benchmark:quality -- balanced
npm run benchmark:corpus
npm run benchmark:perf
npm run pack:smoke
```

All final commands passed, including the installed-tarball smoke test.

## Acceptance criteria

- Markdown hard-break spaces remain unchanged: passed.
- YAML block-scalar blank lines remain unchanged: passed.
- Source and ambiguous text are not whitespace-normalized: passed.
- High-confidence terminal whitespace cleanup still operates: passed.
- Existing corpus compression is retained: passed.
- Determinism, idempotence, non-expansion, and corpus quality pass: passed.
- Lint, strict typecheck, performance guard, and package smoke pass: passed.

## Limitation

High-confidence terminal output can still contain aligned tables. Enhancement
002 deliberately keeps the known Kubernetes table outside this path. A future
table-aware whitespace cleaner should identify alignment structurally before
expanding detector coverage.
