export interface SemanticDocument<T = unknown> {
  id: string;
  text: string;
  embedding: readonly number[];
  value?: T;
}

export interface SemanticMatch<T = unknown> extends SemanticDocument<T> { similarity: number }
export interface SemanticIndexOptions { maxEntries?: number; maxDimensions?: number; maxTextCharacters?: number }

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) throw new RangeError("embeddings must have the same non-zero dimension");
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] as number; const b = right[index] as number;
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new RangeError("embeddings must contain finite numbers");
    dot += a * b; leftNorm += a * a; rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export class SemanticIndex<T = unknown> {
  readonly #documents = new Map<string, SemanticDocument<T>>();
  readonly #maxEntries: number; readonly #maxDimensions: number; readonly #maxTextCharacters: number;
  #dimension?: number;

  constructor(options: SemanticIndexOptions = {}) {
    this.#maxEntries = options.maxEntries ?? 10_000;
    this.#maxDimensions = options.maxDimensions ?? 8192;
    this.#maxTextCharacters = options.maxTextCharacters ?? 1024 * 1024;
    if (!Number.isSafeInteger(this.#maxEntries) || this.#maxEntries < 1) throw new RangeError("maxEntries must be positive");
    if (!Number.isSafeInteger(this.#maxDimensions) || this.#maxDimensions < 1) throw new RangeError("maxDimensions must be positive");
    if (!Number.isSafeInteger(this.#maxTextCharacters) || this.#maxTextCharacters < 0) throw new RangeError("maxTextCharacters must be non-negative");
  }

  upsert(document: SemanticDocument<T>): void {
    if (document.embedding.length === 0) throw new RangeError("embedding must not be empty");
    if (document.embedding.length > this.#maxDimensions) throw new RangeError("embedding exceeds maximum dimensions");
    if (document.text.length > this.#maxTextCharacters) throw new RangeError("document text exceeds maximum characters");
    if (!this.#documents.has(document.id) && this.#documents.size >= this.#maxEntries) throw new RangeError("semantic index entry limit reached");
    if (this.#dimension !== undefined && document.embedding.length !== this.#dimension) throw new RangeError("embedding dimension mismatch");
    cosineSimilarity(document.embedding, document.embedding);
    this.#dimension ??= document.embedding.length;
    this.#documents.set(document.id, { ...document, embedding: [...document.embedding] });
  }

  search(embedding: readonly number[], options: { limit?: number; minimumSimilarity?: number } = {}): SemanticMatch<T>[] {
    const limit = options.limit ?? 5;
    const minimum = options.minimumSimilarity ?? -1;
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("limit must be a positive safe integer");
    if (!Number.isFinite(minimum) || minimum < -1 || minimum > 1) throw new RangeError("minimumSimilarity must be between -1 and 1");
    if (embedding.length > this.#maxDimensions) throw new RangeError("embedding exceeds maximum dimensions");
    return [...this.#documents.values()]
      .map((document) => ({ ...document, similarity: cosineSimilarity(embedding, document.embedding) }))
      .filter((document) => document.similarity >= minimum)
      .sort((left, right) => right.similarity - left.similarity || left.id.localeCompare(right.id))
      .slice(0, limit);
  }

  delete(id: string): boolean { return this.#documents.delete(id); }
  get size(): number { return this.#documents.size; }
}
