import { createHash } from "node:crypto";
import type {
  FrontierClassification,
  NumericSummary,
  PairedTargetSummary,
  ProviderUsageRecord,
  ScenarioCategory,
} from "../types.js";
import type {
  BenchmarkScenarioRunRecord,
  ExperimentKind,
  LiveCampaignArtifact,
} from "../runners/schema.js";

export const DEFAULT_BOOTSTRAP_ITERATIONS = 20_000;
export const DEFAULT_NONINFERIORITY_MARGIN = 0.02;

export interface AnalysisOptions {
  bootstrapIterations?: number;
  noninferiorityMargin?: number;
  minimumIndependentClusters?: number;
  minimumPairedRuns?: number;
  analysisKey?: string;
}

export interface DetailedPairedTargetSummary extends PairedTargetSummary {
  experiment: ExperimentKind;
  estimand: BenchmarkScenarioRunRecord["estimand"];
  treatmentScope: string;
  validUsagePairs: number;
  failedControlRuns: number;
  failedTreatmentRuns: number;
  inputReductionCi95: readonly [number, number] | null;
  outputReductionCi95: readonly [number, number] | null;
  costReductionCi95: readonly [number, number] | null;
  pairedInputReductions: NumericSummary;
  pairedOutputReductions: NumericSummary;
  pairedTotalTokenReductions: NumericSummary;
  pairedCostReductions: NumericSummary;
  baselineQuality: NumericSummary;
  treatmentQuality: NumericSummary;
  optimizerRequestedReductionPercentage: number;
  optimizerActualReductionPercentage: NumericSummary;
  actualMinusRequestedPercentagePoints: NumericSummary;
  targetAchievedLocallyShare: number | null;
  underpowered: boolean;
  inconclusiveReasons: string[];
}

export interface WorkloadFrontier {
  category: ScenarioCategory | "overall";
  classification: "established" | "inconclusive" | "unrun";
  ablationId: string | null;
  requestedTarget: number | null;
  measuredTotalTokenReduction: number | null;
  measuredTotalTokenReductionCi95: readonly [number, number] | null;
  reason: string;
}

export interface BenchmarkAnalysis {
  schemaVersion: 1;
  artifactKind: "paired-analysis";
  campaignId: string;
  generatedAt: string;
  sourceArtifactKind: LiveCampaignArtifact["artifactKind"];
  bootstrap: {
    method: "deterministic-percentile-cluster-bootstrap";
    cluster: "scenario-cluster; turns summed within session; replicates retained within cluster";
    iterations: number;
    analysisKeySha256: string;
    providerSeedClaim: false;
  };
  noninferiority: {
    primaryOutcome: "paired scenario-session task success rate difference (treatment minus control)";
    margin: number;
    minimumIndependentClusters: number;
    minimumPairedRuns: number;
    zeroEventRuleMinimumPairs: number;
  };
  summaries: DetailedPairedTargetSummary[];
  frontiers: WorkloadFrontier[];
  limitations: string[];
}

interface PairObservation {
  pairId: string;
  clusterId: string;
  category: ScenarioCategory;
  control: BenchmarkScenarioRunRecord;
  treatment: BenchmarkScenarioRunRecord;
  qualityDifference: number;
  controlQuality: number;
  treatmentQuality: number;
  optimizerActualReductionPercentage: number;
  optimizerTargetAchieved: boolean;
}

interface UsagePair extends PairObservation {
  controlUsage: ProviderUsageRecord & { estimatedCostUsd: number };
  treatmentUsage: ProviderUsageRecord & { estimatedCostUsd: number };
}

