export { optimize, PRESETS } from "./pipeline/optimize.js";
export { optimizeContext } from "./pipeline/context.js";
export { optimizeSegments } from "./pipeline/segments.js";
export { optimizeStructured } from "./pipeline/structured.js";
export { optimizeAudited } from "./pipeline/audit.js";
export { optimizeRetrievable } from "./pipeline/retrievable.js";
export { classify, describe } from "./detectors/content-type.js";
export { classifyStructured } from "./detectors/structured-content.js";
export { estimateTokens, createCounter, DEFAULT_ESTIMATE_NAME } from "./token/counter.js";
export { fromEncoder, fromTokenizer } from "./token/adapters.js";
export { optimizeMessages } from "./integrations/messages.js";
export { classifyCommand, optimizeCommandOutput } from "./integrations/commands.js";
export { ContextStore } from "./retrieval/store.js";
export { SemanticIndex, cosineSimilarity } from "./retrieval/semantic.js";
export { SemanticCache } from "./cache/semantic.js";
export { fitTokenBudget } from "./context/budget.js";
export { rankContext } from "./context/ranking.js";
export { compactConversation } from "./context/conversation.js";
export { classifyContextUnit, classifyContextUnits } from "./context/classification.js";
export { createIritoken } from "./pipeline/iritoken.js";
export { routeModel } from "./routing/model.js";
export { createOpenAICompatibleAdapter, createDeepSeekAdapter } from "./providers/openai-compatible.js";
export { prepareCacheAwarePrompt, cacheHitPercentage } from "./prompt/cache.js";
export { MetricsCollector } from "./observability/collector.js";
export { evaluateQualityGate } from "./evaluation/quality-gate.js";
export { AnsiCleaner } from "./cleaners/ansi.js";
export { WhitespaceCleaner } from "./cleaners/whitespace.js";
export { DuplicateLinesCleaner } from "./cleaners/duplicate-lines.js";
export { StackTraceCleaner } from "./cleaners/stack-trace.js";
export { TestOutputCleaner } from "./cleaners/test-output.js";
export { RepeatedBlocksCleaner } from "./cleaners/repeated-blocks.js";
export {
  DEFAULT_MAX_INPUT_BYTES,
  DEFAULT_MAX_INPUT_CHARACTERS,
  InputLimitError,
} from "./security.js";

export type {
  Cleaner,
  CleanerResult,
  Confidence,
  ContentDetection,
  ContentType,
  OptimizeOptions,
  OptimizeObserver,
  OptimizationDecision,
  OptimizationDecisionReason,
  OptimizeResult,
  OptimizeSegmentsResult,
  OptimizedSegment,
  OptimizeStats,
  PresetName,
  PresetOptions,
  PresetOverride,
  TokenCounter,
  TokenStats,
  TransformationChange,
} from "./types.js";
export type { EncoderLike, TokenizerLike } from "./token/adapters.js";
export type { ContextMessage, OptimizeMessagesResult } from "./integrations/messages.js";
export type { CommandFamily, CommandProfile, OptimizeCommandResult } from "./integrations/commands.js";
export type { StructuredContentType, StructuredDetection } from "./detectors/structured-content.js";
export type { StructuredOptimizeResult } from "./pipeline/structured.js";
export type { OptimizeContextOptions, OptimizeContextResult } from "./pipeline/context.js";
export type { OptimizationEvidence, AuditedOptimizeResult } from "./pipeline/audit.js";
export type { ContextStoreOptions } from "./retrieval/store.js";
export type { SemanticDocument, SemanticMatch, SemanticIndexOptions } from "./retrieval/semantic.js";
export type { SemanticCacheHit } from "./cache/semantic.js";
export type { BudgetItem, BudgetResult, BudgetOptions } from "./context/budget.js";
export type { RankableContext, RankedContext } from "./context/ranking.js";
export type { CompactConversationOptions, CompactConversationResult } from "./context/conversation.js";
export type {
  ClassifiedContextUnit,
  ContextImportance,
  ContextMetadataValue,
  ContextUnit,
  ContextUnitKind,
} from "./context/classification.js";
export type {
  Iritoken,
  IritokenLedgerEntry,
  IritokenMetrics,
  IritokenOptions,
  IritokenOutputPolicy,
  IritokenOutputPolicyOptions,
  IritokenRequest,
  IritokenResult,
  IritokenStageAction,
  IritokenStageDecision,
  IritokenStageName,
  IritokenStageReport,
} from "./pipeline/iritoken.js";
export type { ModelRoute, ModelRoutingRequest, ModelRoutingDecision } from "./routing/model.js";
export type { ProviderAdapter, ProviderCompletion, ProviderUsage, OpenAICompatibleAdapterOptions } from "./providers/openai-compatible.js";
export type { CacheAwarePrompt } from "./prompt/cache.js";
export type { Observation, ObservationExporter, MetricsCollectorOptions } from "./observability/collector.js";
export type { RetrievableOptimizeResult } from "./pipeline/retrievable.js";
export type {
  QualityCase, QualityCaseResult, QualityGateOptions, QualityGateResult,
} from "./evaluation/quality-gate.js";
