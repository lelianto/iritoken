import type {
  AblationDefinition,
  DeepSeekConfigSnapshot,
  PreparedTurn,
  ProviderUsageRecord,
  ScenarioCategory,
  ScenarioRunRecord,
  TurnRunRecord,
} from "../types.js";

export type ExperimentKind = "context-only" | "full-stack" | "output-policy" | "ablation";
export type PairEstimand =
  | "primary-context-vs-raw"
  | "secondary-full-stack-vs-raw"
  | "output-policy-increment"
  | "stage-only-vs-raw"
  | "leave-one-out-vs-full-stack";
export type PairArm = "control" | "treatment";
export type PairOrder = "control-first" | "treatment-first";

export interface ProviderAttemptRecord {
  attempt: number;
  startedAt: string;
  completedAt: string;
  httpStatus: number | null;
  retryable: boolean;
  retryDelayMilliseconds: number | null;
  requestId: string | null;
  returnedModel: string | null;
  systemFingerprint: string | null;
  usage: ProviderUsageRecord | null;
  error: string | null;
  /** Conservative cap charge retained when authoritative usage is unavailable. */
  costCapChargeUsd: number;
}

export interface BenchmarkTurnRunRecord extends TurnRunRecord {
  attempts: ProviderAttemptRecord[];
  retryCount: number;
  requestParametersSha256: string;
  outputPolicyApplied: boolean;
}

export interface BenchmarkScenarioRunRecord extends ScenarioRunRecord {
  schemaVersion: 1;
  pairId: string;
  planKey: string;
  experiment: ExperimentKind;
  arm: PairArm;
  pairOrder: PairOrder;
  estimand: PairEstimand;
  comparatorAblation: AblationDefinition;
  comparisonAblation: AblationDefinition;
  turns: BenchmarkTurnRunRecord[];
}

export interface PlannedPair {
  pairId: string;
  scenarioId: string;
  clusterId: string;
  category: ScenarioCategory;
  replicate: number;
  experiment: ExperimentKind;
  pairOrder: PairOrder;
  estimand: PairEstimand;
  comparatorAblation: AblationDefinition;
  comparisonAblation: AblationDefinition;
  armOrder: readonly PairArm[];
}

export interface CampaignSelection {
  scenarioIds: readonly string[];
  replicates: number;
  targetAblationIds: readonly string[];
  plannedTreatmentAblationIds: readonly string[];
  includeStageOnly: boolean;
  includeLeaveOneOut: boolean;
  includeOutputPolicyExperiment: boolean;
}

export interface CampaignDesign {
  syntheticDataOnly: true;
  paired: true;
  pairUnit: "scenario-session-replicate";
  turnAggregation: "sum-within-scenario-session";
  randomizedPairBlocks: true;
  balancedWithinPairOrder: true;
  providerSeedParameterSent: false;
  providerDeterminismClaimed: false;
  contextOnlyPolicy: "identical-system-model-and-generation-parameters; output policy suppressed in both arms";
  outputPolicyIsolation: "identical prepared context in both arms; only the explicit output policy differs";
  providerCacheCondition: "natural-provider-cache; paired order balanced; cache-hit and cache-miss tokens reported separately";
  orderKeySha256: string;
}

export interface CampaignProgress {
  state: "preflight" | "running" | "cost-cap-stopped" | "completed";
  plannedPairs: number;
  plannedRequests: number;
  recordedRequests: number;
  completedPairs: number;
  costCapStoppedAtPlanKey: string | null;
}

export interface CampaignCostAccounting {
  hardCapUsd: number;
  authoritativeUsageCostUsd: number;
  conservativeCapChargeUsd: number;
  pricingSource: "config-snapshot";
}

export interface LiveCampaignArtifact {
  schemaVersion: 1;
  artifactKind: "live-campaign";
  campaignId: string;
  corpusId: string;
  corpusSha256: string;
  configSha256: string;
  createdAt: string;
  updatedAt: string;
  config: DeepSeekConfigSnapshot;
  selection: CampaignSelection;
  design: CampaignDesign;
  plan: PlannedPair[];
  progress: CampaignProgress;
  cost: CampaignCostAccounting;
  preflight: {
    checkedAt: string;
    endpoint: string;
    requestedModelListed: boolean;
    availableModelIds: string[];
  } | null;
  runs: BenchmarkScenarioRunRecord[];
  warnings: string[];
}

export interface OfflinePreparationRecord {
  pairId: string;
  replicate: number;
  scenarioId: string;
  turnId: string;
  comparisonAblationId: string;
  experiment: ExperimentKind;
  arm: PairArm;
  prepared: PreparedTurn;
}

export interface OfflinePlanArtifact {
  schemaVersion: 1;
  artifactKind: "offline-plan";
  campaignId: string;
  corpusId: string;
  corpusSha256: string;
  configSha256: string;
  createdAt: string;
  config: DeepSeekConfigSnapshot;
  selection: CampaignSelection;
  design: CampaignDesign;
  plan: PlannedPair[];
  preparations: OfflinePreparationRecord[];
  providerRequestsMade: 0;
  actualProviderUsage: null;
  checks: readonly { id: string; passed: boolean; detail: string }[];
  warnings: string[];
}
