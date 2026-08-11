import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ABLATION_CONFIGURATIONS,
  FULL_STACK_TARGET_CONFIGURATIONS,
  TARGET_CONFIGURATIONS,
} from "../scenarios/ablations.js";
import { SCENARIO_CORPUS_ID, SCENARIOS } from "../scenarios/manifest.js";
import type {
  AblationDefinition,
  BenchmarkScenario,
  CompressionTarget,
  DeepSeekConfigSnapshot,
} from "../types.js";
import type {
  CampaignDesign,
  CampaignSelection,
  ExperimentKind,
  PairArm,
  PairEstimand,
  PlannedPair,
} from "./schema.js";

export const BENCHMARK_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const DEFAULT_CONFIG_PATH = resolve(BENCHMARK_ROOT, "config/deepseek-v4-flash.json");

export interface SelectionOptions {
  scenarioIds?: readonly string[];
  replicates: number;
  targets: readonly CompressionTarget[];
  includeStageOnly: boolean;
  includeLeaveOneOut: boolean;
  includeOutputPolicyExperiment: boolean;
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function loadConfig(path = DEFAULT_CONFIG_PATH): { config: DeepSeekConfigSnapshot; sha256: string } {
  const raw = readFileSync(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  assertObject(parsed, "DeepSeek config");
  if (parsed.provider !== "deepseek") throw new Error("config.provider must be deepseek");
  if (typeof parsed.requestedModel !== "string" || parsed.requestedModel.length === 0) {
    throw new Error("config.requestedModel must be a non-empty string");
  }
  if (typeof parsed.baseUrl !== "string" || new URL(parsed.baseUrl).protocol !== "https:") {
    throw new Error("config.baseUrl must be an HTTPS URL");
  }
  if (typeof parsed.endpoint !== "string" || !parsed.endpoint.startsWith("/")) {
    throw new Error("config.endpoint must start with /");
  }
  const prices = parsed.pricesUsdPerMillionTokens;
  assertObject(prices, "config.pricesUsdPerMillionTokens");
  for (const field of ["inputCacheHit", "inputCacheMiss", "output"] as const) {
    if (typeof prices[field] !== "number" || !Number.isFinite(prices[field]) || prices[field] < 0) {
      throw new Error(`config price ${field} must be a non-negative finite number`);
    }
  }
  if (parsed.responseFormat !== "json_object") throw new Error("config.responseFormat must be json_object");
  if (!Number.isSafeInteger(parsed.maxOutputTokens) || (parsed.maxOutputTokens as number) < 1) {
    throw new Error("config.maxOutputTokens must be a positive safe integer");
  }
  return { config: parsed as unknown as DeepSeekConfigSnapshot, sha256: sha256(raw) };
}

export function corpusSha256(scenarios: readonly BenchmarkScenario[]): string {
  return sha256(stableJson({ corpusId: SCENARIO_CORPUS_ID, scenarios }));
}

export function parseCsv(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const values = value.split(",").map((item) => item.trim()).filter(Boolean);
  return values.length === 0 ? [] : values;
}

export function parseTargets(value: string | undefined): CompressionTarget[] {
  const raw = parseCsv(value) ?? ["25", "50", "60", "70", "80", "90"];
  const supported = new Set<number>([25, 50, 60, 70, 80, 90]);
  const targets = [...new Set(raw.map((item) => Number(item)))];
  if (targets.length === 0 || targets.some((item) => !supported.has(item))) {
    throw new Error("--targets must be a comma-separated subset of 25,50,60,70,80,90");
  }
  return targets.sort((left, right) => left - right) as CompressionTarget[];
}

export function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

export function positiveInteger(value: string | undefined, fallback: number, name: string, maximum = 10_000): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new RangeError(`${name} must be an integer from 1 to ${maximum}`);
  }
  return parsed;
}

export function positiveNumber(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new RangeError(`${name} must be a positive finite number`);
  return parsed;
}

