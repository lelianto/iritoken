# TokenSlim live DeepSeek benchmark

- Model: `deepseek-v4-flash` (thinking disabled)
- Trials / requests: 3 / 6
- Original input tokens: 1,359
- Task filter: jest-failure-analysis
- Optimized input tokens: 1,227
- API-reported input-token reduction: 9.71%
- Original fact recall: 66.7%
- Optimized fact recall: 50.0%
- Original complete tasks: 1/3
- Optimized complete tasks: 0/3
- Approximate API cost at documented cache-miss rates: $0.000443

Token counts come from DeepSeek API usage, not a character heuristic.
Jobs are deterministically shuffled and the API never receives variant labels.
Answers are not stored; only hashes and missing rubric facts are retained.