function finite(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function quantile(sorted: readonly number[], probability: number): number | null {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const left = sorted[lower];
  const right = sorted[upper];
  if (left === undefined || right === undefined) return null;
  return left + (right - left) * (position - lower);
}

function sampleStandardDeviation(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return 0;
  const average = mean(values);
  if (average === null) return null;
  const sumSquares = values.reduce((total, value) => total + (value - average) ** 2, 0);
  return Math.sqrt(sumSquares / (values.length - 1));
}

class DeterministicRandom {
  private state: number;

  constructor(label: string) {
    this.state = Number.parseInt(createHash("sha256").update(label).digest("hex").slice(0, 8), 16) >>> 0;
  }

  nextIndex(length: number): number {
    if (length < 1) throw new RangeError("cannot sample an empty collection");
    this.state = (Math.imul(this.state, 1_664_525) + 1_013_904_223) >>> 0;
    return this.state % length;
  }
}

function clusterMap<T extends { clusterId: string }>(values: readonly T[]): Map<string, T[]> {
  const clusters = new Map<string, T[]>();
  for (const value of values) {
    const bucket = clusters.get(value.clusterId) ?? [];
    bucket.push(value);
    clusters.set(value.clusterId, bucket);
  }
  return clusters;
}

function percentileInterval(values: number[]): readonly [number, number] | null {
  if (values.length === 0) return null;
  values.sort((left, right) => left - right);
  const low = quantile(values, 0.025);
  const high = quantile(values, 0.975);
  return low === null || high === null ? null : [low, high];
}

function bootstrapClusters<T extends { clusterId: string }>(
  values: readonly T[],
  iterations: number,
  label: string,
  statistic: (sample: readonly T[]) => number | null,
): readonly [number, number] | null {
  const clusters = clusterMap(values);
  const ids = [...clusters.keys()].sort();
  if (ids.length < 2) return null;
  const random = new DeterministicRandom(label);
  const results: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample: T[] = [];
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[random.nextIndex(ids.length)];
      if (id !== undefined) sample.push(...(clusters.get(id) ?? []));
    }
    const value = statistic(sample);
    if (value !== null && Number.isFinite(value)) results.push(value);
  }
  return percentileInterval(results);
}

function numericSummary(
  valuesInput: readonly number[],
  observations: readonly { clusterId: string; value: number }[],
  iterations: number,
  label: string,
): NumericSummary {
  const values = finite(valuesInput).sort((left, right) => left - right);
  const ci95 = bootstrapClusters(observations, iterations, label, (sample) => mean(sample.map((item) => item.value)));
  return {
    count: values.length,
    mean: mean(values),
    median: quantile(values, 0.5),
    standardDeviation: sampleStandardDeviation(values),
    minimum: values[0] ?? null,
    maximum: values[values.length - 1] ?? null,
    ci95,
  };
}

function reduction(control: number, treatment: number): number | null {
  if (!Number.isFinite(control) || !Number.isFinite(treatment) || control <= 0) return null;
  return 1 - treatment / control;
}

function ratioOfSums(
  values: readonly UsagePair[],
  field: "inputTokens" | "outputTokens" | "totalTokens" | "estimatedCostUsd",
): number | null {
  const control = values.reduce((total, item) => total + item.controlUsage[field], 0);
  const treatment = values.reduce((total, item) => total + item.treatmentUsage[field], 0);
  return reduction(control, treatment);
}

function zeroEventRuleMinimumPairs(margin: number): number {
  // With no observed loss events, n >= log(.05)/log(1-margin) is required
  // before a one-sided 95% bound can exclude a loss rate equal to the margin.
  return Math.ceil(Math.log(0.05) / Math.log(1 - margin));
}

function pairRuns(runs: readonly BenchmarkScenarioRunRecord[]): PairObservation[] {
  const grouped = new Map<string, BenchmarkScenarioRunRecord[]>();
  for (const run of runs) {
    const bucket = grouped.get(run.pairId) ?? [];
    bucket.push(run);
    grouped.set(run.pairId, bucket);
  }
  const pairs: PairObservation[] = [];
  for (const [pairId, records] of grouped) {
    const control = records.find((run) => run.arm === "control");
    const treatment = records.find((run) => run.arm === "treatment");
    if (!control || !treatment) continue;
    const turnReductions = treatment.turns.map((turn) => turn.optimizer.metrics.reductionPercentage);
    pairs.push({
      pairId,
      clusterId: control.clusterId,
      category: control.category,
      control,
      treatment,
      controlQuality: control.totals.taskSuccessRate,
      treatmentQuality: treatment.totals.taskSuccessRate,
      qualityDifference: treatment.totals.taskSuccessRate - control.totals.taskSuccessRate,
      optimizerActualReductionPercentage: mean(turnReductions) ?? 0,
      optimizerTargetAchieved: treatment.turns.every((turn) => turn.optimizer.metrics.targetAchievable),
    });
  }
  return pairs;
}

