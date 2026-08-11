import type { Cleaner, CleanerResult, ContentDetection } from "../types.js";

/**
 * Conservative test-runner output cleanup (Vitest / Jest).
 *
 * The ONLY transformation applied is collapsing consecutive PASSING test
 * lines — e.g. a wall of `✓ passed test A`, `✓ passed test B`, ... —
 * into a single summary line:
 *
 *   4 tests passed
 *
 * Everything else is preserved byte for byte:
 * - failing test names and markers
 * - assertion errors and expected/received values
 * - stack traces inside failures
 * - the runner's summary ("Tests: ...", "Test Files: ...")
 *
 * Rules:
 * - Only runs of >= 3 consecutive passing lines are collapsed.
 * - The cleaners is entirely skipped unless the content is confidently
 *   recognised as test-runner output.
 */

const PASS_LINE = /^\s*(?:[✓√✔])\s+/;
const FAILURE_LINE = /^\s*(?:[×✗✘✕]\s+|FAIL(?:ED)?\b)/m;

function indentOf(line: string): string {
  const match = /^\s*/.exec(line);
  return match ? match[0] : "";
}

export class TestOutputCleaner implements Cleaner {
  readonly id = "test-output";
  readonly description = "Collapse repeated passing test lines";

  clean(text: string, detection: ContentDetection): CleanerResult {
    if (detection.type !== "test-output") {
      return { text, changes: [], confidence: "low" };
    }
    // In a failing report, surrounding passing-test structure can affect a
    // model's attention and interpretation even though the failure text is
    // preserved byte-for-byte. Prefer quality over compression in that case.
    if (FAILURE_LINE.test(text)) {
      return { text, changes: [], confidence: "high" };
    }

    const crlf = text.includes("\r\n");
    const rawLines = text.split(/\r?\n/);

    const outLines: string[] = [];
    let collapses = 0;
    let runStart = -1;

    const flushRun = (end: number) => {
      if (runStart === -1) return;
      const runLength = end - runStart;
      const start = runStart;
      runStart = -1;

      let collapse = false;
      if (runLength >= 3) {
        const indent = indentOf(rawLines[start] ?? "");
        const candidate = `${indent}✓ ${runLength} test cases passed`;
        let originalLength = 0;
        for (let k = 0; k < runLength; k++) {
          originalLength += (rawLines[start + k] ?? "").length;
        }
        collapse = candidate.length < originalLength;
        if (collapse) {
          outLines.push(candidate);
          collapses += 1;
        }
      }
      if (!collapse) {
        for (let k = 0; k < runLength; k++) {
          outLines.push(rawLines[start + k] ?? "");
        }
      }
    };

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i] ?? "";
      if (PASS_LINE.test(line)) {
        if (runStart === -1) runStart = i;
        continue;
      }
      flushRun(i);
      outLines.push(line);
    }
    flushRun(rawLines.length);

    const out = outLines.join(crlf ? "\r\n" : "\n");

    return {
      text: collapses > 0 ? out : text,
      changes:
        collapses > 0
          ? [
              {
                name: this.id,
                count: collapses,
                description: this.description,
              },
            ]
          : [],
      confidence: collapses > 0 ? "high" : "medium",
    };
  }
}
