# iritoken live DeepSeek benchmark

- Model: `deepseek-v4-flash` (thinking disabled)
- Corpus: `live-v2-2026-08-11-quartz`
- Corpus SHA-256: `2e411b8032845ac7b3c3d618834a90686bb087de703c31591c839ad4502a49c5`
- Trials / requests: 5 / 60
- Original input tokens: 7,170
- Task filter: all
- Optimized input tokens: 6,185
- API-reported input-token reduction: 13.74%
- Original fact recall: 88.0%
- Optimized fact recall: 88.0%
- Original complete tasks: 15/30
- Optimized complete tasks: 15/30
- Mean paired fact-recall difference: 0.00pp
- Task-cluster bootstrap 95% CI: 0.00pp to 0.00pp
- Non-inferiority margin / result: -5.0pp / PASS
- Approximate API cost at documented cache-miss rates: $0.002690

Token counts come from DeepSeek API usage, not a character heuristic.
Jobs are deterministically shuffled and the API never receives variant labels.
Answers are not stored; only hashes and missing rubric facts are retained.
