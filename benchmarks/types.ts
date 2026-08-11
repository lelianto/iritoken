export const COMPRESSION_TARGETS = [0, 25, 50, 60, 70, 80, 90] as const;
export type CompressionTarget = typeof COMPRESSION_TARGETS[number];

export const OPTIMIZATION_STAGES = [
  "normalization",
  "deduplication",
  "structuredCompaction",
  "relevanceFiltering",
  "historyCompression",
  "dependencySelection",
  "targetReduction",
  "outputOptimization",
] as const;
export type OptimizationStage = typeof OPTIMIZATION_STAGES[number];

export type ScenarioCategory =
  | "simple-coding"
  | "medium-coding"
  | "large-noisy-repository"
  | "repeated-agent-session"
  | "long-conversation"
  | "dense-adversarial-context";

export type ContextKind =
  | "requirement"
  | "source"
  | "type-definition"
  | "test"
  | "configuration"
  | "documentation"
  | "terminal-output"
  | "history"
  | "noise";

export type ContextImportance = "must_keep" | "important" | "compressible" | "optional";

export interface PublicContextBlock {
  id: string;
  kind: ContextKind;
  content: string;
  importance: ContextImportance;
  required?: boolean;
  referenced?: boolean;
  path?: string;
  language?: string;
  command?: string;
  dependencies?: readonly string[];
}

export interface ConversationMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

export interface HiddenFact {
  id: string;
  alternatives: readonly string[];
  critical?: boolean;
}

export interface HiddenAcceptanceCheck {
  id: string;
  description: string;
  target: "answer" | "patch" | "evidence" | "combined";
  kind: "contains" | "regex";
  value: string;
  flags?: string;
  critical?: boolean;
}

export interface HiddenCodeShape {
  requiredPatterns?: readonly string[];
  forbiddenPatterns?: readonly string[];
  minimumPatchLines?: number;
  maximumPatchLines?: number;
}

export interface HiddenRubric {
  facts: readonly HiddenFact[];
  forbiddenFacts?: readonly HiddenFact[];
  acceptance: readonly HiddenAcceptanceCheck[];
  codeShape?: HiddenCodeShape;
}

export interface ScenarioTurn {
  id: string;
  instruction: string;
  rubric: HiddenRubric;
}

export interface BenchmarkScenario {
  id: string;
  clusterId: string;
  category: ScenarioCategory;
  title: string;
  description: string;
  systemInstruction: string;
  context: readonly PublicContextBlock[];
  seedHistory?: readonly ConversationMessage[];
  turns: readonly ScenarioTurn[];
}

/** The only scenario view permitted to cross the optimizer boundary. */
export type PublicScenario = Omit<BenchmarkScenario, "turns"> & {
  turns: readonly Omit<ScenarioTurn, "rubric">[];
};

export interface AblationDefinition {
  id: string;
  kind: "baseline" | "all" | "stage-only" | "leave-one-out";
  treatmentScope: "raw" | "context-only" | "full-stack";
  primaryComparison: boolean;
  target: CompressionTarget;
  enabledStages: readonly OptimizationStage[];
  description: string;
}

export interface OptimizerMetrics {
  originalTokens: number;
  optimizedTokens: number;
  tokensRemoved: number;
  reductionPercentage: number;
  targetReductionPercentage: number;
  targetTokens: number;
  targetAchievable: boolean;
  requiredTokens: number;
  /** Fraction in [0, 1], normalized from the core's percentage object. */
  requiredCoverage: number;
  verifiedRemovedTokens: number;
  /** Percentage in [0, 100], matching the core evidence ledger. */
  verifiedRemovedTokenShare: number;
  /** Explicit safety warnings; never converted into a fabricated probability. */
  riskReasons: readonly string[];
  localEstimateOnly: true;
}

