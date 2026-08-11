# Context-engine security and performance

Measured on 2026-08-11 after the context-engine E2E campaign. These results are
local observations on the recorded Node.js/macOS runtime, not universal latency
or memory guarantees.

## Security hardening

The context-engine APIs now fail closed at explicit resource boundaries:

- budget selection: 10,000 items by default, finite scores, unique IDs;
- ranking: 10,000 candidates and 16 Mi characters by default;
- conversation compaction: 1,000 messages and 16 Mi characters by default;
- semantic index: 10,000 entries, 8,192 vector dimensions, and 1 Mi characters
  per document by default;
- semantic cache: 100 entries, TTL, and 8,192 consistent vector dimensions;
- model routing: 10,000 routes, 100 required capabilities, unique IDs, and
  validated numeric capacity/cost/priority;
- metrics: 10,000 buffered observations, 32 attributes per observation, and
  1,024 characters per name/string attribute by default;
- provider adapter: HTTP(S)-only URL validation, non-empty credentials, 10,000
  messages, 16 Mi request characters, 500-character error bodies, abort
  propagation, and a 30-second default timeout.

Custom provider headers cannot override the configured Authorization or
Content-Type values. Adapter base URLs remain trusted configuration. Passing an
attacker-controlled base URL can create SSRF in the host application and is
explicitly outside the safe usage contract.

Duplicate budget IDs are rejected because ID-based selection could otherwise
select multiple entries while counting only one. Duplicate route IDs are rejected
to keep routing decisions unambiguous. Semantic dimensions are validated on both
write and lookup to prevent large or inconsistent vector work.

`npm run test:security` passed 57/57 checks, including six new context/provider
boundary cases. `npm audit --json` reported zero info, low, moderate, high, or
critical vulnerabilities across the installed dependency graph at measurement
time.

## Performance results

The new isolated context benchmark runs ranking, hard-budget selection, building
a 64-dimensional semantic index, and top-k retrieval. Values are medians of three
fresh processes.

| Entries | Time | Peak RSS | Gate |
|---:|---:|---:|---:|
| 100 | 2.5 ms | 79.2 MiB | pass |
| 1,000 | 9.9 ms | 83.5 MiB | pass |
| 10,000 | 81.4 ms | 128.5 MiB | pass |

The 10,000-entry gate requires at most 3 seconds, at most 350 MiB peak RSS, and
the exact expected nearest neighbor. All conditions passed.

Core balanced-preset results:

| Input | Time | Peak RSS | Cost/MiB |
|---:|---:|---:|---:|
| 10 KiB | 3.0 ms | 75.0 MiB | 307.8 ms |
| 100 KiB | 6.9 ms | 76.3 MiB | 70.7 ms |
| 1 MiB | 31.2 ms | 90.9 MiB | 31.2 ms |
| 10 MiB | 265.3 ms | 233.5 MiB | 26.5 ms |

For the 12 MiB stream workload, buffered optimization took 538.2 ms with
276.3 MiB peak RSS. The incremental terminal transform took 315.3 ms with
89.5 MiB peak RSS and produced the same 10.41 MiB output size. Incremental peak
RSS was 32.4% of buffered peak RSS, below the 60% gate.

## Complexity and residual risks

- ranking and budget selection sort candidates: O(n log n);
- semantic search computes every cosine score: O(n × dimensions), followed by
  O(n log n) sorting in the current implementation;
- conversation compaction invokes deterministic optimization per selected input
  message and is bounded by message/text ceilings;
- semantic-cache lookup is linear in cache entries, bounded to 100 by default.

The current 10,000-entry measurements leave substantial budget headroom, but a
heap-based top-k semantic search would be preferable before raising the default
entry ceiling materially. Semantic cache correctness still depends on caller
choice of embedding model, threshold, tenant partitioning, and whether cached
answers are safe to reuse. Metrics attributes are size-bounded but callers must
still avoid placing source content or secrets in them.

## Reproduction

```bash
npm run test:security
npm audit --json
npm run benchmark:context-perf
npm run benchmark:perf
npm run benchmark:stream
```
