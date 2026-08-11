# iritoken compression benchmark

Generated automatically by `npm run benchmark`. Do not edit by hand.

> Token counts use the package's documented `char/4` heuristic and are 
> labelled estimates. They are NOT exact model token counts.

## preset: balanced

| Fixture | Original (chars) | Optimized (chars) | Reduction | Original (tokens) | Optimized (tokens) | Token reduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| docker-build | 652 | 581 | 10.9% | 133 | 119 | 10.5% |
| jest-output | 1,166 | 1,166 | 0.0% | 232 | 232 | 0.0% |
| kubernetes-events | 985 | 985 | 0.0% | 166 | 166 | 0.0% |
| mixed-agent-context | 1,156 | 1,156 | 0.0% | 221 | 221 | 0.0% |
| npm-install | 1,990 | 1,787 | 10.2% | 402 | 362 | 10.0% |
| python-traceback | 544 | 544 | 0.0% | 97 | 97 | 0.0% |
| repetitive-logs | 2,105 | 1,554 | 26.2% | 387 | 287 | 25.8% |
| stack-trace | 2,616 | 1,660 | 36.5% | 410 | 259 | 36.8% |
| tsc-errors | 1,982 | 1,982 | 0.0% | 355 | 355 | 0.0% |
| vitest-output | 1,685 | 1,685 | 0.0% | 298 | 298 | 0.0% |

**Total for preset: balanced — 12.0% characters**

## preset: safe

| Fixture | Original (chars) | Optimized (chars) | Reduction | Original (tokens) | Optimized (tokens) | Token reduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| docker-build | 652 | 581 | 10.9% | 133 | 119 | 10.5% |
| jest-output | 1,166 | 1,166 | 0.0% | 232 | 232 | 0.0% |
| kubernetes-events | 985 | 985 | 0.0% | 166 | 166 | 0.0% |
| mixed-agent-context | 1,156 | 1,156 | 0.0% | 221 | 221 | 0.0% |
| npm-install | 1,990 | 1,787 | 10.2% | 402 | 362 | 10.0% |
| python-traceback | 544 | 544 | 0.0% | 97 | 97 | 0.0% |
| repetitive-logs | 2,105 | 1,554 | 26.2% | 387 | 287 | 25.8% |
| stack-trace | 2,616 | 1,660 | 36.5% | 410 | 259 | 36.8% |
| tsc-errors | 1,982 | 1,982 | 0.0% | 355 | 355 | 0.0% |
| vitest-output | 1,685 | 1,685 | 0.0% | 298 | 298 | 0.0% |

**Total for preset: safe — 12.0% characters**


## Combined

Total input characters: 29,762
Total optimized characters: 26,200
Overall reduction: 12.0%

## Methodology

- Every fixture is a deterministic file in `benchmark/fixtures/`.
- Measurements come from running `optimize()` on the actual fixture. Nothing is hard-coded.
- Idempotence is asserted: `optimize(optimize(x)) === optimize(x)`.
