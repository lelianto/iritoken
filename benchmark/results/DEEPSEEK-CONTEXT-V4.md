# DeepSeek V4 Flash context-engine E2E campaign

- Corpus: `context-v4-2026-08-11-prismatic`
- Fingerprint: `7dad19cbf8e8502477013b79e9fae62121936421517f81a6c7181b3d4ae8798b`
- Model: `deepseek-v4-flash` (thinking disabled, temperature 0)
- Tasks / trials / requests: 9 / 3 / 54
- Data policy: explicitly synthetic; model answers are hashed, not stored
- Randomized paired order: yes

## Overall results

- Original fact recall: **97.2%**
- Optimized fact recall: **99.1%**
- Original prompt tokens: **4416**
- Optimized prompt tokens: **3885**
- Prompt-token reduction: **12.02%**
- Complete original / optimized runs: **24/27** / **26/27**
- Provider cache hit / miss tokens: **2944 / 5357**
- Estimated API cost: **$0.001124**

## Per-task results

| Difficulty | Task | Original recall | Optimized recall | Original tokens | Optimized tokens | Reduction |
|---|---|---:|---:|---:|---:|---:|
| easy | easy-glass-library | 100.0% | 100.0% | 366 | 366 | 0.0% |
| easy | easy-copper-kite | 100.0% | 100.0% | 366 | 366 | 0.0% |
| easy | easy-lantern-dialogue | 100.0% | 100.0% | 384 | 348 | 9.4% |
| medium | medium-river-revision | 100.0% | 100.0% | 441 | 408 | 7.5% |
| medium | medium-planet-retrieval | 100.0% | 100.0% | 474 | 342 | 27.8% |
| medium | medium-clockwork-trace | 75.0% | 91.7% | 537 | 474 | 11.7% |
| hard | hard-comet-multihop | 100.0% | 100.0% | 633 | 633 | 0.0% |
| hard | hard-twin-archive | 100.0% | 100.0% | 591 | 411 | 30.5% |
| hard | hard-prism-council | 100.0% | 100.0% | 624 | 537 | 13.9% |

## Optimized context/prompt trace

Every row is a checkpoint. SHA-256 identifies the exact synthetic message set without duplicating prompt contents in the report.

