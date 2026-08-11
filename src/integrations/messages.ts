import { optimize } from "../pipeline/optimize.js";
import type { OptimizeOptions, OptimizeStats } from "../types.js";

export interface ContextMessage {
  role: string;
  content: string;
  [key: string]: unknown;
}

export interface OptimizeMessagesResult<T extends ContextMessage> {
  messages: T[];
  stats: OptimizeStats[];
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
  const optimized = messages.map((message) => {
    if (!allowed.has(message.role)) return { ...message };
    const result = optimize(message.content, options);
    stats.push(result.stats);
    return { ...message, content: result.text };
  });
  return { messages: optimized, stats };
}
