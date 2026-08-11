import type { Cleaner, CleanerResult, ContentDetection } from "../types.js";

/**
 * Removes ANSI escape sequences used for terminal formatting (colors,
 * bold, cursor positioning, OSC title sequences, etc.) without altering
 * the underlying text characters.
 *
 * Rules:
 * - Strip every recognised CSI / OSC / non-UTF8 escape sequence.
 * - Never reorder or modify characters outside escape sequences.
 * - A sequence either fully matches the grammar below or is left alone.
 */

const CSI_OR_OSC =
  /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g;

export function stripAnsi(text: string): { text: string; count: number } {
  let count = 0;
  const output = text.replace(CSI_OR_OSC, () => {
    count += 1;
    return "";
  });
  return { text: output, count };
}

export class AnsiCleaner implements Cleaner {
  readonly id = "ansi";
  readonly description = "Remove ANSI escape sequences";

  clean(text: string, _detection: ContentDetection): CleanerResult {
    const { text: out, count } = stripAnsi(text);
    return {
      text: out,
      changes:
        count > 0
          ? [{ name: this.id, count, description: this.description }]
          : [],
      confidence: count > 0 ? "high" : "high",
    };
  }
}
