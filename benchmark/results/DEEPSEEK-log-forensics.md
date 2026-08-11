# iritoken live DeepSeek benchmark

- Model: `deepseek-v4-flash` (thinking disabled)
- Trials / requests: 10 / 20
- Original input tokens: 7,990
- Task filter: log-forensics
- Optimized input tokens: 5,900
- API-reported input-token reduction: 26.16%
- Original fact recall: 87.5%
- Optimized fact recall: 100.0%
- Original complete tasks: 5/10
- Optimized complete tasks: 10/10
- Mean paired fact-recall difference: 12.50pp
- Bootstrap 95% CI: 12.50pp to 12.50pp
- Non-inferiority margin / result: -5.0pp / PASS
- Approximate API cost at documented cache-miss rates: $0.002533

Token counts come from DeepSeek API usage, not a character heuristic.
Jobs are deterministically shuffled and the API never receives variant labels.
Answers are not stored; only hashes and missing rubric facts are retained.
