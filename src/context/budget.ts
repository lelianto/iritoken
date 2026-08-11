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
}

export interface BudgetOptions { maxItems?: number }

/** Select required items first, then maximize relevance per token within a hard budget. */
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
  const ordered = measured
    .map((item, index) => ({ item, index }))
    .sort((left, right) =>
      Number(Boolean(right.item.required)) - Number(Boolean(left.item.required))
      || (right.item.score / Math.max(1, right.item.tokens)) - (left.item.score / Math.max(1, left.item.tokens))
      || right.item.score - left.item.score
      || left.index - right.index);
  const selectedIds = new Set<string>();
  let usedTokens = 0;
  for (const { item } of ordered) {
    if (usedTokens + item.tokens > budgetTokens) continue;
    selectedIds.add(item.id);
    usedTokens += item.tokens;
  }
  return {
    selected: measured.filter((item) => selectedIds.has(item.id)),
    omitted: measured.filter((item) => !selectedIds.has(item.id)),
    usedTokens,
    budgetTokens,
  };
}
