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
  TransformationChange,
} from "../types.js";
import { classify } from "../detectors/content-type.js";
import { AnsiCleaner } from "../cleaners/ansi.js";
import { WhitespaceCleaner } from "../cleaners/whitespace.js";
import { DuplicateLinesCleaner } from "../cleaners/duplicate-lines.js";
import { StackTraceCleaner } from "../cleaners/stack-trace.js";
import { TestOutputCleaner } from "../cleaners/test-output.js";
import { buildStats } from "../stats/calculate.js";
import { assertInputWithinLimit, DEFAULT_MAX_INPUT_CHARACTERS } from "../security.js";

/**
 * Preset descriptions. `safe` is the default: only very-low-risk transforms.
 * `balanced` adds the two context-specific cleaners. `aggressive` is a
 * placeholder whose behaviour intentionally matches `balanced` for v0.1 —
 * no destructive semantic compression is performed yet.
 */

export const PRESETS: Record<PresetName, PresetOptions> = {
  safe: {
    ansi: true,
    whitespace: true,
    duplicateLines: true,
    stackTrace: false,
    testOutput: false,
  },
  balanced: {
    ansi: true,
    whitespace: true,
    duplicateLines: true,
    stackTrace: true,
    testOutput: true,
  },
  aggressive: {
    ansi: true,
    whitespace: true,
    duplicateLines: true,
    stackTrace: true,
    testOutput: true,
  },
};

const DEFAULT_OPTIONS: OptimizeOptions = {};

function resolveOptions(options: OptimizeOptions | undefined): PresetOptions {
  const preset: PresetName | undefined = options?.preset;
  const base =
    preset === "safe" || preset === undefined
      ? PRESETS.safe
      : preset === "balanced" || preset === "aggressive"
        ? PRESETS.balanced
        : PRESETS.safe;
  const overrides: PresetOverride = options?.cleaners ?? {};
  return {
    ansi: overrides.ansi ?? base.ansi,
    whitespace: overrides.whitespace ?? base.whitespace,
    duplicateLines: overrides.duplicateLines ?? base.duplicateLines,
    stackTrace: overrides.stackTrace ?? base.stackTrace,
    testOutput: overrides.testOutput ?? base.testOutput,
  };
}

function buildPipeline(options: PresetOptions): Array<[Cleaner, boolean]> {
  return [
    [new AnsiCleaner(), options.ansi],
    [new WhitespaceCleaner(), options.whitespace],
    [new DuplicateLinesCleaner(), options.duplicateLines],
    [new StackTraceCleaner(), options.stackTrace],
    [new TestOutputCleaner(), options.testOutput],
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

  for (const [cleaner, enabled] of pipeline) {
    if (!enabled) continue;
    const result = cleaner.clean(text, detection);
    text = result.text;
    for (const change of result.changes) changes.push(change);
    confidences.push(result.confidence);
  }

  const stats: OptimizeStats = buildStats(input, { text, changes, detection }, {
    tokenCounter: options.tokenCounter,
    exactTokens: true,
  });

  return { text, stats };
}
