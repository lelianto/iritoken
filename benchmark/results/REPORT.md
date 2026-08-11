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
| repeated-instructions | 96 | 96 | 0.0% | 18 | 18 | 0.0% |
| repeated-source-code | 75 | 75 | 0.0% | 14 | 14 | 0.0% |
| repetitive-logs | 2,105 | 1,554 | 26.2% | 387 | 287 | 25.8% |
| semantic-whitespace | 134 | 134 | 0.0% | 26 | 26 | 0.0% |
| stack-trace | 2,616 | 1,660 | 36.5% | 410 | 259 | 36.8% |
| tsc-errors | 1,982 | 1,982 | 0.0% | 355 | 355 | 0.0% |
| vitest-output | 1,685 | 1,685 | 0.0% | 298 | 298 | 0.0% |

**Total for preset: balanced — 11.7% characters**

## preset: safe

| Fixture | Original (chars) | Optimized (chars) | Reduction | Original (tokens) | Optimized (tokens) | Token reduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| docker-build | 652 | 581 | 10.9% | 133 | 119 | 10.5% |
| jest-output | 1,166 | 1,166 | 0.0% | 232 | 232 | 0.0% |
| kubernetes-events | 985 | 985 | 0.0% | 166 | 166 | 0.0% |
| mixed-agent-context | 1,156 | 1,156 | 0.0% | 221 | 221 | 0.0% |
| npm-install | 1,990 | 1,787 | 10.2% | 402 | 362 | 10.0% |
| python-traceback | 544 | 544 | 0.0% | 97 | 97 | 0.0% |
| repeated-instructions | 96 | 96 | 0.0% | 18 | 18 | 0.0% |
| repeated-source-code | 75 | 75 | 0.0% | 14 | 14 | 0.0% |
| repetitive-logs | 2,105 | 1,554 | 26.2% | 387 | 287 | 25.8% |
| semantic-whitespace | 134 | 134 | 0.0% | 26 | 26 | 0.0% |
| stack-trace | 2,616 | 2,616 | 0.0% | 410 | 410 | 0.0% |
| tsc-errors | 1,982 | 1,982 | 0.0% | 355 | 355 | 0.0% |
| vitest-output | 1,685 | 1,685 | 0.0% | 298 | 298 | 0.0% |

**Total for preset: safe — 5.4% characters**


## Combined

Total input characters: 30,372
Total optimized characters: 27,766
Overall reduction: 8.6%


## By workload

| Workload | Preset | Original (chars) | Optimized (chars) | Reduction |
| --- | --- | ---: | ---: | ---: |
| application-log | balanced | 2,105 | 1,554 | 26.2% |
| application-log | safe | 2,105 | 1,554 | 26.2% |
| build-output | balanced | 652 | 581 | 10.9% |
| build-output | safe | 652 | 581 | 10.9% |
| compiler-output | balanced | 1,982 | 1,982 | 0.0% |
| compiler-output | safe | 1,982 | 1,982 | 0.0% |
| instructions | balanced | 96 | 96 | 0.0% |
| instructions | safe | 96 | 96 | 0.0% |
| mixed-context | balanced | 1,156 | 1,156 | 0.0% |
| mixed-context | safe | 1,156 | 1,156 | 0.0% |
| package-manager | balanced | 1,990 | 1,787 | 10.2% |
| package-manager | safe | 1,990 | 1,787 | 10.2% |
| source-code | balanced | 75 | 75 | 0.0% |
| source-code | safe | 75 | 75 | 0.0% |
| stack-trace | balanced | 3,160 | 2,204 | 30.3% |
| stack-trace | safe | 3,160 | 3,160 | 0.0% |
| structured-text | balanced | 134 | 134 | 0.0% |
| structured-text | safe | 134 | 134 | 0.0% |
| tabular-output | balanced | 985 | 985 | 0.0% |
| tabular-output | safe | 985 | 985 | 0.0% |
| test-output | balanced | 2,851 | 2,851 | 0.0% |
| test-output | safe | 2,851 | 2,851 | 0.0% |
## Methodology

- Every fixture is a deterministic file in `benchmark/fixtures/`.
- Measurements come from running `optimize()` on the actual fixture. Nothing is hard-coded.
- Idempotence is asserted: `optimize(optimize(x)) === optimize(x)`.
