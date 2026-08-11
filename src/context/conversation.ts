import { optimize } from "../pipeline/optimize.js";
import type { ContextMessage } from "../integrations/messages.js";
import type { OptimizeOptions, TokenCounter } from "../types.js";
import { DEFAULT_MAX_INPUT_CHARACTERS, InputLimitError } from "../security.js";
import { fitTokenBudget } from "./budget.js";
import { rankContext } from "./ranking.js";

export interface CompactConversationOptions extends OptimizeOptions {
  tokenCounter: TokenCounter;
  budgetTokens: number;
  query?: string;
  preserveRoles?: readonly string[];
  keepRecent?: number;
  maxMessages?: number;
  maxTotalCharacters?: number;
}
export interface CompactConversationResult<T extends ContextMessage> {
  messages: T[];
  omittedIndices: number[];
  originalTokens: number;
  compactedTokens: number;
  budgetTokens: number;
}

/** Compress message bodies, rank history, and omit low-value turns to meet a hard token budget. */
export function compactConversation<T extends ContextMessage>(
  messages: readonly T[], options: CompactConversationOptions,
): CompactConversationResult<T> {
  const { tokenCounter, budgetTokens, query = messages.at(-1)?.content ?? "", preserveRoles = ["system"], keepRecent = 2, maxMessages = 1000, maxTotalCharacters = DEFAULT_MAX_INPUT_CHARACTERS, ...optimizeOptions } = options;
  if (!Number.isSafeInteger(keepRecent) || keepRecent < 0) throw new RangeError("keepRecent must be a non-negative safe integer");
  if (!Number.isSafeInteger(maxMessages) || maxMessages < 1) throw new RangeError("maxMessages must be a positive safe integer");
  if (!Number.isSafeInteger(maxTotalCharacters) || maxTotalCharacters < 0) throw new RangeError("maxTotalCharacters must be a non-negative safe integer");
  if (messages.length > maxMessages) throw new RangeError(`message count exceeds maximum ${maxMessages}`);
  let totalCharacters = query.length;
  for (const message of messages) {
    totalCharacters += message.content.length;
    if (!Number.isSafeInteger(totalCharacters) || totalCharacters > maxTotalCharacters) throw new InputLimitError(totalCharacters, maxTotalCharacters, "characters");
  }
  const ranked = rankContext(query, messages.map((message, index) => ({ id: String(index), text: message.content, priority: preserveRoles.includes(message.role) ? 1 : undefined, timestamp: index })), { maxCandidates: maxMessages, maxTotalCharacters });
  const scores = new Map(ranked.map((item) => [Number(item.id), item.score]));
  const recentStart = Math.max(0, messages.length - keepRecent);
  const optimized = messages.map((message) => ({ ...message, content: preserveRoles.includes(message.role) ? message.content : optimize(message.content, optimizeOptions).text }));
  const fitted = fitTokenBudget(optimized.map((message, index) => ({
    id: String(index), text: message.content, score: scores.get(index) ?? 0,
    required: preserveRoles.includes(message.role) || index >= recentStart, value: { message, index },
  })), budgetTokens, tokenCounter);
  const selected = new Set(fitted.selected.map((item) => Number(item.id)));
  return {
    messages: optimized.filter((_message, index) => selected.has(index)),
    omittedIndices: optimized.map((_message, index) => index).filter((index) => !selected.has(index)),
    originalTokens: messages.reduce((total, message) => total + tokenCounter.count(message.content), 0),
    compactedTokens: fitted.usedTokens, budgetTokens,
  };
}
