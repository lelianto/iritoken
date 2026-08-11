import { createHash } from "node:crypto";
import { SCENARIO_CORPUS_ID, SCENARIOS, toPublicScenario, validateScenarioManifest } from "../scenarios/manifest.js";
import type { ScenarioCategory } from "../types.js";

export const DATASET_POLICY = {
  dataKind: "realistic-synthetic" as const,
  hiddenRubricsCrossOptimizerBoundary: false,
  splitUnit: "clusterId" as const,
  intendedUse: "framework validation and exploratory live evidence; not a production-generalization claim",
  statisticalPower: "Six independent synthetic clusters are deliberately underpowered; confidence intervals must be reported as exploratory, never as proof of a tight noninferiority margin.",
  codeEvaluationScope: "Code is checked only for JSON/schema, rubric patterns, and static TypeScript parse/transpile diagnostics. Model code is never executed, so success is not functional unit-test proof.",
  antiGaming: [
    "Rubrics are removed before optimizer invocation and prompt construction.",
    "Context includes unfavorable dense cases and plausible noise rather than padding solely for token savings.",
    "Loss of required facts is scored as failure; it is never used as a pre-provider oracle abort.",
    "Repository/session clusters, rather than turns, are the independent resampling unit.",
  ] as const,
};

export function corpusFingerprint(): string {
  validateScenarioManifest();
  const hash = createHash("sha256").update(SCENARIO_CORPUS_ID);
  for (const scenario of SCENARIOS) hash.update("\0").update(JSON.stringify(scenario));
  return hash.digest("hex");
}

export function publicCorpusFingerprint(): string {
  validateScenarioManifest();
  const hash = createHash("sha256").update(SCENARIO_CORPUS_ID).update("\0public");
  for (const scenario of SCENARIOS) hash.update("\0").update(JSON.stringify(toPublicScenario(scenario)));
  return hash.digest("hex");
}

export function categoryCounts(): Record<ScenarioCategory, number> {
  const counts: Record<ScenarioCategory, number> = {
    "simple-coding": 0,
    "medium-coding": 0,
    "large-noisy-repository": 0,
    "repeated-agent-session": 0,
    "long-conversation": 0,
    "dense-adversarial-context": 0,
  };
  for (const scenario of SCENARIOS) counts[scenario.category] += 1;
  return counts;
}

export const DATASET_CATALOG = {
  corpusId: SCENARIO_CORPUS_ID,
  scenarioCount: SCENARIOS.length,
  clusterCount: new Set(SCENARIOS.map((scenario) => scenario.clusterId)).size,
  categories: categoryCounts(),
  multiTurnScenarioIds: SCENARIOS.filter((scenario) => scenario.turns.length > 1).map((scenario) => scenario.id),
  policy: DATASET_POLICY,
};
