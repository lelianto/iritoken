import type { TokenCounter } from "../types.js";

export interface BudgetItem<T = unknown> {
  id: string;
  text: string;
  score: number;
  required?: boolean;
  value?: T;
}

export interface BudgetResult<T = unknown> {
  selected: Array<BudgetItem<T> & { tokens: number }>;
  omitted: Array<BudgetItem<T> & { tokens: number }>;
  usedTokens: number;
  budgetTokens: number;
  /** Total tokens occupied by items that the caller marked as required. */
  requiredTokens: number;
  /** Whether every required item can fit inside the requested budget. */
  targetAchievable: boolean;
}

export interface BudgetOptions { maxItems?: number }

/**
 * Retain every required item, then fill remaining space by relevance per token.
 *
 * If required content alone exceeds the requested budget, the result deliberately
 * exceeds that budget and reports `targetAchievable: false`. Required information
 * is never discarded merely to satisfy a numeric compression target.
 */
export function fitTokenBudget<T>(
  items: readonly BudgetItem<T>[],
  budgetTokens: number,
  counter: TokenCounter,
  options: BudgetOptions = {},
): BudgetResult<T> {
  if (!Number.isSafeInteger(budgetTokens) || budgetTokens < 0) {
    throw new RangeError("budgetTokens must be a non-negative safe integer");
  }
  const maximumItems = options.maxItems ?? 10_000;
  if (!Number.isSafeInteger(maximumItems) || maximumItems < 1) throw new RangeError("maxItems must be a positive safe integer");
  if (items.length > maximumItems) throw new RangeError(`budget item count exceeds maximum ${maximumItems}`);
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new RangeError("duplicate budget item id");
    if (!Number.isFinite(item.score)) throw new RangeError("budget item scores must be finite");
    ids.add(item.id);
  }
  const measured = items.map((item) => ({ ...item, tokens: counter.count(item.text) }));
  if (measured.some((item) => !Number.isSafeInteger(item.tokens) || item.tokens < 0)) {
    throw new RangeError("token counter must return non-negative safe integers");
  }
  const required = measured.filter((item) => item.required);
  const optional = measured.filter((item) => !item.required);
  const requiredTokens = required.reduce((total, item) => total + item.tokens, 0);
  if (!Number.isSafeInteger(requiredTokens)) {
    throw new RangeError("required token total exceeds the safe integer range");
  }
  const targetAchievable = requiredTokens <= budgetTokens;
  const ordered = optional
    .map((item, index) => ({ item, index }))
    .sort((left, right) =>
      (right.item.score / Math.max(1, right.item.tokens)) - (left.item.score / Math.max(1, left.item.tokens))
      || right.item.score - left.item.score
      || left.index - right.index);
  const selectedIds = new Set(required.map((item) => item.id));
  let usedTokens = requiredTokens;
  if (targetAchievable) {
    for (const { item } of ordered) {
      if (usedTokens + item.tokens > budgetTokens) continue;
      selectedIds.add(item.id);
      usedTokens += item.tokens;
    }
  }
  return {
    selected: measured.filter((item) => selectedIds.has(item.id)),
    omitted: measured.filter((item) => !selectedIds.has(item.id)),
    usedTokens,
    budgetTokens,
    requiredTokens,
    targetAchievable,
  };
}
