# DeepSeek V4 Flash context-engine campaign analysis

Measured on 2026-08-11 against `deepseek-v4-flash`, non-thinking mode,
temperature 0. The campaign uses only explicitly synthetic invented facts.

## Outcome

The final `context-v4.1-2026-08-11-prismatic` campaign passed every acceptance
gate across 9 tasks, 3 trials, 2 variants, and 54 API requests.

| Metric | Original | Optimized |
|---|---:|---:|
| Complete runs | 27/27 | 27/27 |
| Fact recall | 100.0% | 100.0% |
| API prompt tokens | 4,425 | 3,894 |
| Prompt-token reduction | — | 12.0% |

DeepSeek reported 4,224 cache-hit and 4,095 cache-miss prompt tokens across both
variants, a 50.78% observed hit share. The whole final campaign cost approximately
$0.000961 at the configured V4 Flash rates, below the $0.03 hard cap.

## Difficulty progression

| Difficulty | What was tested | Original tokens | Optimized tokens | Reduction | Recall |
|---|---|---:|---:|---:|---:|
| Easy | Structured facts, repetitive output, short dialogue noise | 1,116 | 1,080 | 3.23% | 100% → 100% |
| Medium | Superseded facts, vector retrieval, repeated stack frames | 1,461 | 1,233 | 15.61% | 100% → 100% |
| Hard | Multi-hop correction, near-neighbor retrieval, long conflicting history | 1,848 | 1,581 | 14.45% | 100% → 100% |

The low easy-task reduction is intentional fail-open behavior. Two already-small
contexts were not changed. Savings increased when contexts contained removable
history or irrelevant retrieval candidates.

## Per-task analysis

- `easy-glass-library`: JSON facts remained unchanged; 100% recall, 0% saving.
- `easy-copper-kite`: the conservative pipeline retained the short synthetic log;
  100% recall, 0% saving.
- `easy-lantern-dialogue`: one irrelevant turn was omitted; 9.4% API-token saving
  with full recall.
- `medium-river-revision`: obsolete dialogue was reduced while the final revision
  survived; 7.5% saving with no old/new fact confusion.
- `medium-planet-retrieval`: the intended `archive-sonora` vector match replaced
  three archive candidates; 27.8% saving and full recall.
- `medium-clockwork-trace`: repeated frames were compacted; 11.5% saving and full
  recall after the evaluation question explicitly requested exception type and
  message.
- `hard-comet-multihop`: all event records were necessary to resolve correction
  and approval, so the pipeline correctly retained them; 0% saving, full recall.
- `hard-twin-archive`: semantic retrieval selected only `bridge-hum` over two close
  distractors; 30.5% saving, full recall, and no fact contamination.
- `hard-prism-council`: two unrelated/obsolete turns were omitted while both final
  evidence messages survived; 13.9% saving and full recall.

## Every context and prompt checkpoint

Each task records these eleven checkpoints. The exact synthetic message arrays for
both variants are stored under `stages.<task>.<variant>.messages` in the JSON result.
Each mutation checkpoint also records character count, local token estimate, and a
SHA-256 identity.

1. `01-raw-context`: immutable input messages and difficulty label.
2. `02-content-routing-and-optimization`: structured/command/generic strategy and
   deterministic cleaning. The clockwork trace changed from 578 to 519 characters;
   most prose contexts correctly remained unchanged.
3. `03-semantic-retrieval`: vector search and inserted evidence. Expected and actual
   document IDs are recorded; both retrieval tasks selected the intended document.
4. `04-context-ranking`: relevance ordering and top scores. This stage observes and
   scores context but does not mutate message order by itself.
5. `05-token-budget-and-conversation-compaction`: selected messages, omitted indices,
   used budget, and maximum budget. All nine optimized variants stayed within their
   configured hard limits and retained every rubric fact before any API call.
6. `06-model-routing`: capacity/capability filtering and selected
   `deepseek-v4-flash` route with the decision reason.
7. `07-cache-aware-prompt`: stable system prefix, final message order, and prefix
   SHA-256 used for prefix-cache auditability.
8. `08-semantic-cache-probe`: a close-vector lookup had to hit and an orthogonal
   vector had to miss. Both conditions passed for every task.
9. `09-provider-request`: final prompt SHA-256, model, message count, JSON response
   mode, temperature, thinking mode, and output limit for each trial.
10. `10-provider-response`: request ID, API prompt/output tokens, cache hit/miss
    tokens, model identifier, and answer SHA-256. Answer text is not retained.
11. `11-quality-scoring`: fact recall, missing-fact list, and success result for each
    original/optimized trial.

## Initial campaign finding and correction

The first `context-v4` run was preserved rather than overwritten. It achieved 97.2%
original recall and 99.1% optimized recall, with a 12.02% prompt-token reduction.
Three original runs and one optimized run omitted `ClockworkPause` while retaining
the other stack facts.

A targeted diagnostic request showed that the model returned the exception type
when asked explicitly for “exception type and message.” The original evaluation
prompt only said “report the exception,” while its rubric required the type name.
This was a prompt/rubric mismatch, not context loss. Version 4.1 changed only that
instruction, received a new corpus ID and fingerprint, and reran all 54 requests.
It then passed 54/54 with 100% recall. Both reports remain available for audit.

## What this proves—and what it does not

The campaign provides evidence that this code version can preserve synthetic facts
while applying routing, retrieval, ranking, hard budgets, conversation compaction,
prompt-prefix preparation, provider normalization, cache metrics, and quality
scoring against DeepSeek V4 Flash.

It is not yet proof for private production traffic or every model. The embeddings
are deliberately hand-authored test vectors, local budget checkpoints use a word
counter rather than DeepSeek's unpublished exact tokenizer, model routing had one
eligible live route, and three trials are useful but not statistically broad. API
prompt token totals are exact provider-reported values. Cache hits are observational
because DeepSeek caching is automatic and the randomized request order was not
designed as a controlled cache experiment.

## Reproduction

```bash
npm run benchmark:deepseek:campaign -- --dry-run
npm run benchmark:deepseek:campaign -- --trials 3 --max-cost-usd 0.03
```

Set `DEEPSEEK_API_KEY` in ignored `.env.local`. The live runner stores answer hashes,
not answer text, and supports `--resume` with corpus fingerprint validation.
