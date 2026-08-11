/**
 * Performance benchmark.
 *
 * Measures TokenSlim's own processing cost on deterministic inputs of
 * increasing size (10 KB, 100 KB, 1 MB, 10 MB) to catch accidental O(n²)
 * behaviour. Runtime memory and processing time are measured from actual
 * execution; inputs come from a seeded generator so runs are reproducible.
 */

import { optimize } from "../src/pipeline/optimize.js";
import type { PresetName } from "../src/types.js";

/** Deterministic PRNG (mulberry32) so generated inputs are reproducible. */
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BITS = [
  "\x1b[31merror\x1b[0m something failed",
  "    at run (src/worker/run.ts:17:9)",
  "✓ src/utils/math.test.ts (1) 2ms",
  "connecting to queue at localhost:5672",
  "integration step completed successfully",
  "  Sample log line with timestamp and level",
  "plain line without any repeated content",
  "\x1b[90m[debug]\x1b[0m resolved module alias #alias/core",
];

function generateInput(targetBytes: number, seed: number): string {
  const rand = makeRng(seed);
  const parts: string[] = [];
  let size = 0;
  while (size < targetBytes) {
    const pick = BITS[Math.floor(rand() * BITS.length)] ?? "plain line";
    const line = parts.length % 23 === 12 ? "" : pick; // periodic blank lines
    parts.push(line);
    size += line.length + 1;
  }
  return parts.join("\n");
}

interface PerfResult {
  inputBytes: number;
  ms: number;
  mib: number;
  msPerMiB: number;
  outputBytes: number;
}

export function runPerformance(preset: PresetName): PerfResult[] {
  const results: PerfResult[] = [];
  const targets = [10 * 1024, 100 * 1024, 1024 * 1024, 10 * 1024 * 1024];
  for (const size of targets) {
    const input = generateInput(size, 42);
    const before = process.memoryUsage().heapUsed;
    const start = performance.now();
    const result = optimize(input, { preset });
    const ms = performance.now() - start;
    const after = process.memoryUsage().heapUsed;
    results.push({
      inputBytes: input.length,
      ms: Math.round(ms * 10) / 10,
      mib: Math.round((after - before) / (1024 * 1024) * 10) / 10,
      msPerMiB: Math.round((ms / (input.length / (1024 * 1024))) * 10) / 10,
      outputBytes: result.text.length,
    });
  }
  return results;
}

const preset = ((process.argv[2] as PresetName | undefined) ?? "balanced") as PresetName;
const results = runPerformance(preset);

console.log(`TokenSlim performance benchmark (preset: ${preset})`);
console.log("");
console.log("Input          Output         Time     Δheap    ms/MiB");
for (const r of results) {
  console.log(
    `${(r.inputBytes / (1024 * 1024)).toFixed(2).padStart(8)} MiB  ${(r.outputBytes / (1024 * 1024)).toFixed(2).padStart(10)} MiB  ${r.ms.toFixed(1).padStart(7)} ms  ${r.mib.toFixed(1).padStart(6)} MiB  ${r.msPerMiB.toFixed(1).padStart(7)}`,
  );
}

const worst = results[results.length - 1];
if (worst && worst.ms > 10000) {
  process.stderr.write("Warning: 10MB input took longer than 10s — possible O(n²) regression.\n");
  process.exitCode = 1;
}
