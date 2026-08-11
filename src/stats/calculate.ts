import type {
  ContentDetection,
  OptimizeStats,
  TokenCounter,
  TokenStats,
  TransformationChange,
} from "../types.js";
import { percentage } from "../utils.js";

interface CleanedContent {
  text: string;
  changes: TransformationChange[];
  detection: ContentDetection;
}

export function buildStats(
  original: string,
  result: CleanedContent,
  {
    tokenCounter,
    exactTokens,
  }: { tokenCounter?: TokenCounter; exactTokens?: boolean },
): OptimizeStats {
  const originalCharacters = original.length;
  const optimizedCharacters = result.text.length;
  const charactersRemoved = originalCharacters - optimizedCharacters;

  const transformations: Record<string, number> = {};
  for (const change of result.changes) {
    transformations[change.name] = (transformations[change.name] ?? 0) + change.count;
  }

  const stats: OptimizeStats = {
    originalCharacters,
    optimizedCharacters,
    charactersRemoved,
    reductionPercentage: percentage(charactersRemoved, originalCharacters),
    transformations,
    detection: result.detection,
    decisions: [],
  };

  if (tokenCounter) {
    const originalTokens = tokenCounter.count(original);
    const optimizedTokens = tokenCounter.count(result.text);
    const tokensRemoved = originalTokens - optimizedTokens;
    const tokens: TokenStats = {
      originalTokens,
      optimizedTokens,
      tokensRemoved,
      tokenReductionPercentage: percentage(tokensRemoved, originalTokens),
      exact: exactTokens ?? false,
    };
    stats.tokens = tokens;
  }

  return stats;
}