function isValidUsagePair(pair: PairObservation): pair is UsagePair {
  return pair.control.status === "completed"
    && pair.treatment.status === "completed"
    && pair.control.totals.totalTokens > 0
    && pair.treatment.totals.totalTokens > 0;
}

function categories(): Array<ScenarioCategory | "overall"> {
  return [
    "overall",
    "simple-coding",
    "medium-coding",
    "large-noisy-repository",
    "repeated-agent-session",
    "long-conversation",
    "dense-adversarial-context",
  ];
}

function summarizeGroup(input: {
  pairs: readonly PairObservation[];
  category: ScenarioCategory | "overall";
  iterations: number;
  margin: number;
  minimumClusters: number;
  minimumPairs: number;
  label: string;
}): DetailedPairedTargetSummary | null {
  const pairs = input.category === "overall" ? [...input.pairs] : input.pairs.filter((pair) => pair.category === input.category);
  if (pairs.length === 0) return null;
  const representative = pairs[0]?.treatment;
  if (!representative) return null;
  const usagePairs = pairs.filter(isValidUsagePair);
  const qualityObservations = pairs.map((pair) => ({ clusterId: pair.clusterId, value: pair.qualityDifference }));
  const baselineObservations = pairs.map((pair) => ({ clusterId: pair.clusterId, value: pair.controlQuality }));
  const treatmentObservations = pairs.map((pair) => ({ clusterId: pair.clusterId, value: pair.treatmentQuality }));
  const optimizerObservations = pairs.map((pair) => ({ clusterId: pair.clusterId, value: pair.optimizerActualReductionPercentage }));
  const gapObservations = optimizerObservations.map((item) => ({
    ...item,
    value: item.value - representative.comparisonAblation.target,
  }));
  const qualityDifference = numericSummary(
    pairs.map((pair) => pair.qualityDifference),
    qualityObservations,
    input.iterations,
    `${input.label}:quality`,
  );
  const totalTokenReduction = ratioOfSums(usagePairs, "totalTokens");
  const inputReduction = ratioOfSums(usagePairs, "inputTokens");
  const outputReduction = ratioOfSums(usagePairs, "outputTokens");
  const costReduction = ratioOfSums(usagePairs, "estimatedCostUsd");
  const perPairSummary = (field: "inputTokens" | "outputTokens" | "totalTokens" | "estimatedCostUsd", label: string): NumericSummary => {
    const observations = usagePairs.flatMap((pair) => {
      const value = reduction(pair.controlUsage[field], pair.treatmentUsage[field]);
      return value === null ? [] : [{ clusterId: pair.clusterId, value }];
    });
    return numericSummary(
      observations.map((item) => item.value),
      observations,
      input.iterations,
      `${input.label}:per-pair-${label}`,
    );
  };
  const bootstrapRatio = (field: "inputTokens" | "outputTokens" | "totalTokens" | "estimatedCostUsd"): readonly [number, number] | null => (
    bootstrapClusters(usagePairs, input.iterations, `${input.label}:${field}`, (sample) => ratioOfSums(sample, field))
  );
  const independentClusters = new Set(pairs.map((pair) => pair.clusterId)).size;
  const reasons: string[] = [];
  const zeroEventMinimum = zeroEventRuleMinimumPairs(input.margin);
  if (independentClusters < input.minimumClusters) reasons.push(`only ${independentClusters} independent clusters; minimum is ${input.minimumClusters}`);
  if (pairs.length < input.minimumPairs) reasons.push(`only ${pairs.length} paired sessions; configured minimum is ${input.minimumPairs}`);
  if (independentClusters < zeroEventMinimum) reasons.push(`only ${independentClusters} independent clusters; ${zeroEventMinimum} are required by the one-sided 95% zero-event guard for a ${(input.margin * 100).toFixed(1)}% margin`);
  if (usagePairs.length !== pairs.length) reasons.push(`${pairs.length - usagePairs.length} paired sessions lack valid usage in one or both arms`);
  if (qualityDifference.ci95 === null) reasons.push("cluster-bootstrap quality interval is unavailable");
  if (totalTokenReduction === null) reasons.push("authoritative paired token usage is unavailable");
  const lower = qualityDifference.ci95?.[0];
  const upper = qualityDifference.ci95?.[1];
  let classification: FrontierClassification;
  if (pairs.length === 0) classification = "unrun";
  else if (reasons.length > 0 || lower === undefined || upper === undefined) classification = "gray-inconclusive";
  else if (lower >= -input.margin) classification = "green-noninferior";
  else if (upper < -input.margin) classification = "red-material-harm";
  else classification = "gray-inconclusive";
  return {
    category: input.category,
    ablationId: representative.comparisonAblation.id,
    target: representative.comparisonAblation.target,
    experiment: representative.experiment,
    estimand: representative.estimand,
    treatmentScope: representative.comparisonAblation.treatmentScope,
    independentClusters,
    pairedRuns: pairs.length,
    validUsagePairs: usagePairs.length,
    failedControlRuns: pairs.filter((pair) => pair.control.status !== "completed").length,
    failedTreatmentRuns: pairs.filter((pair) => pair.treatment.status !== "completed").length,
    totalTokenReduction,
    totalTokenReductionCi95: bootstrapRatio("totalTokens"),
    inputReduction,
    inputReductionCi95: bootstrapRatio("inputTokens"),
    outputReduction,
    outputReductionCi95: bootstrapRatio("outputTokens"),
    costReduction,
    costReductionCi95: bootstrapRatio("estimatedCostUsd"),
    pairedInputReductions: perPairSummary("inputTokens", "input"),
    pairedOutputReductions: perPairSummary("outputTokens", "output"),
    pairedTotalTokenReductions: perPairSummary("totalTokens", "total"),
    pairedCostReductions: perPairSummary("estimatedCostUsd", "cost"),
    qualityDifference,
    baselineQuality: numericSummary(pairs.map((pair) => pair.controlQuality), baselineObservations, input.iterations, `${input.label}:baseline-quality`),
    treatmentQuality: numericSummary(pairs.map((pair) => pair.treatmentQuality), treatmentObservations, input.iterations, `${input.label}:treatment-quality`),
    optimizerRequestedReductionPercentage: representative.comparisonAblation.target,
    optimizerActualReductionPercentage: numericSummary(
      pairs.map((pair) => pair.optimizerActualReductionPercentage),
      optimizerObservations,
      input.iterations,
      `${input.label}:optimizer-actual`,
    ),
    actualMinusRequestedPercentagePoints: numericSummary(
      gapObservations.map((item) => item.value),
      gapObservations,
      input.iterations,
      `${input.label}:optimizer-gap`,
    ),
    targetAchievedLocallyShare: mean(pairs.map((pair) => pair.optimizerTargetAchieved ? 1 : 0)),
    noninferiorityMargin: input.margin,
    classification,
    underpowered: reasons.length > 0,
    inconclusiveReasons: reasons,
  };
}

