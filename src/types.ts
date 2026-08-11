export type Confidence = "high" | "medium" | "low";

export type ContentType =
  | "generic-terminal-output"
  | "source-code"
  | "stack-trace"
  | "test-output"
  | "unknown";

export interface ContentDetection {
  type: ContentType;
  confidence: Confidence;
}

export interface TransformationChange {
  /** Stable machine-readable id, e.g. "ansi" or "duplicate-lines". */
  name: string;
  /** Number of discrete edits performed. */
  count: number;
  /** Human-readable description of the transform. */
  description: string;
}

export interface CleanerResult {
  text: string;
  changes: TransformationChange[];
  confidence: Confidence;
}

/** A single deterministic transformation stage in the pipeline. */
export interface Cleaner {
  /** Stable id used for reporting and stats. */
  readonly id: string;
  readonly description: string;
  /** Transform the text. Must be deterministic and idempotent. */
  clean(text: string, detection: ContentDetection): CleanerResult;
}

export type PresetName = "safe" | "balanced" | "aggressive";

export type PresetOverride = {
  [K in keyof PresetOptions]?: PresetOptions[K];
};

export interface PresetOptions {
  ansi: boolean;
  whitespace: boolean;
  duplicateLines: boolean;
  stackTrace: boolean;
  testOutput: boolean;
  repeatedBlocks: boolean;
}

export interface OptimizeOptions {
  preset?: PresetName;
  /** Per-cleaner overrides. Disabled cleaners stay disabled. */
  cleaners?: PresetOverride;
  /** Optional tokenizer used only for token-based stats. */
  tokenCounter?: TokenCounter;
  /**
   * Resource-exhaustion guard for untrusted input. Defaults to 16 Mi
   * characters. Set an explicit, smaller value at trust boundaries.
   */
  maxInputCharacters?: number;
  /** Optional lifecycle observer. It receives metadata only, never input text. */
  observer?: OptimizeObserver;
}

export type OptimizationDecisionReason =
  | "applied"
  | "disabled-by-preset"
  | "not-applicable";

export interface OptimizationDecision {
  cleaner: string;
  enabled: boolean;
  changes: number;
  reason: OptimizationDecisionReason;
}

export interface OptimizeObserver {
  onCleaner?(decision: Readonly<OptimizationDecision>): void;
  onComplete?(stats: Readonly<OptimizeStats>): void;
}

export interface TokenCounter {
  count(text: string): number;
}

export interface TokenStats {
  originalTokens: number;
  optimizedTokens: number;
  tokensRemoved: number;
  tokenReductionPercentage: number;
  /** True only when counts come from an exact tokenizer provided by the user. */
  exact: boolean;
}

export interface OptimizeStats {
  originalCharacters: number;
  optimizedCharacters: number;
  charactersRemoved: number;
  reductionPercentage: number;
  /** Per-cleaner change counts, e.g. { ansi: 42, whitespace: 28 }. */
  transformations: Record<string, number>;
  /** Content category detected for the input. */
  detection: ContentDetection;
  /** Explainable outcome for every cleaner, including skipped cleaners. */
  decisions: OptimizationDecision[];
  tokens?: TokenStats;
}

export interface OptimizeResult {
  text: string;
  stats: OptimizeStats;
}
