import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { optimize } from "./pipeline/optimize.js";
import { stripAnsi } from "./cleaners/ansi.js";
import { DEFAULT_MAX_INPUT_BYTES, InputLimitError } from "./security.js";
import type { OptimizeOptions, OptimizeResult } from "./types.js";

export interface OptimizeTransformOptions extends OptimizeOptions {
  maxInputBytes?: number;
  onResult?: (result: Readonly<OptimizeResult>) => void;
}

export interface TerminalStreamStats {
  inputBytes: number;
  outputBytes: number;
  transformations: Record<"ansi" | "whitespace" | "duplicate-lines", number>;
}

export interface TerminalOptimizeTransformOptions {
  maxInputBytes?: number;
  /** Bounds memory for newline-free input. Defaults to 1 MiB. */
  maxLineBytes?: number;
  onStats?: (stats: Readonly<TerminalStreamStats>) => void;
}

/**
 * Backpressure-aware Node transform. Input is buffered so its output is exactly
 * equivalent to optimize(), whose content detector requires the complete context.
 */
export function createOptimizeTransform(options: OptimizeTransformOptions = {}): Transform {
  const decoder = new StringDecoder("utf8");
  const chunks: string[] = [];
  let bytes = 0;
  const maximumBytes = options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;

  return new Transform({
    transform(chunk: Buffer | string, encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding as BufferEncoding);
      bytes += buffer.byteLength;
      if (bytes > maximumBytes) {
        callback(new InputLimitError(bytes, maximumBytes, "bytes"));
        return;
      }
      chunks.push(decoder.write(buffer));
      callback();
    },
    flush(callback) {
      try {
        chunks.push(decoder.end());
        const result = optimize(chunks.join(""), options);
        options.onResult?.(result);
        this.push(result.text);
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });
}

const HIGH_SIGNAL_LINE = /\b(?:error|warning|failed?|lost|closed|dead-letter|retrying|acknowledged|status)\b/i;
const REPEATED_MARKER = /\[repeated \d+ times\]$/;

/**
 * Memory-bounded transform for known terminal output. It incrementally applies
 * ANSI removal, whitespace cleanup, and exact consecutive-line deduplication.
 * Unlike createOptimizeTransform(), it intentionally performs no global
 * content detection and no balanced/aggressive context-specific cleaners.
 */
export function createTerminalOptimizeTransform(
  options: TerminalOptimizeTransformOptions = {},
): Transform {
  const decoder = new StringDecoder("utf8");
  const maximumBytes = options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  const maximumLineBytes = options.maxLineBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(maximumLineBytes) || maximumLineBytes <= 0) {
    throw new RangeError("maxLineBytes must be a positive safe integer");
  }

  let pending = "";
  let inputBytes = 0;
  let outputBytes = 0;
  let blankLines = 0;
  let repeatedLine: string | undefined;
  let repeatedEol = "";
  let repeatCount = 0;
  const transformations = { ansi: 0, whitespace: 0, "duplicate-lines": 0 };

  const stream = new Transform({
    transform(chunk: Buffer | string, encoding, callback) {
      try {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding as BufferEncoding);
        inputBytes += buffer.byteLength;
        if (inputBytes > maximumBytes) throw new InputLimitError(inputBytes, maximumBytes, "bytes");
        pending += decoder.write(buffer);
        drainCompleteLines();
        if (Buffer.byteLength(pending) > maximumLineBytes) {
          throw new InputLimitError(Buffer.byteLength(pending), maximumLineBytes, "bytes");
        }
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback) {
      try {
        pending += decoder.end();
        drainCompleteLines();
        if (pending !== "") processLine(pending, "");
        flushRepeat();
        options.onStats?.({ inputBytes, outputBytes, transformations: { ...transformations } });
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });

  function emit(value: string): void {
    outputBytes += Buffer.byteLength(value);
    stream.push(value);
  }

  function flushRepeat(): void {
    if (repeatedLine === undefined) return;
    const marker = ` [repeated ${repeatCount} times]`;
    if (
      repeatCount >= 2 &&
      repeatedLine !== "" &&
      !REPEATED_MARKER.test(repeatedLine) &&
      !HIGH_SIGNAL_LINE.test(repeatedLine) &&
      repeatedLine.length * repeatCount > repeatedLine.length + marker.length
    ) {
      emit(`${repeatedLine}${marker}${repeatedEol}`);
      transformations["duplicate-lines"] += 1;
    } else {
      for (let index = 0; index < repeatCount; index += 1) emit(`${repeatedLine}${repeatedEol}`);
    }
    repeatedLine = undefined;
    repeatedEol = "";
    repeatCount = 0;
  }

  function processLine(rawLine: string, eol: string): void {
    const stripped = stripAnsi(rawLine);
    transformations.ansi += stripped.count;
    let line = stripped.text;
    const trailing = /[\t ]+$/.test(line);
    if (trailing) {
      line = line.replace(/[\t ]+$/, "");
      transformations.whitespace += 1;
    }
    if (!line.includes("|")) {
      line = line.replace(/(?<=\S) {3,}(?=\S)/g, () => {
        transformations.whitespace += 1;
        return " ";
      });
    }

    if (line === "") {
      flushRepeat();
      blankLines += 1;
      if (blankLines <= 1) emit(eol);
      else transformations.whitespace += 1;
      return;
    }
    blankLines = 0;
    if (repeatedLine === line && repeatedEol === eol) {
      repeatCount += 1;
      return;
    }
    flushRepeat();
    repeatedLine = line;
    repeatedEol = eol;
    repeatCount = 1;
  }

  function drainCompleteLines(): void {
    for (;;) {
      const match = /\r?\n/.exec(pending);
      if (!match || match.index === undefined) return;
      const line = pending.slice(0, match.index);
      const eol = match[0];
      pending = pending.slice(match.index + eol.length);
      processLine(line, eol);
    }
  }

  return stream;
}
