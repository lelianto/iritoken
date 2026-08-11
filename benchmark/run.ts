/**
 * Compression benchmark.
 *
 * For every fixture it measures original vs optimized characters (and an
 * estimated token count) for a preset and writes real measurements to
 * benchmark/results/. Nothing is hard-coded.
 *
 *   npm run benchmark            # balanced preset, table to stdout
 *   npm run benchmark -- safe    # safe preset
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { optimize } from "../src/pipeline/optimize.js";
import { TASKS } from "./tasks/manifest.js";
import { estimateTokens } from "../src/token/counter.js";
import { percentage } from "../src/utils.js";
import type { PresetName } from "../src/types.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES_DIR = join(ROOT, "fixtures");
const RESULTS_DIR = join(ROOT, "results");

export interface FixtureResult {
  fixture: string;
  workload: string;
  preset: PresetName;
  detectionType: string;
  detectionConfidence: string;
  originalCharacters: number;
  optimizedCharacters: number;
  reductionPercentage: number;
  originalTokens: number;
  optimizedTokens: number;
  tokenReductionPercentage: number;
  transformations: Record<string, number>;
  idempotent: boolean;
}

export function loadFixtures(dir = FIXTURES_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .sort();
}

export function runCompression(preset: PresetName, fixtures: string[]): FixtureResult[] {
  const workloads = new Map(TASKS.map((task) => [task.fixture, task.workload]));
  const results: FixtureResult[] = [];
  for (const fixture of fixtures) {
    const input = readFileSync(join(FIXTURES_DIR, fixture), "utf8");
    const once = optimize(input, { preset });
    const twice = optimize(once.text, { preset });
    const originalTokens = estimateTokens(input);
    const optimizedTokens = estimateTokens(once.text);
    results.push({
      fixture: fixture.replace(/\.txt$/, ""),
      workload: workloads.get(fixture) ?? "unclassified",
      preset,
      detectionType: once.stats.detection.type,
      detectionConfidence: once.stats.detection.confidence,
      originalCharacters: once.stats.originalCharacters,
      optimizedCharacters: once.stats.optimizedCharacters,
      reductionPercentage: once.stats.reductionPercentage,
      originalTokens,
      optimizedTokens,
      tokenReductionPercentage: percentage(originalTokens - optimizedTokens, originalTokens),
      transformations: once.stats.transformations,
      idempotent: once.text === twice.text,
    });
  }
  return results;
}

function fmt(n: number): string {
  return n >= 1000 ? n.toLocaleString("en-US") : String(n);
}

export function renderTable(results: FixtureResult[]): string {
  const rows: string[] = [
    "Fixture               Original    Optimized   Reduction",
    "───────────────────── ─────────── ─────────── ─────────",
  ];
  for (const r of results) {
    const name = r.fixture.padEnd(22).slice(0, 22);
    rows.push(
      `${name} ${fmt(r.originalCharacters).padStart(11)} ${fmt(r.optimizedCharacters).padStart(11)} ${r.reductionPercentage.toFixed(1).padStart(6)}%`,
    );
  }
  return rows.join("\n");
}

const preset = (process.argv[2] as PresetName) ?? "balanced";

const fixtureList = loadFixtures();
const results = runCompression(preset, fixtureList);

mkdirSync(RESULTS_DIR, { recursive: true });
const outPath = join(RESULTS_DIR, `compression-${preset}.json`);
writeFileSync(outPath, JSON.stringify({
  schemaVersion: 2,
  methodologyVersion: "semantic-gates-v1",
  generatedAt: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  preset,
  results,
}, null, 2), "utf8");

if (!results.every((r) => r.idempotent)) {
  process.stderr.write("Error: one or more fixtures are not idempotent under optimize().\n");
  process.exitCode = 1;
}

console.log(`iritoken compression benchmark (preset: ${preset})`);
console.log("");
console.log(renderTable(results));
console.log("");
console.log(`Idempotent: ${results.every((r) => r.idempotent)}`);
console.log(`Wrote ${relative(process.cwd(), outPath)}`);