export interface PreparedTurn {
  messages: readonly { role: string; content: string }[];
  omittedUnitIds: readonly string[];
  metrics: OptimizerMetrics;
  ledger: readonly unknown[];
  stages: readonly unknown[];
  adapter: "iritoken-core" | "safe-fallback" | "baseline";
}

export interface ParsedModelResponse {
  validJson: boolean;
  answer: string;
  patch: string;
  evidence: string[];
  parseError?: string;
}

export interface AcceptanceCheckResult {
  id: string;
  passed: boolean;
  critical: boolean;
  description: string;
}

export interface TurnQualityScore {
  validJson: boolean;
  factsFound: number;
  factsRequired: number;
  factCoverage: number;
  criticalFactsFound: number;
  criticalFactsRequired: number;
  criticalCoverage: number;
  forbiddenFactsFound: string[];
  acceptancePassed: number;
  acceptanceRequired: number;
  acceptanceCoverage: number;
  codeShapePassed: boolean;
  /** Static TypeScript parse/transpile check only; no model code is executed. */
  syntaxChecked: boolean;
  syntaxValid: boolean;
  syntaxDiagnostics: string[];
  taskSuccess: boolean;
  checks: AcceptanceCheckResult[];
  codeShapeFailures: string[];
}

export interface ProviderUsageRecord {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
}

export type RunStatus = "completed" | "provider-error" | "invalid-usage" | "cost-cap-not-run";

export interface TurnRunRecord {
  turnId: string;
  status: RunStatus;
  requestId: string | null;
  returnedModel: string | null;
  systemFingerprint: string | null;
  usage: ProviderUsageRecord;
  estimatedCostUsd: number;
  outputSha256: string | null;
  rawArtifact: string | null;
  error: string | null;
  parsed: Omit<ParsedModelResponse, "answer" | "patch" | "evidence"> | null;
  quality: TurnQualityScore | null;
  optimizer: PreparedTurn;
}

export interface ScenarioRunRecord {
  campaignId: string;
  scenarioId: string;
  clusterId: string;
  category: ScenarioCategory;
  replicate: number;
  orderPosition: number;
  ablation: AblationDefinition;
  requestedModel: string;
  configSha256: string;
  startedAt: string;
  completedAt: string;
  status: RunStatus;
  turns: TurnRunRecord[];
  totals: ProviderUsageRecord & {
    estimatedCostUsd: number;
    successfulTurns: number;
    totalTurns: number;
    taskSuccessRate: number;
    meanFactCoverage: number;
    meanAcceptanceCoverage: number;
  };
}

export interface DeepSeekConfigSnapshot {
  schemaVersion: number;
  asOf: string;
  provider: "deepseek";
  requestedModel: string;
  modelVersionLabel: string;
  baseUrl: string;
  endpoint: string;
  thinking: boolean;
  temperature: number;
  maxOutputTokens: number;
  responseFormat: "json_object";
  contextLengthTokens: number;
  maximumOutputTokensDocumented: number;
  pricesUsdPerMillionTokens: {
    inputCacheHit: number;
    inputCacheMiss: number;
    output: number;
  };
  sources: readonly { kind: string; url: string; supports: readonly string[] }[];
  caveats: readonly string[];
}

export interface NumericSummary {
  count: number;
  mean: number | null;
  median: number | null;
  standardDeviation: number | null;
  minimum: number | null;
  maximum: number | null;
  ci95: readonly [number, number] | null;
}

export type FrontierClassification = "green-noninferior" | "gray-inconclusive" | "red-material-harm" | "unrun";

export interface PairedTargetSummary {
  category: ScenarioCategory | "overall";
  ablationId: string;
  target: CompressionTarget;
  independentClusters: number;
  pairedRuns: number;
  totalTokenReduction: number | null;
  totalTokenReductionCi95: readonly [number, number] | null;
  inputReduction: number | null;
  outputReduction: number | null;
  costReduction: number | null;
  qualityDifference: NumericSummary;
  noninferiorityMargin: number;
  classification: FrontierClassification;
}
