export { optimize, PRESETS } from "./pipeline/optimize.js";
export { classify, describe } from "./detectors/content-type.js";
export { estimateTokens, createCounter, DEFAULT_ESTIMATE_NAME } from "./token/counter.js";
export { AnsiCleaner } from "./cleaners/ansi.js";
export { WhitespaceCleaner } from "./cleaners/whitespace.js";
export { DuplicateLinesCleaner } from "./cleaners/duplicate-lines.js";
export { StackTraceCleaner } from "./cleaners/stack-trace.js";
export { TestOutputCleaner } from "./cleaners/test-output.js";
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
  OptimizeResult,
  OptimizeStats,
  PresetName,
  PresetOptions,
  PresetOverride,
  TokenCounter,
  TokenStats,
  TransformationChange,
} from "./types.js";
