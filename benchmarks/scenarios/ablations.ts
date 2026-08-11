import {
  COMPRESSION_TARGETS,
  OPTIMIZATION_STAGES,
  type AblationDefinition,
  type CompressionTarget,
} from "../types.js";

const CONTEXT_STAGES = OPTIMIZATION_STAGES.filter((stage) => stage !== "outputOptimization");

export const TARGET_CONFIGURATIONS: readonly AblationDefinition[] = COMPRESSION_TARGETS.map((target) => ({
  id: target === 0 ? "baseline-0" : `context-only-target-${target}`,
  kind: target === 0 ? "baseline" : "all",
  treatmentScope: target === 0 ? "raw" : "context-only",
  primaryComparison: true,
  target,
  enabledStages: target === 0 ? [] : [...CONTEXT_STAGES],
  description: target === 0
    ? "Raw control; the optimizer is not invoked."
    : `Primary context-only treatment at a requested ${target}% reduction. Output policy and provider output settings remain identical to control.`,
}));

export const FULL_STACK_TARGET_CONFIGURATIONS: readonly AblationDefinition[] = COMPRESSION_TARGETS
  .filter((target) => target !== 0)
  .map((target) => ({
    id: `full-stack-target-${target}`,
    kind: "all",
    treatmentScope: "full-stack",
    primaryComparison: false,
    target,
    enabledStages: [...OPTIMIZATION_STAGES],
    description: `Secondary full-stack treatment at a requested ${target}% reduction; outputOptimization may change the prompt-side output policy.`,
  }));

export function stageOnlyAblations(target: CompressionTarget = 50): AblationDefinition[] {
  if (target === 0) throw new RangeError("stage-only ablations require a non-zero target");
  return OPTIMIZATION_STAGES.map((stage) => ({
    id: `only-${stage}-target-${target}`,
    kind: "stage-only",
    treatmentScope: stage === "outputOptimization" ? "full-stack" : "context-only",
    primaryComparison: false,
    target,
    enabledStages: [stage],
    description: `Only ${stage} is enabled at a requested ${target}% reduction.`,
  }));
}

export function leaveOneOutAblations(target: CompressionTarget = 50): AblationDefinition[] {
  if (target === 0) throw new RangeError("leave-one-out ablations require a non-zero target");
  return OPTIMIZATION_STAGES.map((stage) => ({
    id: `all-minus-${stage}-target-${target}`,
    kind: "leave-one-out",
    treatmentScope: stage === "outputOptimization" ? "context-only" : "full-stack",
    primaryComparison: false,
    target,
    enabledStages: OPTIMIZATION_STAGES.filter((candidate) => candidate !== stage),
    description: `All stages except ${stage} are enabled at a requested ${target}% reduction.`,
  }));
}

export const ABLATION_CONFIGURATIONS: readonly AblationDefinition[] = [
  ...stageOnlyAblations(50),
  ...leaveOneOutAblations(50),
];