export function selectScenarios(ids?: readonly string[]): BenchmarkScenario[] {
  if (ids === undefined) return [...SCENARIOS];
  const wanted = new Set(ids);
  const selected = SCENARIOS.filter((scenario) => wanted.has(scenario.id));
  const missing = ids.filter((id) => !selected.some((scenario) => scenario.id === id));
  if (missing.length > 0) throw new Error(`unknown scenario ids: ${missing.join(", ")}`);
  if (selected.length === 0) throw new Error("at least one scenario must be selected");
  return selected;
}

export function selectComparisons(options: SelectionOptions): AblationDefinition[] {
  const targetSet = new Set<number>(options.targets);
  const targets = TARGET_CONFIGURATIONS.filter((item) => item.target !== 0 && targetSet.has(item.target));
  if (targets.length !== targetSet.size) throw new Error("one or more requested targets are unsupported");
  const extras = ABLATION_CONFIGURATIONS.filter((item) => (
    (item.kind === "stage-only" && options.includeStageOnly)
    || (item.kind === "leave-one-out" && options.includeLeaveOneOut)
  ));
  return [...targets, ...extras];
}

function uint32(label: string): number {
  return Number.parseInt(sha256(label).slice(0, 8), 16) >>> 0;
}

function shuffled<T>(items: readonly T[], label: string): T[] {
  const output = [...items];
  let state = uint32(label);
  for (let index = output.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const target = state % (index + 1);
    [output[index], output[target]] = [output[target] as T, output[index] as T];
  }
  return output;
}

function pairOrder(
  campaignId: string,
  scenarioId: string,
  comparisonId: string,
  experiment: ExperimentKind,
  replicate: number,
): "control-first" | "treatment-first" {
  const initialControl = uint32(`${campaignId}\0${scenarioId}\0${comparisonId}\0${experiment}`) % 2 === 0;
  const controlFirst = replicate % 2 === 1 ? initialControl : !initialControl;
  return controlFirst ? "control-first" : "treatment-first";
}

function pairedDefinition(input: {
  campaignId: string;
  scenario: BenchmarkScenario;
  replicate: number;
  experiment: ExperimentKind;
  estimand: PairEstimand;
  comparatorAblation: AblationDefinition;
  comparisonAblation: AblationDefinition;
}): PlannedPair {
  const comparisonLabel = `${input.comparatorAblation.id}->${input.comparisonAblation.id}:${input.estimand}`;
  const order = pairOrder(input.campaignId, input.scenario.id, comparisonLabel, input.experiment, input.replicate);
  return {
    pairId: sha256([
      input.campaignId,
      input.scenario.id,
      input.comparatorAblation.id,
      input.comparisonAblation.id,
      input.estimand,
      input.replicate,
    ].join("\0")).slice(0, 24),
    scenarioId: input.scenario.id,
    clusterId: input.scenario.clusterId,
    category: input.scenario.category,
    replicate: input.replicate,
    experiment: input.experiment,
    estimand: input.estimand,
    pairOrder: order,
    comparatorAblation: input.comparatorAblation,
    comparisonAblation: input.comparisonAblation,
    armOrder: order === "control-first" ? ["control", "treatment"] : ["treatment", "control"],
  };
}

