/** Offline campaign planning and optimizer preflight. This module makes no network calls. */
import { resolve } from "node:path";
import { toPublicScenario, validateScenarioManifest } from "../scenarios/manifest.js";
import type { ConversationMessage } from "../types.js";
import {
  BENCHMARK_ROOT,
  argument,
  atomicWriteJson,
  buildPlan,
  corpusSha256,
  hasFlag,
  loadConfig,
  makeCampaignId,
  makeDesign,
  makeSelection,
  parseCsv,
  parseTargets,
  positiveInteger,
  selectComparisons,
  selectScenarios,
  writeText,
} from "./common.js";
import { prepareTurn } from "./optimizer.js";
import type { OfflinePlanArtifact, OfflinePreparationRecord, PairArm } from "./schema.js";

function offlineMarkdown(artifact: OfflinePlanArtifact): string {
  const passed = artifact.checks.filter((check) => check.passed).length;
  const answers = [
    "1. **Can Iritoken reduce total tokens by 50% without measurable quality degradation?** Unrun. This offline artifact contains no provider usage or model output.",
    "2. **Under what workloads?** Unrun; the plan covers every selected workload but measures none.",
    "3. **Can it reach 70%?** Unrun.",
    "4. **Can it reach 90%?** Unrun.",
    "5. **When does aggressive optimization hurt quality?** Unrun; optimizer retention diagnostics are not output-quality evidence.",
    "6. **Which technique contributes the largest real-world savings?** Unrun; no API-reported usage was collected.",
    "7. **Does optimization work better for input, output, or repeated context?** Unrun.",
    "8. **What is the measured DeepSeek V4 Flash cost reduction?** Unrun; measured cost is unavailable.",
    "9. **What is the quality-preserving frontier?** Unrun.",
    "10. **What README claim is supported?** No quantitative quality-preserving reduction claim is supported by an offline preflight.",
  ];
  return [
    "# Iritoken offline benchmark preflight",
    "",
    `- Campaign: \`${artifact.campaignId}\``,
    `- Corpus: \`${artifact.corpusId}\` (SHA-256 \`${artifact.corpusSha256}\`)`,
    `- Requested model for the future live run: \`${artifact.config.requestedModel}\``,
    `- Planned pairs / requests: ${artifact.plan.length} / ${artifact.plan.length * 2}`,
    `- Optimizer preparations: ${artifact.preparations.length}`,
    `- Checks passed: ${passed}/${artifact.checks.length}`,
    "- Provider requests made: **0**",
    "- Actual usage, output quality, and cost: **unrun**",
    "",
    "Local token counts in this artifact are optimizer diagnostics only. They are not DeepSeek usage and cannot substantiate savings claims.",
    "",
    "## Preflight checks",
    "",
    ...artifact.checks.map((check) => `- ${check.passed ? "PASS" : "FAIL"} \`${check.id}\`: ${check.detail}`),
    "",
    "## Required questions",
    "",
    ...answers,
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  validateScenarioManifest();
  const campaignId = argument("--campaign-id") ?? makeCampaignId("offline-deepseek-v4-flash");
  const scenarios = selectScenarios(parseCsv(argument("--scenarios")));
  const options = {
    scenarioIds: scenarios.map((scenario) => scenario.id),
    replicates: positiveInteger(argument("--replicates"), 1, "--replicates", 1_000),
    targets: parseTargets(argument("--targets")),
    includeStageOnly: hasFlag("--stage-only") || hasFlag("--all-ablations"),
    includeLeaveOneOut: hasFlag("--leave-one-out") || hasFlag("--all-ablations"),
    includeOutputPolicyExperiment: hasFlag("--output-policy") || hasFlag("--all-ablations"),
  } as const;
  const comparisons = selectComparisons(options);
  const plan = buildPlan({
    campaignId,
    scenarios,
    comparisons,
    replicates: options.replicates,
    includeOutputPolicyExperiment: options.includeOutputPolicyExperiment,
  });
  const loaded = loadConfig(argument("--config"));
  const preparations: OfflinePreparationRecord[] = [];
  for (const pair of plan) {
    const scenario = scenarios.find((candidate) => candidate.id === pair.scenarioId);
    if (!scenario) throw new Error(`planned scenario ${pair.scenarioId} is unavailable`);
    const publicScenario = toPublicScenario(scenario);
    for (const arm of pair.armOrder) {
      const ablation = arm === "control" ? pair.comparatorAblation : pair.comparisonAblation;
      const history: ConversationMessage[] = scenario.seedHistory?.map((message) => ({ ...message })) ?? [];
      for (let turnIndex = 0; turnIndex < scenario.turns.length; turnIndex += 1) {
        const prepared = await prepareTurn({
          scenario: publicScenario,
          turnIndex,
          conversationHistory: history,
          ablation,
          requireCore: false,
        });
        preparations.push({
          pairId: pair.pairId,
          replicate: pair.replicate,
          scenarioId: scenario.id,
          turnId: scenario.turns[turnIndex]?.id ?? String(turnIndex),
          comparisonAblationId: pair.comparisonAblation.id,
          experiment: pair.experiment,
          arm: arm as PairArm,
          prepared,
        });
        const turn = publicScenario.turns[turnIndex];
        if (turn) history.push({ role: "user", content: turn.instruction });
      }
    }
  }
  const primaryPairs = plan.filter((pair) => pair.estimand === "primary-context-vs-raw");
  const orderBalance = new Map<string, { control: number; treatment: number }>();
  for (const pair of plan) {
    const key = `${pair.scenarioId}:${pair.comparatorAblation.id}:${pair.comparisonAblation.id}:${pair.estimand}`;
    const value = orderBalance.get(key) ?? { control: 0, treatment: 0 };
    if (pair.pairOrder === "control-first") value.control += 1;
    else value.treatment += 1;
    orderBalance.set(key, value);
  }
  const checks = [
    { id: "manifest-valid", passed: true, detail: `${scenarios.length} selected synthetic scenarios passed manifest validation.` },
    { id: "paired-plan", passed: plan.length > 0 && plan.every((pair) => pair.armOrder.length === 2), detail: `${plan.length} paired blocks, each with two arms.` },
    { id: "balanced-order", passed: [...orderBalance.values()].every((value) => Math.abs(value.control - value.treatment) <= 1), detail: "Control-first and treatment-first counts differ by at most one in every scenario/comparison block." },
    { id: "primary-context-only", passed: primaryPairs.every((pair) => pair.comparisonAblation.treatmentScope === "context-only"), detail: `${primaryPairs.length} primary pairs suppress output policy in both arms.` },
    { id: "required-coverage", passed: preparations.every((item) => item.prepared.metrics.requiredCoverage === 1), detail: "Every local preparation retained 100% of explicitly required units." },
    { id: "no-fabricated-provider-usage", passed: true, detail: "No provider call was made and actualProviderUsage is null." },
  ];
  const warnings = [
    "Offline local token counts are estimates used to configure optimization; only live provider usage may be used as evidence.",
    "Later-turn offline preparations include prior public turn instructions but no fabricated assistant output, so they are structural checks rather than token forecasts.",
    ...(preparations.some((item) => item.prepared.adapter === "safe-fallback")
      ? ["The production optimizer was unavailable for at least one preparation; a live run will refuse this fallback."]
      : []),
  ];
  const artifact: OfflinePlanArtifact = {
    schemaVersion: 1,
    artifactKind: "offline-plan",
    campaignId,
    corpusId: "iritoken-evidence-v1-2026-08-11",
    corpusSha256: corpusSha256(scenarios),
    configSha256: loaded.sha256,
    createdAt: new Date().toISOString(),
    config: loaded.config,
    selection: makeSelection(scenarios, comparisons, options),
    design: makeDesign(campaignId),
    plan,
    preparations,
    providerRequestsMade: 0,
    actualProviderUsage: null,
    checks,
    warnings,
  };
  const outputPath = resolve(argument("--out") ?? `${BENCHMARK_ROOT}/results/offline-plan.json`);
  const markdownPath = resolve(argument("--markdown-out") ?? outputPath.replace(/\.json$/i, ".md"));
  atomicWriteJson(outputPath, artifact);
  writeText(markdownPath, offlineMarkdown(artifact));
  process.stdout.write(`Offline preflight wrote ${outputPath} and ${markdownPath}. Provider requests: 0.\n`);
  if (checks.some((check) => !check.passed)) process.exitCode = 1;
}

await main();
