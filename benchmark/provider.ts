/**
 * Provider-neutral quality-benchmark interface.
 *
 * TokenSlim itself never calls an LLM. This interface exists so a quality
 * benchmark can later run the SAME task against ORIGINAL context and
 * OPTIMIZED context through any model (DeepSeek, OpenAI, Anthropic,
 * Gemini, OpenRouter, local models) without coupling TokenSlim to any
 * provider.
 *
 * A minimal implementation could be:
 *
 *   const provider: BenchmarkProvider = {
 *     name: "openrouter:deepseek",
 *     async run(input) {
 *       // POST to the provider, return { text: modelOutput }
 *     },
 *   };
 */

export interface BenchmarkResponse {
  text: string;
}

export interface BenchmarkProvider {
  /**
   * Human-readable provider label, e.g. "deepseek-chat (v3)".
   * Later used in reports to identify which model produced results.
   */
  readonly name: string;

  /**
   * Send one context and return the model's completion.
   * Must never be called from the TokenSlim package itself.
   */
  run(input: string): Promise<BenchmarkResponse>;
}