import { createHash } from "node:crypto";
import type { ContextMessage } from "../integrations/messages.js";

export interface CacheAwarePrompt<T extends ContextMessage> { messages: T[]; stablePrefixMessages: number; prefixSha256: string }

/** Put reusable content first so prefix-based provider caches can match it. */
export function prepareCacheAwarePrompt<T extends ContextMessage>(stablePrefix: readonly T[], dynamicSuffix: readonly T[]): CacheAwarePrompt<T> {
  const messages = [...stablePrefix.map((message) => ({ ...message })), ...dynamicSuffix.map((message) => ({ ...message }))];
  const canonicalPrefix = stablePrefix.map((message) => JSON.stringify([message.role, message.content])).join("\n");
  return { messages, stablePrefixMessages: stablePrefix.length, prefixSha256: createHash("sha256").update(canonicalPrefix).digest("hex") };
}

export function cacheHitPercentage(usage: { cacheHitTokens: number; cacheMissTokens: number }): number {
  const total = usage.cacheHitTokens + usage.cacheMissTokens;
  return total === 0 ? 0 : Math.round((usage.cacheHitTokens / total) * 10_000) / 100;
}
