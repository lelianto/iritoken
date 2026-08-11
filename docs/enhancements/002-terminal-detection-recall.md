# Enhancement 002: terminal detection recall

Date: 2026-08-11  
Status: implemented and locally validated

## Objective

Recover safe duplicate-line compression lost by Enhancement 001 without
relaxing its requirement that input be confidently identified as generic
terminal output.

## Baseline

After Enhancement 001, three representative plain-text terminal fixtures were
all classified as `generic-terminal-output / medium`:

- timestamped application logs;
- npm install output;
- Docker BuildKit output.

Eligibility recall was therefore 0/3. Five negative or structurally sensitive
fixtures were not eligible, giving specificity of 5/5. Deterministic estimated
token reduction was 0.0% for `safe` and 5.5% for `balanced`.

## Change

The detector now counts narrowly defined terminal-shaped lines:

- bracketed `HH:MM:SS` timestamps;
- Docker BuildKit `#N` records;
- npm warning, error, notice, package-change, audit, and progress records.

At least three matching lines and a minimum 25% share of the input are required
for high confidence. Test/stack/source detection still runs first, preventing
terminal signals embedded in those formats from overriding the enclosing type.

A new `benchmark:detection` gate measures duplicate-cleaner eligibility as a
binary classification problem. It runs inside `benchmark:verify`.

## Labelled corpus

Positive eligibility fixtures:

- `repetitive-logs.txt`
- `npm-install.txt`
- `docker-build.txt`

Negative eligibility fixtures:

- Kubernetes tabular events
- repeated source code
- repeated instructions
- mixed agent/test context
- Jest output

Kubernetes output is deliberately negative for this shared high-confidence
path. During development, promoting it caused the whitespace cleaner to flatten
aligned columns and report 25.2% reduction. The candidate was rejected even
though required fact substrings survived. This prevents a metric improvement
from being mistaken for a safe transformation.

## Measured results

| Metric | Before | After |
| --- | ---: | ---: |
| Eligibility recall | 0/3 (0.0%) | 3/3 (100.0%) |
| Eligibility specificity | 5/5 (100.0%) | 5/5 (100.0%) |
| False positives | 0 | 0 |
| Unit/integration/property tests | 120 passed | 122 passed |
| `safe` estimated token reduction | 0.0% | 5.6% |
| `balanced` estimated token reduction | 5.5% | 11.2% |
| Deterministic corpus success | 12/12 | 12/12 |
| 10 MiB balanced runtime, single run | 225.2 ms | 238.1 ms |
| 10 MiB balanced heap delta, single run | 62.7 MiB | 74.0 MiB |

Runtime increased by 5.7% in the single recorded 10 MiB observation. Heap delta
also varied. These single-process values are noisy and are documented only as a
regression smoke signal, not a statistically significant comparison. The run
remains far below the existing 10-second failure threshold.

No paid live-model benchmark was run. Token reductions above use the documented
project heuristic; no exact model-token or universal quality claim is made.

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

All commands passed. The packed artifact smoke test also passed.

## Acceptance criteria

- All labelled terminal fixtures become eligible: passed, 3/3.
- No labelled negative fixture becomes eligible: passed, 5/5.
- Repeated source code and instructions remain unchanged: passed.
- Kubernetes column alignment remains unchanged: passed.
- Deterministic quality remains 12/12 for every preset: passed.
- Compression improves relative to Enhancement 001: passed.
- Lint, strict typecheck, tests, performance guard, and package smoke pass:
  passed.

## Limitations

The labelled set is intentionally small. Reported 100% recall and specificity
describe these eight fixtures only. Additional log ecosystems must be added as
labelled cases before broadening terminal patterns.
