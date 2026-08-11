import type {
  Cleaner,
  Confidence,
  ContentDetection,
  OptimizeOptions,
  OptimizeResult,
  OptimizeStats,
  PresetName,
  PresetOptions,
  PresetOverride,
  OptimizationDecision,
  TransformationChange,
} from "../types.js";
import { classify } from "../detectors/content-type.js";
import { AnsiCleaner } from "../cleaners/ansi.js";
import { WhitespaceCleaner } from "../cleaners/whitespace.js";
import { DuplicateLinesCleaner } from "../cleaners/duplicate-lines.js";
import { StackTraceCleaner } from "../cleaners/stack-trace.js";
import { TestOutputCleaner } from "../cleaners/test-output.js";
import { RepeatedBlocksCleaner } from "../cleaners/repeated-blocks.js";
import { buildStats } from "../stats/calculate.js";
import { assertInputWithinLimit, DEFAULT_MAX_INPUT_CHARACTERS } from "../security.js";

/**
 * Preset descriptions. `safe` is the default: only very-low-risk transforms.
 * `balanced` adds the two context-specific cleaners. `aggressive` additionally
 * compacts identical multiline terminal blocks while preserving their count.
 */

export const PRESETS: Record<PresetName, PresetOptions> = {
  safe: {
    ansi: true,
    whitespace: true,
    duplicateLines: true,
    stackTrace: false,
    testOutput: false,
    repeatedBlocks: false,
  },
  balanced: {
    ansi: true,
    whitespace: true,
    duplicateLines: true,
    stackTrace: true,
    testOutput: true,
    repeatedBlocks: false,
  },
  aggressive: {
    ansi: true,
    whitespace: true,
    duplicateLines: true,
    stackTrace: true,
    testOutput: true,
    repeatedBlocks: true,
  },
};

const DEFAULT_OPTIONS: OptimizeOptions = {};

function resolveOptions(options: OptimizeOptions | undefined): PresetOptions {
  const preset: PresetName | undefined = options?.preset;
  const base = preset === undefined ? PRESETS.safe : PRESETS[preset] ?? PRESETS.safe;
  const overrides: PresetOverride = options?.cleaners ?? {};
  return {
    ansi: overrides.ansi ?? base.ansi,
    whitespace: overrides.whitespace ?? base.whitespace,
    duplicateLines: overrides.duplicateLines ?? base.duplicateLines,
    stackTrace: overrides.stackTrace ?? base.stackTrace,
    testOutput: overrides.testOutput ?? base.testOutput,
    repeatedBlocks: overrides.repeatedBlocks ?? base.repeatedBlocks,
  };
}

function buildPipeline(options: PresetOptions): Array<[Cleaner, boolean]> {
  return [
    [new AnsiCleaner(), options.ansi],
    [new WhitespaceCleaner(), options.whitespace],
    [new DuplicateLinesCleaner(), options.duplicateLines],
    [new StackTraceCleaner(), options.stackTrace],
    [new TestOutputCleaner(), options.testOutput],
    [new RepeatedBlocksCleaner(), options.repeatedBlocks],
  ];
}

export function optimize(
  input: string,
  maybeOptions?: OptimizeOptions,
): OptimizeResult {
  const options = maybeOptions ?? DEFAULT_OPTIONS;
  assertInputWithinLimit(
    input,
    options.maxInputCharacters ?? DEFAULT_MAX_INPUT_CHARACTERS,
  );
  const presetOptions = resolveOptions(options);
  const pipeline = buildPipeline(presetOptions);

  const detection: ContentDetection = classify(input);

  let text = input;
  const changes: TransformationChange[] = [];
  const confidences: Confidence[] = [];
  const decisions: OptimizationDecision[] = [];

  for (const [cleaner, enabled] of pipeline) {
    if (!enabled) {
      const decision: OptimizationDecision = {
        cleaner: cleaner.id,
        enabled: false,
        changes: 0,
        reason: "disabled-by-preset",
      };
      decisions.push(decision);
      options.observer?.onCleaner?.(decision);
      continue;
    }
    const result = cleaner.clean(text, detection);
    text = result.text;
    for (const change of result.changes) changes.push(change);
    confidences.push(result.confidence);
    const count = result.changes.reduce((total, change) => total + change.count, 0);
    const decision: OptimizationDecision = {
      cleaner: cleaner.id,
      enabled: true,
      changes: count,
      reason: count > 0 ? "applied" : "not-applicable",
    };
    decisions.push(decision);
    options.observer?.onCleaner?.(decision);
  }

  const stats: OptimizeStats = buildStats(input, { text, changes, detection }, {
    tokenCounter: options.tokenCounter,
    exactTokens: true,
  });
  stats.decisions = decisions;
  options.observer?.onComplete?.(stats);

  return { text, stats };
}
