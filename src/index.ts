export { optimize, PRESETS } from "./pipeline/optimize.js";
export { classify, describe } from "./detectors/content-type.js";
export { estimateTokens, createCounter, DEFAULT_ESTIMATE_NAME } from "./token/counter.js";
export { fromEncoder, fromTokenizer } from "./token/adapters.js";
export { optimizeMessages } from "./integrations/messages.js";
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
