import { classify } from "../detectors/content-type.js";
import { classifyCommand, optimizeCommandOutput, type CommandProfile } from "../integrations/commands.js";
import { assertInputWithinLimit, DEFAULT_MAX_INPUT_CHARACTERS } from "../security.js";
import { buildStats } from "../stats/calculate.js";
import type { OptimizeOptions, OptimizeResult, OptimizationDecision } from "../types.js";
import { optimize } from "./optimize.js";
import { optimizeStructured, type StructuredOptimizeResult } from "./structured.js";

export interface OptimizeContextOptions extends OptimizeOptions {
  /** Optional provenance. It is classified as data and is never executed. */
  command?: string;
  /** Disable lexical JSON/JSONL routing when exact whitespace must be retained. */
  structured?: boolean;
}

export interface OptimizeContextResult extends OptimizeResult {
  strategy: "structured" | "command" | "generic";
  structured?: Pick<StructuredOptimizeResult, "type" | "lexicallyLossless">;
  command?: CommandProfile;
}

/** Route known structured content and command output through the safest applicable strategy. */
export function optimizeContext(
  input: string,
  options: OptimizeContextOptions = {},
): OptimizeContextResult {
  const { command, structured = true, ...coreOptions } = options;
  assertInputWithinLimit(
    input,
    coreOptions.maxInputCharacters ?? DEFAULT_MAX_INPUT_CHARACTERS,
  );

  if (structured) {
    const result = optimizeStructured(input);
    if (result.type !== "text") {
      const changeCount = result.changed ? 1 : 0;
      const decision: OptimizationDecision = {
        cleaner: `structured-${result.type}`,
        enabled: true,
        changes: changeCount,
        reason: changeCount ? "applied" : "not-applicable",
      };
      const stats = buildStats(input, {
        text: result.text,
        changes: changeCount ? [{
          name: `structured-${result.type}`,
          count: 1,
          description: "Removed insignificant structured-data whitespace",
        }] : [],
        detection: classify(input),
      }, { tokenCounter: coreOptions.tokenCounter, exactTokens: true });
      stats.decisions = [decision];
      coreOptions.observer?.onCleaner?.(decision);
      coreOptions.observer?.onComplete?.(stats);
      return {
        text: result.text,
        stats,
        strategy: "structured",
        structured: { type: result.type, lexicallyLossless: result.lexicallyLossless },
        command: command ? classifyCommand(command) : undefined,
      };
    }
  }

  if (command) {
    const result = optimizeCommandOutput(command, input, coreOptions);
    return { ...result, strategy: "command" };
  }
  return { ...optimize(input, coreOptions), strategy: "generic" };
}

