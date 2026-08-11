import type { Cleaner, CleanerResult, ContentDetection } from "../types.js";

/**
 * Collapses runs of consecutive, exact-duplicate lines into a single line
 * that records how many times the line repeated:
 *
 *   Connecting...
 *   Connecting...
 *   Connecting...
 *   Connecting...
 *   Connection failed
 *
 * becomes:
 *
 *   Connecting... [repeated 4 times]
 *   Connection failed
 *
 * Rules:
 * - Only confidently identified generic terminal output is eligible. Source
 *   code, prose, instructions, and ambiguous text preserve exact repetition.
 * - Only EXACT, CONSECUTIVE duplicates are collapsed. Identical lines in
 *   unrelated locations in the output are left alone.
 * - Empty lines are never collapsed here (the whitespace cleaner owns them).
 * - Lines that already carry a "[repeated N times]" marker are left alone so
 *   the transform stays idempotent and markers never nest.
 */

const REPEATED_MARKER = /\[repeated \d+ times\]$/;
const HIGH_SIGNAL_LINE = /\b(?:error|warning|failed?|lost|closed|dead-letter|retrying|acknowledged|status)\b/i;

export class DuplicateLinesCleaner implements Cleaner {
  readonly id = "duplicate-lines";
  readonly description = "Collapse runs of consecutive duplicate lines";

  clean(text: string, detection: ContentDetection): CleanerResult {
    if (
      detection.type !== "generic-terminal-output" ||
      detection.confidence !== "high"
    ) {
      return { text, changes: [], confidence: "low" };
    }
    if (!text.includes("\n")) {
      return { text, changes: [], confidence: "high" };
    }

    const crlf = text.includes("\r\n");
    const rawLines = text.split(/\r?\n/);
    const lines: string[] = [];

    let collapseCount = 0;

    for (let i = 0; i < rawLines.length; ) {
      const line = rawLines[i] ?? "";
      if (line === "" || REPEATED_MARKER.test(line) || HIGH_SIGNAL_LINE.test(line)) {
        lines.push(line);
        i += 1;
        continue;
      }
      let j = i;
      while (j + 1 < rawLines.length && (rawLines[j + 1] ?? "") === line) {
        j += 1;
      }
      const runLength = j - i + 1;
      if (runLength >= 2) {
        const marker = ` [repeated ${runLength} times]`;
        const collapsed = line.length + marker.length;
        if (line.length * runLength > collapsed) {
          lines.push(`${line}${marker}`);
          collapseCount += 1;
        } else {
          for (let k = 0; k < runLength; k++) lines.push(line);
        }
      } else {
        lines.push(line);
      }
      i = j + 1;
    }

    const out = lines.join(crlf ? "\r\n" : "\n");

    return {
      text: collapseCount > 0 ? out : text,
      changes:
        collapseCount > 0
          ? [
              {
                name: this.id,
                count: collapseCount,
                description: this.description,
              },
            ]
          : [],
      confidence: "high",
    };
  }
}
