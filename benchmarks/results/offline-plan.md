# Iritoken offline benchmark preflight

- Campaign: `offline-deepseek-v4-flash-2026-08-11T16-05-23-264Z-d00a8fe1`
- Corpus: `iritoken-evidence-v1-2026-08-11` (SHA-256 `a5970206420620b5ad23fc3f6078537719e1f58b6c1e864185cb3a8bd869fca0`)
- Requested model for the future live run: `deepseek-v4-flash`
- Planned pairs / requests: 36 / 72
- Optimizer preparations: 132
- Checks passed: 6/6
- Provider requests made: **0**
- Actual usage, output quality, and cost: **unrun**

Local token counts in this artifact are optimizer diagnostics only. They are not DeepSeek usage and cannot substantiate savings claims.

## Preflight checks

- PASS `manifest-valid`: 6 selected synthetic scenarios passed manifest validation.
- PASS `paired-plan`: 36 paired blocks, each with two arms.
- PASS `balanced-order`: Control-first and treatment-first counts differ by at most one in every scenario/comparison block.
- PASS `primary-context-only`: 36 primary pairs suppress output policy in both arms.
- PASS `required-coverage`: Every local preparation retained 100% of explicitly required units.
- PASS `no-fabricated-provider-usage`: No provider call was made and actualProviderUsage is null.

## Required questions

1. **Can Iritoken reduce total tokens by 50% without measurable quality degradation?** Unrun. This offline artifact contains no provider usage or model output.
2. **Under what workloads?** Unrun; the plan covers every selected workload but measures none.
3. **Can it reach 70%?** Unrun.
4. **Can it reach 90%?** Unrun.
5. **When does aggressive optimization hurt quality?** Unrun; optimizer retention diagnostics are not output-quality evidence.
6. **Which technique contributes the largest real-world savings?** Unrun; no API-reported usage was collected.
7. **Does optimization work better for input, output, or repeated context?** Unrun.
8. **What is the measured DeepSeek V4 Flash cost reduction?** Unrun; measured cost is unavailable.
9. **What is the quality-preserving frontier?** Unrun.
10. **What README claim is supported?** No quantitative quality-preserving reduction claim is supported by an offline preflight.
