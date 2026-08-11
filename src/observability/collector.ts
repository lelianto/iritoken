export interface Observation { name: string; value: number; attributes: Readonly<Record<string, string | number | boolean>>; timestamp: number }
export interface ObservationExporter { export(observations: readonly Observation[]): void | Promise<void> }
export interface MetricsCollectorOptions { now?: () => number; maxObservations?: number; maxAttributes?: number; maxStringCharacters?: number }
export class MetricsCollector {
  readonly #observations: Observation[] = []; readonly #now: () => number; readonly #maximum: number; readonly #maxAttributes: number; readonly #maxStringCharacters: number;
  constructor(nowOrOptions: (() => number) | MetricsCollectorOptions = {}) {
    const options = typeof nowOrOptions === "function" ? { now: nowOrOptions } : nowOrOptions;
    this.#now = options.now ?? Date.now; this.#maximum = options.maxObservations ?? 10_000; this.#maxAttributes = options.maxAttributes ?? 32; this.#maxStringCharacters = options.maxStringCharacters ?? 1024;
    if (!Number.isSafeInteger(this.#maximum) || this.#maximum < 1) throw new RangeError("maxObservations must be positive");
    if (!Number.isSafeInteger(this.#maxAttributes) || this.#maxAttributes < 0) throw new RangeError("maxAttributes must be non-negative");
    if (!Number.isSafeInteger(this.#maxStringCharacters) || this.#maxStringCharacters < 1) throw new RangeError("maxStringCharacters must be positive");
  }
  record(name: string, value: number, attributes: Record<string, string | number | boolean> = {}): void {
    if (!Number.isFinite(value)) throw new RangeError("metric value must be finite");
    if (name.length === 0 || name.length > this.#maxStringCharacters) throw new RangeError("metric name length is invalid");
    const entries = Object.entries(attributes);
    if (entries.length > this.#maxAttributes) throw new RangeError("metric attribute count exceeds maximum");
    if (entries.some(([key, item]) => key.length > this.#maxStringCharacters || (typeof item === "string" && item.length > this.#maxStringCharacters))) throw new RangeError("metric attribute length exceeds maximum");
    if (this.#observations.length >= this.#maximum) throw new RangeError("metric observation limit reached; flush before recording more");
    this.#observations.push({ name, value, attributes: { ...attributes }, timestamp: this.#now() });
  }
  snapshot(): readonly Observation[] { return this.#observations.map((item) => ({ ...item, attributes: { ...item.attributes } })); }
  async flush(exporter: ObservationExporter): Promise<number> { const snapshot = this.snapshot(); await exporter.export(snapshot); this.#observations.length = 0; return snapshot.length; }
  get size(): number { return this.#observations.length; }
}
