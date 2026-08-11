/**
 * Benchmark report generator.
 *
 * Reads the raw measurements produced by `npm run benchmark` from
 * benchmark/results/ and renders a README-ready markdown table. Results are
 * real execution output only — never invented.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FixtureResult } from "./run.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const RESULTS_DIR = join(ROOT, "results");

function loadResults(): FixtureResult[] {
  const files = readdirSync(RESULTS_DIR).filter((f) => f.startsWith("compression-") && f.endsWith(".json"));
  const all: FixtureResult[] = [];
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(RESULTS_DIR, file), "utf8")) as
      | FixtureResult[]
      | { results: FixtureResult[] };
    all.push(...(Array.isArray(parsed) ? parsed : parsed.results));
  }
  return all;
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function renderMarkdown(results: FixtureResult[]): string {
  const byPreset = new Map<string, FixtureResult[]>();
  for (const r of results) {
    const list = byPreset.get(r.preset) ?? [];
    list.push(r);
    byPreset.set(r.preset, list);
  }

  const sections: string[] = [
    "# iritoken compression benchmark",
    "",
    "Generated automatically by `npm run benchmark`. Do not edit by hand.",
    "",
    "> Token counts use the package's documented heuristic (the average of",
    "> `characters / 4` and a word-like count) and are",
    "> labelled estimates. They are NOT exact model token counts.",
    "",
  ];

  let totalOriginal = 0;
  let totalOptimized = 0;
  for (const [preset, list] of byPreset) {
    sections.push(`## preset: ${preset}`, "");
    sections.push(
      "| Fixture | Original (chars) | Optimized (chars) | Reduction | Original (tokens) | Optimized (tokens) | Token reduction |",
    );
    sections.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const r of list) {
      sections.push(
        `| ${r.fixture} | ${r.originalCharacters.toLocaleString("en-US")} | ${r.optimizedCharacters.toLocaleString("en-US")} | ${pct(r.reductionPercentage)} | ${r.originalTokens.toLocaleString("en-US")} | ${r.optimizedTokens.toLocaleString("en-US")} | ${pct(r.tokenReductionPercentage)} |`,
      );
    }
    const totalCharactersReduction =
      (list.reduce((a, r) => a + r.originalCharacters, 0) - list.reduce((a, r) => a + r.optimizedCharacters, 0)) /
      list.reduce((a, r) => a + r.originalCharacters, 0);
    totalOriginal += list.reduce((a, r) => a + r.originalCharacters, 0);
    totalOptimized += list.reduce((a, r) => a + r.optimizedCharacters, 0);
    sections.push("", `**Total for preset: ${preset} — ${pct(totalCharactersReduction * 100)} characters**`, "");
  }

  if (totalOriginal > 0) {
    sections.push(
      "",
      "## Combined",
      "",
      `Total input characters: ${totalOriginal.toLocaleString("en-US")}`,
      `Total optimized characters: ${totalOptimized.toLocaleString("en-US")}`,
      `Overall reduction: ${pct(((totalOriginal - totalOptimized) / totalOriginal) * 100)}`,
      "",
    );
  }

  sections.push("", "## By workload", "");
  sections.push("| Workload | Preset | Original (chars) | Optimized (chars) | Reduction |");
  sections.push("| --- | --- | ---: | ---: | ---: |");
  const workloadGroups = new Map<string, FixtureResult[]>();
  for (const result of results) {
    const key = `${result.workload}\u0000${result.preset}`;
    const list = workloadGroups.get(key) ?? [];
    list.push(result);
    workloadGroups.set(key, list);
  }
  for (const [key, list] of [...workloadGroups].sort(([a], [b]) => a.localeCompare(b))) {
    const [workload = "unclassified", preset = "unknown"] = key.split("\u0000");
    const original = list.reduce((sum, item) => sum + item.originalCharacters, 0);
    const optimized = list.reduce((sum, item) => sum + item.optimizedCharacters, 0);
    sections.push(`| ${workload} | ${preset} | ${original.toLocaleString("en-US")} | ${optimized.toLocaleString("en-US")} | ${pct(((original - optimized) / original) * 100)} |`);
  }

  sections.push(
    "## Methodology",
    "",
    "- Every fixture is a deterministic file in `benchmark/fixtures/`.",
    "- Measurements come from running `optimize()` on the actual fixture. Nothing is hard-coded.",
    "- Idempotence is asserted: `optimize(optimize(x)) === optimize(x)`.",
    "",
  );

  return sections.join("\n");
}

const results = loadResults();
if (results.length === 0) {
  process.stderr.write("No results found. Run `npm run benchmark` first.\n");
  process.exitCode = 1;
} else {
  const markdown = renderMarkdown(results);
  writeFileSync(join(RESULTS_DIR, "REPORT.md"), markdown, "utf8");
  console.log(markdown);
}
