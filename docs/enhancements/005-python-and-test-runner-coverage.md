# Enhancement 005: Python and test-runner coverage

Date: 2026-08-11  
Status: implemented and locally validated  
Release: 0.3.0

## Objective

Extend the quality-first `balanced` preset to common Python tracebacks and
fully passing pytest, Go test, and Cargo output without weakening the rule that
failure reports and unique diagnostic information remain intact.

This enhancement does not summarize content or decide which facts are
important. It only compacts mechanically recognized repetition.

## What the percentages mean

Each fixture percentage is character reduction for one committed input:

```text
(original characters - optimized characters) / original characters × 100
```

For example, the Python fixture decreased from 544 to 401 characters:

```text
(544 - 401) / 544 × 100 = 26.3%
```

The percentage measures removed representation, not removed information. A
high percentage means that a fixture contained a large amount of recognized
repetition. It does not mean that the same percentage of facts was discarded.

## Measured balanced-preset results

| Fixture | Original characters | Optimized characters | Character reduction | Estimated tokens before | Estimated tokens after | Estimated token reduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Python traceback | 544 | 401 | **26.3%** | 97 | 72 | 25.8% |
| pytest passing report | 377 | 103 | **72.7%** | 58 | 18 | 69.0% |
| Go passing report | 269 | 63 | **76.6%** | 50 | 12 | 76.0% |
| Cargo passing report | 214 | 114 | **46.7%** | 43 | 25 | 41.9% |

Across the complete deterministic corpus, the balanced preset reduced 18,977
characters to 15,958 characters. That removes 3,019 characters, or **15.9%**.
The percentage is calculated from the summed corpus sizes; it is not an
unweighted average of the per-fixture percentages.

The deterministic quality task set estimated 2,910 input tokens before
optimization and 2,484 after optimization, a reduction of 426 tokens or
**14.6%**. All 16 task verifications passed before and after optimization.

## Exact meaning of the token estimate

The 14.6% figure is a local estimate, not a model-provider token count. The
project's `estimateTokens()` function averages:

- character count divided by four; and
- a whitespace-separated, word-like count.

The result is rounded to an integer for each fixture. Different models use
different tokenizers, so actual savings may be higher or lower. Exact library
statistics require a caller-provided tokenizer through `tokenCounter`. The
separate published DeepSeek benchmark uses API-reported token usage and must
not be conflated with this deterministic estimate.

## Transformations

### Python traceback

Python tracebacks represent a frame with a location line and, commonly, an
indented source line. Repeated identical two-line records are reduced to one
record with an explicit count.

Before:

```text
  File "/app/client.py", line 41, in fetch
    return response.json()["account"]
  File "/app/client.py", line 41, in fetch
    return response.json()["account"]
  File "/app/client.py", line 41, in fetch
    return response.json()["account"]
```

After:

```text
  File "/app/client.py", line 41, in fetch [repeated 3 times]
    return response.json()["account"]
```

Exception types and messages, exception chaining, unique frames, paths, line
numbers, function names, and the retained source line remain present.

### Fully passing test reports

The test-output cleaner recognizes passing records from Vitest, Jest, pytest,
Go test, and Cargo. Three or more consecutive passing cases can be represented
by a count while the runner's authoritative final summary remains intact.

Example:

```text
tests/test_api.py::test_create_user PASSED [ 25%]
tests/test_api.py::test_read_user PASSED   [ 50%]
tests/test_api.py::test_update_user PASSED [ 75%]
tests/test_api.py::test_delete_user PASSED [100%]
================ 4 passed in 0.08s ================
```

becomes:

```text
✓ 4 test cases passed
================ 4 passed in 0.08s ================
```

Go's paired `=== RUN` and `--- PASS` records are counted as one test case. Cargo
`test ... ok` records are handled individually.

## Failure-preservation boundary

If a recognized report contains a supported failure marker, the test-output
cleaner returns the entire report unchanged. This preserves:

- passing-test context surrounding a failure;
- failed test names;
- assertion messages and expected/received values;
- file paths and source locations;
- stack traces; and
- the runner's final summary.

This boundary is deliberate. A failing report is more valuable as diagnostic
evidence than as an opportunity for additional compression.

The `safe` preset also leaves all test-output and stack-trace compaction
disabled. These new transformations run through `balanced` and `aggressive`,
or through explicit cleaner overrides.

## Validation evidence

| Gate | Result |
| --- | ---: |
| Unit and integration tests | 139/139 passed |
| Deterministic quality tasks | 16/16 before and 16/16 after |
| Corpus regression | 16 tasks × 3 presets passed |
| Semantic invariant checks | 33/33 passed |
| Unexpected semantic transformations | 0 |
| Terminal eligibility | 100% recall, 100% specificity on the labelled set |
| Packed-artifact smoke test | passed |
| Release check | passed |

The semantic suite includes exact-preservation cases for unique Python frames
and failing pytest, Go, and Cargo reports. Every preset is also checked for
idempotence and non-expansion.

These results apply to the committed fixtures and rules. They are regression
evidence, not a universal guarantee for every possible runner version or log
format.

## Reproduction

```bash
npm test
npm run benchmark -- safe
npm run benchmark -- balanced
npm run benchmark:quality
npm run benchmark:corpus
npm run benchmark:detection
npm run benchmark:semantic
npm run benchmark:verify
npm run release:check
```

The generated per-fixture results are rendered in
[`benchmark/results/REPORT.md`](../../benchmark/results/REPORT.md).

## Limitations

- Test-runner recognition covers committed format patterns, not every version,
  plugin, custom reporter, or localized output.
- Passing test names are intentionally replaced by a count only in a fully
  passing report with at least three recognized consecutive records.
- Python compaction requires textually identical consecutive frame records;
  similar but non-identical frames remain untouched.
- Estimated token figures are not suitable for billing claims or exact context
  budgeting.
- New real-world fixtures should be added before broadening any detection
  expression.
