import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { optimize } from "../src/pipeline/optimize.js";
import type { PresetName } from "../src/types.js";

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
    const line = parts.length % 23 === 12 ? "" : pick;
    parts.push(line);
    size += Buffer.byteLength(line) + 1;
  }
  return parts.join("\n");
}

interface Trial {
  inputBytes: number;
  outputBytes: number;
  ms: number;
  peakRssMiB: number;
}

interface PerfResult extends Trial {
  trials: number;
  msPerMiB: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function worker(size: number, preset: PresetName): void {
  const input = generateInput(size, 42);
  global.gc?.();
  const start = performance.now();
  const result = optimize(input, { preset });
  const trial: Trial = {
    inputBytes: Buffer.byteLength(input),
    outputBytes: Buffer.byteLength(result.text),
    ms: performance.now() - start,
    peakRssMiB: process.resourceUsage().maxRSS / 1024,
  };
  process.stdout.write(JSON.stringify(trial));
}

export function runPerformance(preset: PresetName, trialCount = 3): PerfResult[] {
  const script = fileURLToPath(import.meta.url);
  const targets = [10 * 1024, 100 * 1024, 1024 * 1024, 10 * 1024 * 1024];
  return targets.map((size) => {
    const trials: Trial[] = [];
    for (let trial = 0; trial < trialCount; trial += 1) {
      const output = execFileSync(
        process.execPath,
        ["--expose-gc", "--import", "tsx", script, "--worker", String(size), preset],
        { encoding: "utf8", maxBuffer: 1024 * 1024 },
      );
      trials.push(JSON.parse(output) as Trial);
    }
    const inputBytes = median(trials.map((item) => item.inputBytes));
    const ms = median(trials.map((item) => item.ms));
    return {
      inputBytes,
      outputBytes: median(trials.map((item) => item.outputBytes)),
      ms: Math.round(ms * 10) / 10,
      peakRssMiB: Math.round(median(trials.map((item) => item.peakRssMiB)) * 10) / 10,
      trials: trialCount,
      msPerMiB: Math.round((ms / (inputBytes / (1024 * 1024))) * 10) / 10,
    };
  });
}

if (process.argv[2] === "--worker") {
  const size = Number(process.argv[3]);
  const preset = (process.argv[4] ?? "balanced") as PresetName;
  worker(size, preset);
} else {
  const preset = ((process.argv[2] as PresetName | undefined) ?? "balanced") as PresetName;
  const results = runPerformance(preset);
  process.stdout.write(`iritoken isolated performance benchmark (preset: ${preset}, median of 3)\n\n`);
  process.stdout.write("Input          Output         Time    Peak RSS   ms/MiB\n");
  for (const result of results) {
    process.stdout.write(
      `${(result.inputBytes / (1024 * 1024)).toFixed(2).padStart(8)} MiB  ${(result.outputBytes / (1024 * 1024)).toFixed(2).padStart(10)} MiB  ${result.ms.toFixed(1).padStart(7)} ms  ${result.peakRssMiB.toFixed(1).padStart(7)} MiB  ${result.msPerMiB.toFixed(1).padStart(7)}\n`,
    );
  }
  const worst = results.at(-1);
  if (worst && (worst.ms > 10_000 || worst.peakRssMiB > 350)) {
    process.stderr.write("Performance budget exceeded: 10 MiB must stay below 10 s and 350 MiB peak RSS.\n");
    process.exitCode = 1;
  }
}
