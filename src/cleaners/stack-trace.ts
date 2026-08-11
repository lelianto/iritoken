import type { Cleaner, CleanerResult, ContentDetection } from "../types.js";

/**
 * Conservative stack-trace cleanup.
 *
 * The ONLY transformation applied is collapsing consecutive, textually
 * identical stack frames:
 *
 *   at run (worker.js:12:3)
 *   at run (worker.js:12:3)
 *   at run (worker.js:12:3)
 *
 * becomes:
 *
 *   at run (worker.js:12:3) [repeated 3 times]
 *
 * Rules:
 * - Error type, error message, application frames, file names, line/column
 *   numbers and non-duplicate frames are all preserved byte for byte.
 * - No relevance filtering, no frame removal, no arbitrary truncation.
 * - Only frames that match an established stack-trace shape are eligible.
 */

const V8_FRAME = /^\s+at\s.+:\d+(?::\d+)?\s*$/;
const V8_FRAME_ANON = /^\s+at\s.+/;
const PYTHON_FRAME = /^\s+File\s".+",\sline\s\d+,\sin\s.+/;
const REPEATED_MARKER = /\[repeated \d+ times\]$/;

function isFrame(line: string): boolean {
  if (V8_FRAME.test(line)) return true;
  if (V8_FRAME_ANON.test(line) && /\(|:\d+/.test(line)) return true;
  if (PYTHON_FRAME.test(line)) return true;
  return false;
}

function indentation(line: string): number {
  return /^\s*/.exec(line)?.[0].length ?? 0;
}

function pythonRecordLength(lines: readonly string[], index: number): number {
  const frame = lines[index] ?? "";
  if (!PYTHON_FRAME.test(frame)) return 0;
  const source = lines[index + 1] ?? "";
  return source.trim() !== "" && indentation(source) > indentation(frame) && !isFrame(source)
    ? 2
    : 1;
}

export class StackTraceCleaner implements Cleaner {
  readonly id = "stack-trace";
  readonly description = "Collapse repeated consecutive stack frames";

  clean(text: string, detection: ContentDetection): CleanerResult {
    // Only act when the input plausibly contains real stack traces. In
    // unknown / prose content we never risk touching frame-like lines.
    if (detection.type !== "stack-trace" && detection.type !== "test-output") {
      const frames = countFrames(text);
      if (frames < 5) {
        return { text, changes: [], confidence: "low" };
      }
    }

    const crlf = text.includes("\r\n");
    const rawLines = text.split(/\r?\n/);
    const lines: string[] = [];

    let collapseCount = 0;

    for (let i = 0; i < rawLines.length; ) {
      const line = rawLines[i] ?? "";
      const pythonLength = pythonRecordLength(rawLines, i);
      if (pythonLength > 0 && !REPEATED_MARKER.test(line)) {
        const record = rawLines.slice(i, i + pythonLength);
        let repeats = 1;
        while (
          i + (repeats + 1) * pythonLength <= rawLines.length &&
          record.every(
            (value, offset) => rawLines[i + repeats * pythonLength + offset] === value,
          )
        ) repeats += 1;
        if (repeats >= 2) {
          const marker = ` [repeated ${repeats} times]`;
          const candidate = [`${record[0] ?? ""}${marker}`, ...record.slice(1)];
          const original = rawLines.slice(i, i + repeats * pythonLength);
          if (candidate.join("\n").length < original.join("\n").length) {
            lines.push(...candidate);
            collapseCount += 1;
            i += repeats * pythonLength;
            continue;
          }
        }
      }
      if (!isFrame(line) || REPEATED_MARKER.test(line)) {
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
      confidence: collapseCount > 0 ? "high" : "medium",
    };
  }
}

function countFrames(text: string): number {
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    if (isFrame(line)) count += 1;
  }
  return count;
}
