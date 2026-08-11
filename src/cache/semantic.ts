import { cosineSimilarity } from "../retrieval/semantic.js";

interface CacheEntry<T> { key: string; embedding: readonly number[]; value: T; expiresAt: number; createdAt: number }
export interface SemanticCacheHit<T> { key: string; value: T; similarity: number; exact: boolean }

export class SemanticCache<T> {
  readonly #entries = new Map<string, CacheEntry<T>>();
  readonly #threshold: number; readonly #maximum: number; readonly #ttl: number; readonly #now: () => number; readonly #maxDimensions: number;
  #dimension?: number;
  constructor(options: { similarityThreshold?: number; maxEntries?: number; ttlMilliseconds?: number; maxDimensions?: number; now?: () => number } = {}) {
    this.#threshold = options.similarityThreshold ?? 0.95; this.#maximum = options.maxEntries ?? 100; this.#ttl = options.ttlMilliseconds ?? 5 * 60_000; this.#now = options.now ?? Date.now;
    this.#maxDimensions = options.maxDimensions ?? 8192;
    if (this.#threshold < -1 || this.#threshold > 1) throw new RangeError("similarityThreshold must be between -1 and 1");
    if (!Number.isSafeInteger(this.#maximum) || this.#maximum < 1) throw new RangeError("maxEntries must be positive");
    if (!Number.isFinite(this.#ttl) || this.#ttl <= 0) throw new RangeError("ttlMilliseconds must be positive");
    if (!Number.isSafeInteger(this.#maxDimensions) || this.#maxDimensions < 1) throw new RangeError("maxDimensions must be positive");
  }
  set(key: string, embedding: readonly number[], value: T): void {
    this.prune();
    if (embedding.length > this.#maxDimensions) throw new RangeError("embedding exceeds maximum dimensions");
    if (this.#dimension !== undefined && embedding.length !== this.#dimension) throw new RangeError("embedding dimension mismatch");
    cosineSimilarity(embedding, embedding); this.#entries.delete(key);
    this.#dimension ??= embedding.length;
    while (this.#entries.size >= this.#maximum) this.#entries.delete(this.#entries.keys().next().value as string);
    this.#entries.set(key, { key, embedding: [...embedding], value, createdAt: this.#now(), expiresAt: this.#now() + this.#ttl });
  }
  get(key: string, embedding: readonly number[]): SemanticCacheHit<T> | undefined {
    this.prune();
    if (embedding.length > this.#maxDimensions) throw new RangeError("embedding exceeds maximum dimensions");
    if (this.#dimension !== undefined && embedding.length !== this.#dimension) throw new RangeError("embedding dimension mismatch");
    const exact = this.#entries.get(key);
    if (exact) return { key: exact.key, value: exact.value, similarity: 1, exact: true };
    let best: SemanticCacheHit<T> | undefined;
    for (const entry of this.#entries.values()) {
      const similarity = cosineSimilarity(embedding, entry.embedding);
      if (similarity >= this.#threshold && (!best || similarity > best.similarity || (similarity === best.similarity && entry.createdAt > (this.#entries.get(best.key)?.createdAt ?? 0)))) best = { key: entry.key, value: entry.value, similarity, exact: false };
    }
    return best;
  }
  prune(): number { let count = 0; for (const [key, entry] of this.#entries) if (entry.expiresAt <= this.#now()) { this.#entries.delete(key); count += 1; } if (this.#entries.size === 0) this.#dimension = undefined; return count; }
  get size(): number { this.prune(); return this.#entries.size; }
}
