import type { ContextMessage } from "../integrations/messages.js";

export interface ProviderUsage { inputTokens: number; outputTokens: number; totalTokens: number; cacheHitTokens: number; cacheMissTokens: number }
export interface ProviderCompletion { id: string; model: string; text: string; usage?: ProviderUsage; raw: unknown }
export interface ProviderAdapter {
  complete(request: { model: string; messages: readonly ContextMessage[]; temperature?: number; maxTokens?: number; responseFormat?: "json" | "text"; thinking?: boolean; signal?: AbortSignal }): Promise<ProviderCompletion>;
}
interface CompatibleResponse {
  id?: string; model?: string; choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number };
}

export interface OpenAICompatibleAdapterOptions {
  baseUrl: string; apiKey: string; fetch?: typeof globalThis.fetch; headers?: Record<string, string>;
  timeoutMilliseconds?: number; maxMessages?: number; maxRequestCharacters?: number; maxErrorBodyCharacters?: number;
}

export function createOpenAICompatibleAdapter(options: OpenAICompatibleAdapterOptions): ProviderAdapter {
  const baseUrl = new URL(options.baseUrl);
  if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") throw new RangeError("baseUrl must use http or https");
  if (options.apiKey.length === 0) throw new RangeError("apiKey must not be empty");
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 30_000;
  const maxMessages = options.maxMessages ?? 10_000;
  const maxRequestCharacters = options.maxRequestCharacters ?? 16 * 1024 * 1024;
  const maxErrorBodyCharacters = options.maxErrorBodyCharacters ?? 500;
  if (!Number.isSafeInteger(timeoutMilliseconds) || timeoutMilliseconds < 1 || timeoutMilliseconds > 300_000) throw new RangeError("timeoutMilliseconds must be 1..300000");
  if (!Number.isSafeInteger(maxMessages) || maxMessages < 1) throw new RangeError("maxMessages must be positive");
  if (!Number.isSafeInteger(maxRequestCharacters) || maxRequestCharacters < 0) throw new RangeError("maxRequestCharacters must be non-negative");
  if (!Number.isSafeInteger(maxErrorBodyCharacters) || maxErrorBodyCharacters < 0) throw new RangeError("maxErrorBodyCharacters must be non-negative");
  const fetcher = options.fetch ?? globalThis.fetch;
  return { async complete(request) {
    if (request.messages.length > maxMessages) throw new RangeError(`provider message count exceeds maximum ${maxMessages}`);
    let requestCharacters = request.model.length;
    for (const message of request.messages) {
      requestCharacters += message.role.length + message.content.length;
      if (!Number.isSafeInteger(requestCharacters) || requestCharacters > maxRequestCharacters) throw new RangeError(`provider request exceeds maximum ${maxRequestCharacters} characters`);
    }
    const controller = new AbortController();
    const abort = (): void => controller.abort(request.signal?.reason);
    if (request.signal?.aborted) abort(); else request.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error(`provider request timed out after ${timeoutMilliseconds}ms`)), timeoutMilliseconds);
    try {
      const response = await fetcher(`${options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST", headers: { ...options.headers, Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ model: request.model, messages: request.messages, temperature: request.temperature, max_tokens: request.maxTokens, response_format: request.responseFormat === "json" ? { type: "json_object" } : undefined, thinking: request.thinking === undefined ? undefined : { type: request.thinking ? "enabled" : "disabled" } }),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, maxErrorBodyCharacters).replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
        throw new Error(`provider request failed with HTTP ${response.status}: ${detail}`);
      }
      const raw = await response.json() as CompatibleResponse; const usage = raw.usage;
      return { id: raw.id ?? "", model: raw.model ?? request.model, text: raw.choices?.[0]?.message?.content ?? "", raw,
        usage: usage ? { inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0, totalTokens: usage.total_tokens ?? 0, cacheHitTokens: usage.prompt_cache_hit_tokens ?? 0, cacheMissTokens: usage.prompt_cache_miss_tokens ?? 0 } : undefined };
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", abort);
    }
  } };
}

export function createDeepSeekAdapter(apiKey: string, fetcher?: typeof globalThis.fetch): ProviderAdapter {
  return createOpenAICompatibleAdapter({ baseUrl: "https://api.deepseek.com", apiKey, fetch: fetcher });
}