| Task | Stage | Messages | Characters | Estimated tokens | SHA-256 prefix |
|---|---|---:|---:|---:|---|
| easy-glass-library | 01-raw-context | 3 | 375 | 49 | `b3e5c7d83eec` |
| easy-glass-library | 02-content-routing-and-optimization | 3 | 375 | 49 | `b3e5c7d83eec` |
| easy-glass-library | 03-semantic-retrieval | 3 | 375 | 49 | `b3e5c7d83eec` |
| easy-glass-library | 04-context-ranking | 3 | 375 | 49 | `b3e5c7d83eec` |
| easy-glass-library | 05-token-budget-and-conversation-compaction | 3 | 375 | 49 | `b3e5c7d83eec` |
| easy-glass-library | 06-model-routing | 3 | 375 | 49 | `b3e5c7d83eec` |
| easy-glass-library | 07-cache-aware-prompt | 3 | 375 | 49 | `b3e5c7d83eec` |
| easy-glass-library | 08-semantic-cache-probe | 3 | 375 | 49 | `b3e5c7d83eec` |
| easy-copper-kite | 01-raw-context | 3 | 412 | 58 | `6439d0d66af8` |
| easy-copper-kite | 02-content-routing-and-optimization | 3 | 412 | 58 | `6439d0d66af8` |
| easy-copper-kite | 03-semantic-retrieval | 3 | 412 | 58 | `6439d0d66af8` |
| easy-copper-kite | 04-context-ranking | 3 | 412 | 58 | `6439d0d66af8` |
| easy-copper-kite | 05-token-budget-and-conversation-compaction | 3 | 412 | 58 | `6439d0d66af8` |
| easy-copper-kite | 06-model-routing | 3 | 412 | 58 | `6439d0d66af8` |
| easy-copper-kite | 07-cache-aware-prompt | 3 | 412 | 58 | `6439d0d66af8` |
| easy-copper-kite | 08-semantic-cache-probe | 3 | 412 | 58 | `6439d0d66af8` |
| easy-lantern-dialogue | 01-raw-context | 5 | 470 | 62 | `bf72dde57078` |
| easy-lantern-dialogue | 02-content-routing-and-optimization | 5 | 470 | 62 | `bf72dde57078` |
| easy-lantern-dialogue | 03-semantic-retrieval | 5 | 470 | 62 | `bf72dde57078` |
| easy-lantern-dialogue | 04-context-ranking | 5 | 470 | 62 | `bf72dde57078` |
| easy-lantern-dialogue | 05-token-budget-and-conversation-compaction | 4 | 407 | 55 | `6641d6ae09c1` |
| easy-lantern-dialogue | 06-model-routing | 4 | 407 | 55 | `6641d6ae09c1` |
| easy-lantern-dialogue | 07-cache-aware-prompt | 4 | 407 | 55 | `6641d6ae09c1` |
| easy-lantern-dialogue | 08-semantic-cache-probe | 4 | 407 | 55 | `6641d6ae09c1` |
| medium-river-revision | 01-raw-context | 5 | 522 | 70 | `17f809132dcb` |
| medium-river-revision | 02-content-routing-and-optimization | 5 | 522 | 70 | `17f809132dcb` |
| medium-river-revision | 03-semantic-retrieval | 5 | 522 | 70 | `17f809132dcb` |
| medium-river-revision | 04-context-ranking | 5 | 522 | 70 | `17f809132dcb` |
| medium-river-revision | 05-token-budget-and-conversation-compaction | 4 | 481 | 66 | `e669f62ebd09` |
| medium-river-revision | 06-model-routing | 4 | 481 | 66 | `e669f62ebd09` |
| medium-river-revision | 07-cache-aware-prompt | 4 | 481 | 66 | `e669f62ebd09` |
| medium-river-revision | 08-semantic-cache-probe | 4 | 481 | 66 | `e669f62ebd09` |
| medium-planet-retrieval | 01-raw-context | 3 | 338 | 48 | `516345ce8c3f` |
| medium-planet-retrieval | 02-content-routing-and-optimization | 3 | 338 | 48 | `516345ce8c3f` |
| medium-planet-retrieval | 03-semantic-retrieval | 4 | 422 | 59 | `1a9c7f415038` |
| medium-planet-retrieval | 04-context-ranking | 4 | 422 | 59 | `1a9c7f415038` |
| medium-planet-retrieval | 05-token-budget-and-conversation-compaction | 4 | 422 | 59 | `1a9c7f415038` |
| medium-planet-retrieval | 06-model-routing | 4 | 422 | 59 | `1a9c7f415038` |
| medium-planet-retrieval | 07-cache-aware-prompt | 4 | 422 | 59 | `1a9c7f415038` |
| medium-planet-retrieval | 08-semantic-cache-probe | 4 | 422 | 59 | `1a9c7f415038` |
| medium-clockwork-trace | 01-raw-context | 3 | 561 | 64 | `03988adc2484` |
| medium-clockwork-trace | 02-content-routing-and-optimization | 3 | 502 | 61 | `6f671386ec74` |
| medium-clockwork-trace | 03-semantic-retrieval | 3 | 502 | 61 | `6f671386ec74` |
| medium-clockwork-trace | 04-context-ranking | 3 | 502 | 61 | `6f671386ec74` |
| medium-clockwork-trace | 05-token-budget-and-conversation-compaction | 3 | 502 | 61 | `6f671386ec74` |
| medium-clockwork-trace | 06-model-routing | 3 | 502 | 61 | `6f671386ec74` |
| medium-clockwork-trace | 07-cache-aware-prompt | 3 | 502 | 61 | `6f671386ec74` |
| medium-clockwork-trace | 08-semantic-cache-probe | 3 | 502 | 61 | `6f671386ec74` |
| hard-comet-multihop | 01-raw-context | 3 | 720 | 56 | `7952ff579ff3` |
| hard-comet-multihop | 02-content-routing-and-optimization | 3 | 720 | 56 | `7952ff579ff3` |
| hard-comet-multihop | 03-semantic-retrieval | 3 | 720 | 56 | `7952ff579ff3` |
| hard-comet-multihop | 04-context-ranking | 3 | 720 | 56 | `7952ff579ff3` |
| hard-comet-multihop | 05-token-budget-and-conversation-compaction | 3 | 720 | 56 | `7952ff579ff3` |
| hard-comet-multihop | 06-model-routing | 3 | 720 | 56 | `7952ff579ff3` |
| hard-comet-multihop | 07-cache-aware-prompt | 3 | 720 | 56 | `7952ff579ff3` |
| hard-comet-multihop | 08-semantic-cache-probe | 3 | 720 | 56 | `7952ff579ff3` |
| hard-twin-archive | 01-raw-context | 3 | 381 | 52 | `b1306b1a1b31` |
| hard-twin-archive | 02-content-routing-and-optimization | 3 | 381 | 52 | `b1306b1a1b31` |
| hard-twin-archive | 03-semantic-retrieval | 4 | 492 | 71 | `6f18dcd75bd4` |
| hard-twin-archive | 04-context-ranking | 4 | 492 | 71 | `6f18dcd75bd4` |
| hard-twin-archive | 05-token-budget-and-conversation-compaction | 4 | 492 | 71 | `6f18dcd75bd4` |
| hard-twin-archive | 06-model-routing | 4 | 492 | 71 | `6f18dcd75bd4` |
| hard-twin-archive | 07-cache-aware-prompt | 4 | 492 | 71 | `6f18dcd75bd4` |
| hard-twin-archive | 08-semantic-cache-probe | 4 | 492 | 71 | `6f18dcd75bd4` |
| hard-prism-council | 01-raw-context | 8 | 801 | 98 | `39b03216ae26` |
| hard-prism-council | 02-content-routing-and-optimization | 8 | 801 | 98 | `39b03216ae26` |
| hard-prism-council | 03-semantic-retrieval | 8 | 801 | 98 | `39b03216ae26` |
| hard-prism-council | 04-context-ranking | 8 | 801 | 98 | `39b03216ae26` |
| hard-prism-council | 05-token-budget-and-conversation-compaction | 6 | 664 | 83 | `07c41cc85e6e` |
| hard-prism-council | 06-model-routing | 6 | 664 | 83 | `07c41cc85e6e` |
| hard-prism-council | 07-cache-aware-prompt | 6 | 664 | 83 | `07c41cc85e6e` |
| hard-prism-council | 08-semantic-cache-probe | 6 | 664 | 83 | `07c41cc85e6e` |

## Acceptance gates

- No fact-regression gate: PASS
- All optimized runs complete: FAIL
- Prompt tokens reduced: PASS
- Local hard budgets, retrieval IDs, cache similar-hit and dissimilar-miss: PASS (enforced before API calls)

Detailed machine-readable traces, per-run usage, missing facts, and observations are in `deepseek-context-v4.json`.