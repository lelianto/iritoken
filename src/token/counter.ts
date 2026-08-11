import type { TokenCounter } from "../types.js";

/**
 * Optional token measurement layer.
 *
 * iritoken never guesses model-specific token counts. When the caller
 * supplies a real tokenizer, stats include token figures marked exact.
 *
 * `estimateTokens` is a rough, documented heuristic (chars / 4 averaged
 * with a word-ish count) used ONLY for the CLI display and the benchmark
 * table. It is explicitly flagged as an estimate and never presented as
 * exact model savings.
 */

export const DEFAULT_ESTIMATE_NAME = "char/4 heuristic";

export function estimateTokens(text: string): number {
  if (text === "") return 0;
  const byChars = text.length / 4;
  const byWords = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((byChars + byWords) / 2));
}

export function createCounter(count: (text: string) => number): TokenCounter {
  return { count };
}

export function sumCounts(counter: TokenCounter, texts: string[]): number {
  let total = 0;
  for (const t of texts) total += counter.count(t);
  return total;
}