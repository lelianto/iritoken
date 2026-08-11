import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { optimize } from "./pipeline/optimize.js";
import { DEFAULT_MAX_INPUT_BYTES, InputLimitError } from "./security.js";
import type { OptimizeOptions, OptimizeResult } from "./types.js";

export interface OptimizeTransformOptions extends OptimizeOptions {
  maxInputBytes?: number;
  onResult?: (result: Readonly<OptimizeResult>) => void;
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