function deriveFrontiers(summaries: readonly DetailedPairedTargetSummary[]): WorkloadFrontier[] {
  return categories().map((category) => {
    const primary = summaries.filter((summary) => (
      summary.category === category
      && summary.estimand === "primary-context-vs-raw"
      && summary.treatmentScope === "context-only"
      && summary.ablationId.startsWith("context-only-target-")
    )).sort((left, right) => left.target - right.target);
    if (primary.length === 0) {
      return { category, classification: "unrun", ablationId: null, requestedTarget: null, measuredTotalTokenReduction: null, measuredTotalTokenReductionCi95: null, reason: "No primary live paired target was completed." };
    }
    let best: DetailedPairedTargetSummary | undefined;
    for (const summary of primary) {
      if (summary.classification !== "green-noninferior" || summary.totalTokenReduction === null) break;
      best = summary;
    }
    if (!best) {
      return { category, classification: "inconclusive", ablationId: null, requestedTarget: null, measuredTotalTokenReduction: null, measuredTotalTokenReductionCi95: null, reason: "No target has statistically passed the pre-specified noninferiority and power guards." };
    }
    return {
      category,
      classification: "established",
      ablationId: best.ablationId,
      requestedTarget: best.target,
      measuredTotalTokenReduction: best.totalTokenReduction,
      measuredTotalTokenReductionCi95: best.totalTokenReductionCi95,
      reason: "Highest requested primary level whose own and every less-aggressive requested level passed noninferiority.",
    };
  });
}

