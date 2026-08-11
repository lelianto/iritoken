import type { Cleaner, CleanerResult, ContentDetection } from "../types.js";

/**
 * Conservative test-runner output cleanup (Vitest, Jest, pytest, Go, Cargo).
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

const PASS_LINE = /^(?:\s*[✓√✔]\s+|\S+::\S+\s+PASSED(?:\s|$)|\s*---\s+PASS:\s+\S+|test\s+\S+\s+\.\.\.\s+ok$)/;
const FAILURE_LINE = /^(?:\s*[×✗✘✕]\s+|\s*FAIL(?:ED)?\b|\S+::\S+\s+FAILED(?:\s|$)|\s*---\s+FAIL:\s+\S+|test\s+\S+\s+\.\.\.\s+FAILED$|test result:\s+FAILED)/m;
const GO_RUN_LINE = /^\s*=== RUN\s+(\S+)/;
const GO_PASS_LINE = /^\s*--- PASS:\s+(\S+)(?:\s+\(|$)/;

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
    let runEnd = -1;
    let runTests = 0;

    const flushRun = () => {
      if (runStart === -1) return;
      const start = runStart;
      const end = runEnd;
      const testCount = runTests;
      runStart = -1;
      runEnd = -1;
      runTests = 0;

      let collapse = false;
      if (testCount >= 3) {
        const indent = indentOf(rawLines[start] ?? "");
        const candidate = `${indent}✓ ${testCount} test cases passed`;
        let originalLength = 0;
        for (let k = start; k < end; k++) {
          originalLength += (rawLines[k] ?? "").length;
        }
        collapse = candidate.length < originalLength;
        if (collapse) {
          outLines.push(candidate);
          collapses += 1;
        }
      }
      if (!collapse) {
        for (let k = start; k < end; k++) {
          outLines.push(rawLines[k] ?? "");
        }
      }
    };

    for (let i = 0; i < rawLines.length;) {
      const line = rawLines[i] ?? "";
      const goRun = GO_RUN_LINE.exec(line);
      const goPass = GO_PASS_LINE.exec(rawLines[i + 1] ?? "");
      const recordLength = goRun && goPass && goRun[1] === goPass[1]
        ? 2
        : PASS_LINE.test(line)
          ? 1
          : 0;
      if (recordLength > 0) {
        if (runStart === -1) runStart = i;
        runEnd = i + recordLength;
        runTests += 1;
        i += recordLength;
        continue;
      }
      flushRun();
      outLines.push(line);
      i += 1;
    }
    flushRun();

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
