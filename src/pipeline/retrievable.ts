import { optimize } from "./optimize.js";
import { ContextStore } from "../retrieval/store.js";
import type { OptimizeOptions, OptimizeResult } from "../types.js";

export interface RetrievableOptimizeResult extends OptimizeResult {
  originalReference?: string;
}

export function optimizeRetrievable(
  input: string,
  store: ContextStore,
  options: OptimizeOptions = {},
): RetrievableOptimizeResult {
  const result = optimize(input, options);
  return result.text === input ? result : { ...result, originalReference: store.put(input) };
}

