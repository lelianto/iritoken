# iritoken compression benchmark

Generated automatically by `npm run benchmark`. Do not edit by hand.

> Token counts use the package's documented heuristic (the average of
> `characters / 4` and a word-like count) and are
> labelled estimates. They are NOT exact model token counts.

## preset: balanced

| Fixture | Original (chars) | Optimized (chars) | Reduction | Original (tokens) | Optimized (tokens) | Token reduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| cargo-test-passing | 214 | 114 | 46.7% | 43 | 25 | 41.9% |
| docker-build | 652 | 581 | 10.9% | 133 | 119 | 10.5% |
| go-test-passing | 269 | 63 | 76.6% | 50 | 12 | 76.0% |
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
| pytest-passing | 377 | 103 | 72.7% | 58 | 18 | 69.0% |
| python-traceback | 544 | 401 | 26.3% | 97 | 72 | 25.8% |
| repeated-instructions | 96 | 96 | 0.0% | 18 | 18 | 0.0% |
| repeated-source-code | 75 | 75 | 0.0% | 14 | 14 | 0.0% |
| repetitive-logs | 2,105 | 1,554 | 26.2% | 387 | 287 | 25.8% |
| semantic-whitespace | 134 | 134 | 0.0% | 26 | 26 | 0.0% |
| stack-trace | 2,616 | 1,660 | 36.5% | 410 | 259 | 36.8% |
| tsc-errors | 1,982 | 1,982 | 0.0% | 355 | 355 | 0.0% |
| vitest-output | 1,685 | 1,685 | 0.0% | 298 | 298 | 0.0% |

**Total for preset: balanced — 15.9% characters**

## preset: safe

| Fixture | Original (chars) | Optimized (chars) | Reduction | Original (tokens) | Optimized (tokens) | Token reduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| cargo-test-passing | 214 | 214 | 0.0% | 43 | 43 | 0.0% |
| docker-build | 652 | 581 | 10.9% | 133 | 119 | 10.5% |
| go-test-passing | 269 | 269 | 0.0% | 50 | 50 | 0.0% |
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
| pytest-passing | 377 | 377 | 0.0% | 58 | 58 | 0.0% |
| python-traceback | 544 | 544 | 0.0% | 97 | 97 | 0.0% |
| repeated-instructions | 96 | 96 | 0.0% | 18 | 18 | 0.0% |
| repeated-source-code | 75 | 75 | 0.0% | 14 | 14 | 0.0% |
| repetitive-logs | 2,105 | 1,554 | 26.2% | 387 | 287 | 25.8% |
| semantic-whitespace | 134 | 134 | 0.0% | 26 | 26 | 0.0% |
| stack-trace | 2,616 | 2,616 | 0.0% | 410 | 410 | 0.0% |
| tsc-errors | 1,982 | 1,982 | 0.0% | 355 | 355 | 0.0% |
| vitest-output | 1,685 | 1,685 | 0.0% | 298 | 298 | 0.0% |

**Total for preset: safe — 6.6% characters**


## Combined

Total input characters: 37,954
Total optimized characters: 33,676
Overall reduction: 11.3%


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
| stack-trace | balanced | 3,160 | 2,061 | 34.8% |
| stack-trace | safe | 3,160 | 3,160 | 0.0% |
| structured-text | balanced | 134 | 134 | 0.0% |
| structured-text | safe | 134 | 134 | 0.0% |
| tabular-output | balanced | 985 | 985 | 0.0% |
| tabular-output | safe | 985 | 985 | 0.0% |
| test-output | balanced | 3,711 | 3,131 | 15.6% |
| test-output | safe | 3,711 | 3,711 | 0.0% |
| unclassified | balanced | 2,931 | 2,416 | 17.6% |
| unclassified | safe | 2,931 | 2,497 | 14.8% |
## Methodology

- Every fixture is a deterministic file in `benchmark/fixtures/`.
- Measurements come from running `optimize()` on the actual fixture. Nothing is hard-coded.
- Idempotence is asserted: `optimize(optimize(x)) === optimize(x)`.
