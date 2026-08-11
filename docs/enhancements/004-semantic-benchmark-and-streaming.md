# Enhancement 004: semantic benchmark and bounded terminal streaming

Date: 2026-08-11  
Status: implemented and locally validated

## Objectives

- Replace substring-only confidence with executable semantic checks.
- Measure false-positive transformations per cleaner.
- Report compression by workload.
- Attach provenance and methodology identity to generated benchmark data.
- Replace noisy heap deltas with isolated multi-trial peak RSS measurements.
- Provide a genuinely memory-bounded stream for known terminal output.

## Semantic executable gate

The new `benchmark:semantic` command runs seven cases across all three presets,
for 21 checks total:

- JSON value equivalence after parsing;
- TypeScript syntax validation plus exact repeated-entry preservation;
- Markdown hard-break preservation;
- YAML block-scalar whitespace preservation;
- aligned terminal-table preservation;
- unique stack-frame preservation;
- confirmed terminal cleanup as a positive control.

Every result is also checked for idempotence and non-expansion. Transformations
not explicitly allowed by a case count as false positives.

Measured result:

| Cleaner | False positives / opportunities |
| --- | ---: |
| ANSI | 0/18 |
| Whitespace | 0/18 |
| Duplicate lines | 0/21 |
| Stack trace | 0/14 |
| Test output | 0/14 |
| Repeated blocks | 0/7 |

These rates describe only the committed seven-case semantic suite. They are not
universal safety percentages.

## Workload and provenance reporting

Every deterministic task now has a workload label. Generated compression JSON
uses schema version 2 and records:

- methodology version `semantic-gates-v1`;
- generation timestamp;
- Node version, platform, and architecture;
- preset and raw fixture measurements.

The generated Markdown report includes workload-level aggregates. The result
policy in `benchmark/results/README.md` defines how methodology changes
supersede earlier safety claims without deleting historical reports.

## Stable performance measurement

`benchmark:perf` now runs each input size in a fresh process three times and
reports the median. It uses process peak RSS instead of before/after heap delta.

Measured balanced-preset results:

| Input | Median time | Median peak RSS |
| ---: | ---: | ---: |
| 0.01 MiB | 1.8 ms | 75.0 MiB |
| 0.10 MiB | 3.6 ms | 76.0 MiB |
| 1.00 MiB | 21.0 ms | 89.8 MiB |
| 10.00 MiB | 178.9 ms | 234.0 MiB |

The automated 10 MiB budget is below 10 seconds and below 350 MiB peak RSS.

## Streaming implementation

`createOptimizeTransform()` remains buffered and exactly equivalent to
`optimize()`. Changing its semantics would be a compatibility and safety
regression because detection and context-specific cleaners need complete input.

`createTerminalOptimizeTransform()` is the new bounded alternative for callers
that already know their input is terminal output. It processes complete lines
incrementally and applies:

- ANSI removal;
- trailing and excessive whitespace cleanup;
- exact consecutive-line deduplication;
- input-byte and maximum-line-byte limits.

It does not run global content detection, stack/test cleanup, repeated-block
cleanup, custom token counters, or full-result observers.

Isolated 12 MiB stream benchmark, median of three processes:

| Mode | Median time | Median peak RSS | Output |
| --- | ---: | ---: | ---: |
| Buffered exact transform | 462.2 ms | 284.0 MiB | 10.41 MiB |
| Bounded terminal transform | 332.2 ms | 89.4 MiB | 10.41 MiB |

For this fixture, the bounded transform reduced peak RSS by 68.5% and runtime by
28.1%. These figures apply to the committed deterministic terminal fixture and
the recorded environment; they are not universal throughput claims.

## Validation commands

```bash
npm run lint
npm run typecheck
npm test
npm run benchmark:semantic
npm run benchmark:detection
npm run benchmark:corpus
npm run benchmark:quality
npm run benchmark:perf
npm run benchmark:stream
npm run report
npm run pack:smoke
```

## Acceptance criteria

- All semantic executable checks pass: passed, 21/21.
- No unexpected cleaner transformation occurs: passed, 0 false positives.
- Workload-level reporting is generated from raw fixture data: passed.
- Generated runs carry schema, methodology, runtime, and timestamp: passed.
- Performance uses isolated median peak RSS: passed.
- Bounded stream uses less peak RSS than buffered stream: passed.
- Existing buffered stream remains API-compatible: passed.
- Unit, integration, property, corpus, and package checks pass: passed.

## Limitations

- The terminal stream requires the caller to know the input category.
- Memory is bounded by stream internals plus `maxLineBytes`, not mathematically
  constant for arbitrarily long newline-free input.
- Semantic coverage must grow before broader format-safety claims are made.
- Exact model-token validation still requires a real tokenizer or provider run.
