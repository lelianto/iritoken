import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SemanticIndex, fitTokenBudget, rankContext } from "../src/index.js";

interface Trial { entries: number; milliseconds: number; peakRssMiB: number; topId: string; selected: number }
interface Result extends Trial { trials: number }
const DIMENSIONS = 64;

function embedding(index: number): number[] {
  return Array.from({ length: DIMENSIONS }, (_value, dimension) =>
    ((index * 31 + dimension * 17) % 101) / 100 + (dimension === 0 ? index * 1e-6 : 0));
}

function worker(entries: number): void {
  const candidates = Array.from({ length: entries }, (_value, index) => ({
    id: `context-${index}`,
    text: `Synthetic context ${index}: amber planet database timeout evidence group ${index % 97}`,
    priority: (index % 10) / 10,
    timestamp: 1_000_000 - index,
  }));
  global.gc?.();
  const start = performance.now();
  const ranked = rankContext("amber database timeout", candidates, { now: 1_000_000, maxCandidates: entries, maxTotalCharacters: 32 * 1024 * 1024 });
  const budget = fitTokenBudget(ranked.map((item) => ({ id: item.id, text: item.text, score: item.score })), Math.max(100, Math.floor(entries / 4)), { count: (text) => text.split(/\s+/).length }, { maxItems: entries });
  const index = new SemanticIndex({ maxEntries: entries, maxDimensions: DIMENSIONS });
  for (let item = 0; item < entries; item += 1) index.upsert({ id: `doc-${item}`, text: `Synthetic document ${item}`, embedding: embedding(item) });
  const matches = index.search(embedding(7), { limit: 5, minimumSimilarity: -1 });
  const result: Trial = { entries, milliseconds: performance.now() - start, peakRssMiB: process.resourceUsage().maxRSS / 1024, topId: matches[0]?.id ?? "", selected: budget.selected.length };
  process.stdout.write(JSON.stringify(result));
}

function median(values: number[]): number { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; }

if (process.argv[2] === "--worker") worker(Number(process.argv[3]));
else {
  const script = fileURLToPath(import.meta.url); const results: Result[] = [];
  for (const entries of [100, 1000, 10_000]) {
    const trials: Trial[] = [];
    for (let trial = 0; trial < 3; trial += 1) {
      trials.push(JSON.parse(execFileSync(process.execPath, ["--expose-gc", "--import", "tsx", script, "--worker", String(entries)], { encoding: "utf8", maxBuffer: 1024 * 1024 })) as Trial);
    }
    results.push({ entries, milliseconds: Math.round(median(trials.map((item) => item.milliseconds)) * 10) / 10, peakRssMiB: Math.round(median(trials.map((item) => item.peakRssMiB)) * 10) / 10, topId: trials[0]?.topId ?? "", selected: Math.round(median(trials.map((item) => item.selected))), trials: 3 });
  }
  const worst = results.at(-1); const passed = Boolean(worst && worst.milliseconds <= 3000 && worst.peakRssMiB <= 350 && worst.topId === "doc-7");
  process.stdout.write("Context engine benchmark: isolated median of 3\n");
  for (const result of results) process.stdout.write(`${String(result.entries).padStart(6)} entries: ${result.milliseconds.toFixed(1).padStart(7)} ms, peak RSS ${result.peakRssMiB.toFixed(1)} MiB, selected ${result.selected}\n`);
  writeFileSync(join(dirname(script), "results", "context-performance.json"), `${JSON.stringify({ schemaVersion: 1, methodologyVersion: "context-engine-isolated-v1", generatedAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, arch: process.arch }, dimensions: DIMENSIONS, results, budget: { entries: 10_000, maxMilliseconds: 3000, maxPeakRssMiB: 350 }, passed }, null, 2)}\n`);
  if (!passed) { process.stderr.write("Context engine performance budget exceeded.\n"); process.exitCode = 1; }
}