export function buildPlan(input: {
  campaignId: string;
  scenarios: readonly BenchmarkScenario[];
  comparisons: readonly AblationDefinition[];
  replicates: number;
  includeOutputPolicyExperiment: boolean;
}): PlannedPair[] {
  const pairs: PlannedPair[] = [];
  const baseline = TARGET_CONFIGURATIONS.find((item) => item.kind === "baseline");
  if (!baseline) throw new Error("baseline ablation definition is missing");
  const add = (
    scenario: BenchmarkScenario,
    replicate: number,
    experiment: ExperimentKind,
    estimand: PairEstimand,
    comparatorAblation: AblationDefinition,
    comparisonAblation: AblationDefinition,
  ): void => {
    pairs.push(pairedDefinition({
      campaignId: input.campaignId,
      scenario,
      replicate,
      experiment,
      estimand,
      comparatorAblation,
      comparisonAblation,
    }));
  };
  for (const scenario of input.scenarios) {
    for (let replicate = 1; replicate <= input.replicates; replicate += 1) {
      for (const comparison of input.comparisons) {
        if (comparison.kind === "all") {
          add(scenario, replicate, "context-only", "primary-context-vs-raw", baseline, comparison);
          if (input.includeOutputPolicyExperiment) {
            const fullStack = FULL_STACK_TARGET_CONFIGURATIONS.find((item) => item.target === comparison.target);
            if (!fullStack) throw new Error(`full-stack target ${comparison.target} is missing`);
            add(scenario, replicate, "full-stack", "secondary-full-stack-vs-raw", baseline, fullStack);
            add(scenario, replicate, "output-policy", "output-policy-increment", comparison, fullStack);
          }
        } else if (comparison.kind === "stage-only") {
          add(
            scenario,
            replicate,
            comparison.treatmentScope === "full-stack" ? "output-policy" : "ablation",
            "stage-only-vs-raw",
            baseline,
            comparison,
          );
        } else if (comparison.kind === "leave-one-out") {
          const fullStack = FULL_STACK_TARGET_CONFIGURATIONS.find((item) => item.target === comparison.target);
          if (!fullStack) throw new Error(`full-stack parent for ${comparison.id} is missing`);
          add(scenario, replicate, "ablation", "leave-one-out-vs-full-stack", fullStack, comparison);
        }
      }
    }
  }
  return shuffled(pairs, `${input.campaignId}\0pair-block-order`);
}

export function makeCampaignId(prefix = "deepseek-v4-flash"): string {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
}

export function makeSelection(
  scenarios: readonly BenchmarkScenario[],
  comparisons: readonly AblationDefinition[],
  options: SelectionOptions,
): CampaignSelection {
  const treatmentIds = new Set(comparisons.map((item) => item.id));
  if (options.includeOutputPolicyExperiment) {
    for (const target of options.targets) {
      const fullStack = FULL_STACK_TARGET_CONFIGURATIONS.find((item) => item.target === target);
      if (fullStack) treatmentIds.add(fullStack.id);
    }
  }
  if (options.includeLeaveOneOut) {
    const parent = FULL_STACK_TARGET_CONFIGURATIONS.find((item) => item.target === 50);
    if (parent) treatmentIds.add(parent.id);
  }
  return {
    scenarioIds: scenarios.map((scenario) => scenario.id),
    replicates: options.replicates,
    targetAblationIds: comparisons.map((item) => item.id),
    plannedTreatmentAblationIds: [...treatmentIds].sort(),
    includeStageOnly: options.includeStageOnly,
    includeLeaveOneOut: options.includeLeaveOneOut,
    includeOutputPolicyExperiment: options.includeOutputPolicyExperiment,
  };
}

export function makeDesign(campaignId: string): CampaignDesign {
  return {
    syntheticDataOnly: true,
    paired: true,
    pairUnit: "scenario-session-replicate",
    turnAggregation: "sum-within-scenario-session",
    randomizedPairBlocks: true,
    balancedWithinPairOrder: true,
    providerSeedParameterSent: false,
    providerDeterminismClaimed: false,
    contextOnlyPolicy: "identical-system-model-and-generation-parameters; output policy suppressed in both arms",
    outputPolicyIsolation: "identical prepared context in both arms; only the explicit output policy differs",
    providerCacheCondition: "natural-provider-cache; paired order balanced; cache-hit and cache-miss tokens reported separately",
    orderKeySha256: sha256(`${campaignId}\0pair-block-order`),
  };
}

export function planKey(pair: PlannedPair, arm: PairArm): string {
  return `${pair.pairId}:${arm}`;
}

export function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

export function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
}
