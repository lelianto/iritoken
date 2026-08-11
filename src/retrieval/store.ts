import { createHash } from "node:crypto";

export interface ContextStoreOptions {
  maxEntries?: number;
  maxBytes?: number;
  ttlMilliseconds?: number;
  now?: () => number;
}

interface StoredContext {
  text: string;
  bytes: number;
  expiresAt: number;
}

/** Bounded, content-addressed, in-memory storage for opt-in original retrieval. */
export class ContextStore {
  readonly #entries = new Map<string, StoredContext>();
  readonly #maxEntries: number;
  readonly #maxBytes: number;
  readonly #ttl: number;
  readonly #now: () => number;
  #bytes = 0;

  constructor(options: ContextStoreOptions = {}) {
    this.#maxEntries = options.maxEntries ?? 100;
    this.#maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
    this.#ttl = options.ttlMilliseconds ?? 5 * 60_000;
    this.#now = options.now ?? Date.now;
    if (!Number.isSafeInteger(this.#maxEntries) || this.#maxEntries <= 0) throw new RangeError("maxEntries must be positive");
    if (!Number.isSafeInteger(this.#maxBytes) || this.#maxBytes <= 0) throw new RangeError("maxBytes must be positive");
    if (!Number.isFinite(this.#ttl) || this.#ttl <= 0) throw new RangeError("ttlMilliseconds must be positive");
  }

  put(text: string): string {
    const bytes = Buffer.byteLength(text);
    if (bytes > this.#maxBytes) throw new RangeError("context exceeds store byte limit");
    this.prune();
    const id = createHash("sha256").update(text, "utf8").digest("hex");
    const existing = this.#entries.get(id);
    if (existing) this.#bytes -= existing.bytes;
    this.#entries.delete(id);
    while (this.#entries.size >= this.#maxEntries || this.#bytes + bytes > this.#maxBytes) {
      const oldest = this.#entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.delete(oldest);
    }
    this.#entries.set(id, { text, bytes, expiresAt: this.#now() + this.#ttl });
    this.#bytes += bytes;
    return id;
  }

  get(id: string): string | undefined {
    const entry = this.#entries.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.#now()) {
      this.delete(id);
      return undefined;
    }
    return entry.text;
  }

  delete(id: string): boolean {
    const entry = this.#entries.get(id);
    if (!entry) return false;
    this.#bytes -= entry.bytes;
    return this.#entries.delete(id);
  }

  prune(): number {
    let removed = 0;
    for (const [id, entry] of this.#entries) {
      if (entry.expiresAt <= this.#now()) {
        this.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number { return this.#entries.size; }
  get bytes(): number { return this.#bytes; }
}

