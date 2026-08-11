import type { Cleaner, CleanerResult, ContentDetection } from "../types.js";

/**
 * Conservative whitespace normalisation.
 *
 * Always applied:
 *  1. Trailing whitespace on each line.
 *  2. Excessive blank lines (3+ newlines -> 2 newlines, i.e. at most one
 *     empty line between blocks).
 *
 * "Clearly safe" only (skipped for source-code-like content):
 *  3. Runs of 3+ spaces between non-space characters collapse to a single
 *     space, unless the line looks tabular (contains a pipe character).
 *     Leading indentation is never touched.
 *
 * When in doubt, whitespace is preserved.
 */

const TRAILING_WS = /[\t ]+(?=\r?\n|$)/gm;
const EXCESSIVE_BLANKS = /((?:[^\S\r\n]*\r?\n){3,})/g;
const MIDLINE_SPACES = /(?<=\S) {3,}(?=\S)/g;
const HAS_PIPE = /\|/;

export class WhitespaceCleaner implements Cleaner {
  readonly id = "whitespace";
  readonly description = "Normalise excessive whitespace";

  clean(text: string, detection: ContentDetection): CleanerResult {
    if (text === "") {
      return { text, changes: [], confidence: "high" };
    }

    let trailingCount = 0;
    let blankCount = 0;
    let midlineCount = 0;

    let out = text.replace(TRAILING_WS, () => {
      trailingCount += 1;
      return "";
    });

    let previous: string;
    do {
      previous = out;
      out = out.replace(EXCESSIVE_BLANKS, () => {
        blankCount += 1;
        return "\n\n";
      });
    } while (out !== previous);

    // Mid-line alignment can carry structure in compiler/test/agent output.
    // Only normalize it when detection strongly identifies generic terminal
    // output; trailing whitespace and blank-line cleanup remain universal.
    if (detection.type === "generic-terminal-output" && detection.confidence === "high") {
      out = out
        .split("\n")
        .map((line) => {
          if (HAS_PIPE.test(line)) return line;
          return line.replace(MIDLINE_SPACES, () => {
            midlineCount += 1;
            return " ";
          });
        })
        .join("\n");
    }

    const total = trailingCount + blankCount + midlineCount;
    return {
      text: out,
      changes:
        total > 0
          ? [{ name: this.id, count: total, description: this.description }]
          : [],
      confidence: "high",
    };
  }
}
