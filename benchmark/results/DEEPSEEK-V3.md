# iritoken live DeepSeek benchmark

- Model: `deepseek-v4-flash` (thinking disabled)
- Corpus: `live-v3-2026-08-11-aurora`
- Corpus SHA-256: `d774fcfb09b49362c1feb4bd890ba80589bd92be8444f1fcd2f3b5eb6c30a743`
- Trials / requests: 5 / 60
- Original input tokens: 8,635
- Task filter: all
- Optimized input tokens: 8,170
- API-reported input-token reduction: 5.39%
- Original fact recall: 92.5%
- Optimized fact recall: 95.8%
- Original complete tasks: 21/30
- Optimized complete tasks: 25/30
- Mean paired fact-recall difference: 3.33pp
- Task-cluster bootstrap 95% CI: 0.00pp to 10.00pp
- Non-inferiority margin / result: -5.0pp / PASS
- Approximate API cost at documented cache-miss rates: $0.003239

Token counts come from DeepSeek API usage, not a character heuristic.
Jobs are deterministically shuffled and the API never receives variant labels.
Answers are not stored; only hashes and missing rubric facts are retained.
