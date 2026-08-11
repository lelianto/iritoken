import { optimize } from "./optimize.js";
import type {
  OptimizeOptions,
  OptimizeSegmentsResult,
  OptimizationDecision,
} from "../types.js";

const TERMINAL_LANGUAGES = new Set([
  "console",
  "console-output",
  "shell-session",
  "terminal",
  "terminal-output",
]);

interface Fence {
  start: number;
  contentStart: number;
  contentEnd: number;
  end: number;
  language: string;
}

function findFences(markdown: string): Fence[] {
  const lines = [...markdown.matchAll(/^([ \t]{0,3})(`{3,}|~{3,})[ \t]*([\w-]*)[^\r\n]*(?:\r?\n|$)/gm)];
  const fences: Fence[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const opening = lines[index];
    if (!opening || opening.index === undefined) continue;
    const marker = opening[2] ?? "";
    for (let closingIndex = index + 1; closingIndex < lines.length; closingIndex += 1) {
      const closing = lines[closingIndex];
      if (!closing || closing.index === undefined) continue;
      const closingMarker = closing[2] ?? "";
      const closingLanguage = closing[3] ?? "";
      if (closingLanguage || closingMarker[0] !== marker[0] || closingMarker.length < marker.length) continue;
      fences.push({
        start: opening.index,
        contentStart: opening.index + opening[0].length,
        contentEnd: closing.index,
        end: closing.index + closing[0].length,
        language: (opening[3] ?? "").toLowerCase(),
      });
      index = closingIndex;
      break;
    }
  }
  return fences;
}

/**
 * Optimize only fenced blocks explicitly labelled as terminal output. All prose,
 * fence markers, and other code blocks are preserved byte-for-byte.
 */
export function optimizeSegments(
  markdown: string,
  options: OptimizeOptions = {},
): OptimizeSegmentsResult {
  const fences = findFences(markdown);
  const parts: string[] = [];
  const segments: OptimizeSegmentsResult["segments"] = [];
  const transformations: Record<string, number> = {};
  let cursor = 0;
  let segmentsOptimized = 0;

  for (const fence of fences) {
    parts.push(markdown.slice(cursor, fence.contentStart));
    const original = markdown.slice(fence.contentStart, fence.contentEnd);
    if (!TERMINAL_LANGUAGES.has(fence.language)) {
      parts.push(original);
    } else {
      const result = optimize(original, options);
      parts.push(result.text);
      const changed = result.text !== original;
      if (changed) segmentsOptimized += 1;
      for (const [name, count] of Object.entries(result.stats.transformations)) {
        transformations[name] = (transformations[name] ?? 0) + count;
      }
      segments.push({
        index: segments.length,
        language: fence.language,
        changed,
        originalCharacters: original.length,
        optimizedCharacters: result.text.length,
      });
    }
    cursor = fence.contentEnd;
  }
  parts.push(markdown.slice(cursor));
  const text = parts.join("");
  const baseline = optimize(markdown, {
    ...options,
    cleaners: {
      ansi: false, whitespace: false, duplicateLines: false,
      stackTrace: false, testOutput: false, repeatedBlocks: false,
    },
  });
  const decisions: OptimizationDecision[] = baseline.stats.decisions.map((decision) => {
    const changes = transformations[decision.cleaner] ?? 0;
    return { ...decision, changes, reason: changes > 0 ? "applied" : decision.reason };
  });
  const removed = markdown.length - text.length;
  return {
    text,
    segmentsFound: fences.length,
    segmentsOptimized,
    segments,
    stats: {
      ...baseline.stats,
      originalCharacters: markdown.length,
      optimizedCharacters: text.length,
      charactersRemoved: removed,
      reductionPercentage: markdown.length === 0 ? 0 : (removed / markdown.length) * 100,
      transformations,
      decisions,
    },
  };
}
