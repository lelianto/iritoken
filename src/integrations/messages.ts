import { optimize } from "../pipeline/optimize.js";
import type { OptimizeOptions, OptimizeStats } from "../types.js";

export interface ContextMessage {
  role: string;
  content: string;
  [key: string]: unknown;
}

export interface OptimizeMessagesResult<T extends ContextMessage> {
  messages: T[];
  /** Legacy ordered stats for optimized messages only. */
  stats: OptimizeStats[];
  messageStats: Array<{ index: number; role: string; stats: OptimizeStats }>;
  totalStats: {
    originalCharacters: number;
    optimizedCharacters: number;
    charactersRemoved: number;
    reductionPercentage: number;
    transformations: Record<string, number>;
  };
}

/**
 * Optimize string message content without mutating the caller's array.
 * System messages are preserved by default because instructions are high signal.
 */
export function optimizeMessages<T extends ContextMessage>(
  messages: readonly T[],
  options?: OptimizeOptions & { roles?: readonly string[] },
): OptimizeMessagesResult<T> {
  const allowed = new Set(options?.roles ?? ["user", "tool"]);
  const stats: OptimizeStats[] = [];
  const messageStats: OptimizeMessagesResult<T>["messageStats"] = [];
  const optimized = messages.map((message, index) => {
    if (!allowed.has(message.role)) return { ...message };
    const result = optimize(message.content, options);
    stats.push(result.stats);
    messageStats.push({ index, role: message.role, stats: result.stats });
    return { ...message, content: result.text };
  });
  const originalCharacters = stats.reduce((total, item) => total + item.originalCharacters, 0);
  const optimizedCharacters = stats.reduce((total, item) => total + item.optimizedCharacters, 0);
  const transformations: Record<string, number> = {};
  for (const item of stats) {
    for (const [name, count] of Object.entries(item.transformations)) {
      transformations[name] = (transformations[name] ?? 0) + count;
    }
  }
  const charactersRemoved = originalCharacters - optimizedCharacters;
  return {
    messages: optimized,
    stats,
    messageStats,
    totalStats: {
      originalCharacters,
      optimizedCharacters,
      charactersRemoved,
      reductionPercentage: originalCharacters === 0
        ? 0
        : Math.round((charactersRemoved / originalCharacters) * 10_000) / 100,
      transformations,
    },
  };
}