export function analyzeCampaign(campaign: LiveCampaignArtifact, options: AnalysisOptions = {}): BenchmarkAnalysis {
  const iterations = options.bootstrapIterations ?? DEFAULT_BOOTSTRAP_ITERATIONS;
  if (!Number.isSafeInteger(iterations) || iterations < 10_000) throw new RangeError("bootstrapIterations must be an integer of at least 10,000");
  const margin = options.noninferiorityMargin ?? DEFAULT_NONINFERIORITY_MARGIN;
  if (!Number.isFinite(margin) || margin <= 0 || margin >= 1) throw new RangeError("noninferiorityMargin must be between 0 and 1");
  const minimumClusters = options.minimumIndependentClusters ?? 6;
  const configuredMinimumPairs = options.minimumPairedRuns ?? 12;
  const analysisKey = options.analysisKey ?? `${campaign.campaignId}\0paired-analysis-v1`;
  const allPairs = pairRuns(campaign.runs);
  const strata = new Map<string, PairObservation[]>();
  for (const pair of allPairs) {
    const key = `${pair.treatment.estimand}\0${pair.treatment.comparatorAblation.id}\0${pair.treatment.comparisonAblation.id}`;
    const bucket = strata.get(key) ?? [];
    bucket.push(pair);
    strata.set(key, bucket);
  }
  const summaries: DetailedPairedTargetSummary[] = [];
  for (const [stratum, pairs] of [...strata.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    for (const category of categories()) {
      const summary = summarizeGroup({
        pairs,
        category,
        iterations,
        margin,
        minimumClusters,
        minimumPairs: configuredMinimumPairs,
        label: `${analysisKey}:${stratum}:${category}`,
      });
      if (summary) summaries.push(summary);
    }
  }
  return {
    schemaVersion: 1,
    artifactKind: "paired-analysis",
    campaignId: campaign.campaignId,
    generatedAt: new Date().toISOString(),
    sourceArtifactKind: campaign.artifactKind,
    bootstrap: {
      method: "deterministic-percentile-cluster-bootstrap",
      cluster: "scenario-cluster; turns summed within session; replicates retained within cluster",
      iterations,
      analysisKeySha256: createHash("sha256").update(analysisKey).digest("hex"),
      providerSeedClaim: false,
    },
    noninferiority: {
      primaryOutcome: "paired scenario-session task success rate difference (treatment minus control)",
      margin,
      minimumIndependentClusters: minimumClusters,
      minimumPairedRuns: configuredMinimumPairs,
      zeroEventRuleMinimumPairs: zeroEventRuleMinimumPairs(margin),
    },
    summaries,
    frontiers: deriveFrontiers(summaries),
    limitations: [
      "Local optimizer token counts configure treatments only; provider-reported usage is authoritative for token and cost comparisons.",
      "Each scenario cluster is resampled as a unit, and all turns are summed before pairing; individual turns are not treated as independent observations.",
      "Replicates characterize provider variability on this fixed synthetic corpus but do not add new workload clusters.",
      "A green classification is not emitted until sample-size, cluster-count, valid-usage, and one-sided zero-event power guards all pass.",
      "Temperature zero is not claimed to make provider responses deterministic, and no provider seed parameter is sent.",
    ],
  };
}
