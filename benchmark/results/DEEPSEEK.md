# TokenSlim live DeepSeek benchmark

- Model: `deepseek-v4-flash` (thinking disabled)
- Trials / requests: 5 / 70
- Original input tokens: 22,840
- Task filter: all
- Optimized input tokens: 19,695
- API-reported input-token reduction: 13.77%
- Original fact recall: 83.2%
- Optimized fact recall: 85.2%
- Original complete tasks: 16/35
- Optimized complete tasks: 19/35
- Mean paired fact-recall difference: 2.14pp
- Task-cluster bootstrap 95% CI: 0.00pp to 6.43pp
- Non-inferiority margin / result: -5.0pp / PASS
- Approximate API cost at documented cache-miss rates: $0.007438

Token counts come from DeepSeek API usage, not a character heuristic.
Jobs are deterministically shuffled and the API never receives variant labels.
Answers are not stored; only hashes and missing rubric facts are retained.

## Per-task fact recall

| Task | Original | Optimized |
| --- | ---: | ---: |
| npm-error-diagnosis | 100.0% | 100.0% |
| jest-failure-analysis | 90.0% | 90.0% |
| tsc-fix-list | 85.7% | 85.7% |
| agent-context-understanding | 45.0% | 45.0% |
| log-forensics | 85.0% | 100.0% |
| stack-understanding | 100.0% | 100.0% |
| vitest-failure-analysis | 75.0% | 75.0% |

The quality-first balanced preset passed the pre-registered -5pp
non-inferiority margin. Its task-cluster bootstrap interval did not show a
fact-recall decrease, while API-reported input tokens fell 13.77%.
