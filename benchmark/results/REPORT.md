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
| live-v2-cobalt-build | 509 | 440 | 13.6% | 98 | 85 | 13.3% |
| live-v2-indigo-deploy | 477 | 352 | 26.2% | 83 | 63 | 24.1% |
| live-v2-opal-compiler | 368 | 368 | 0.0% | 67 | 67 | 0.0% |
| live-v2-quartz-queue | 702 | 462 | 34.2% | 116 | 79 | 31.9% |
| live-v2-saffron-tests | 423 | 423 | 0.0% | 79 | 79 | 0.0% |
| live-v2-violet-stack | 452 | 371 | 17.9% | 73 | 61 | 16.4% |
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

**Total for preset: balanced — 12.7% characters**

## preset: safe

| Fixture | Original (chars) | Optimized (chars) | Reduction | Original (tokens) | Optimized (tokens) | Token reduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| docker-build | 652 | 581 | 10.9% | 133 | 119 | 10.5% |
| jest-output | 1,166 | 1,166 | 0.0% | 232 | 232 | 0.0% |
| kubernetes-events | 985 | 985 | 0.0% | 166 | 166 | 0.0% |
| live-v2-cobalt-build | 509 | 440 | 13.6% | 98 | 85 | 13.3% |
| live-v2-indigo-deploy | 477 | 352 | 26.2% | 83 | 63 | 24.1% |
| live-v2-opal-compiler | 368 | 368 | 0.0% | 67 | 67 | 0.0% |
| live-v2-quartz-queue | 702 | 462 | 34.2% | 116 | 79 | 31.9% |
| live-v2-saffron-tests | 423 | 423 | 0.0% | 79 | 79 | 0.0% |
| live-v2-violet-stack | 452 | 452 | 0.0% | 73 | 73 | 0.0% |
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

**Total for preset: safe — 6.9% characters**


## Combined

Total input characters: 36,234
Total optimized characters: 32,679
Overall reduction: 9.8%


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
| unclassified | balanced | 2,931 | 2,416 | 17.6% |
| unclassified | safe | 2,931 | 2,497 | 14.8% |
## Methodology

- Every fixture is a deterministic file in `benchmark/fixtures/`.
- Measurements come from running `optimize()` on the actual fixture. Nothing is hard-coded.
- Idempotence is asserted: `optimize(optimize(x)) === optimize(x)`.
