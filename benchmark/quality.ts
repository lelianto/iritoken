/**
 * Quality benchmark (deterministic verification).
 *
 * For every task defined in benchmark/tasks/ this runs the SAME verification
 * against (a) the ORIGINAL context and (b) the iritoken-optimized context.
 * A task succeeds only when every required fact survives.
 *
 * This is an information-preservation proxy: it answers "did optimizing the
 * context remove facts that a task needs?". When a real `BenchmarkProvider`
 * is plugged in later, the identical runner can instead execute
 *   ORIGINAL CONTEXT -> LLM -> RESULT A
 *   OPTIMIZED CONTEXT -> LLM -> RESULT B
 * and compare task success directly. No paid API is called here.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { optimize } from "../src/pipeline/optimize.js";
import { estimateTokens } from "../src/token/counter.js";
import { TASKS } from "./tasks/manifest.js";
import type { BenchmarkTask } from "./tasks/manifest.js";
import type { PresetName } from "../src/types.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES_DIR = join(ROOT, "fixtures");
const RESULTS_DIR = join(ROOT, "results");

export interface Verdict {
  task: string;
  success: boolean;
  missingFacts: string[];
  leftoverNoise: string[];
  inputTokens: number;
}

export function verifyTask(task: BenchmarkTask, context: string): Verdict {
  const missingFacts = task.verification.mustContain.filter((fact) => !context.includes(fact));
  const leftoverNoise =
    (task.verification.mustNotContain ?? []).filter((noise) => context.includes(noise));
  return {
    task: task.name,
    success: missingFacts.length === 0 && leftoverNoise.length === 0,
    missingFacts,
    leftoverNoise,
    inputTokens: estimateTokens(context),
  };
}

function renderVerdicts(label: string, verdicts: Verdict[]): string {
  const ok = verdicts.filter((v) => v.success).length;
  const totalTokens = verdicts.reduce((a, v) => a + v.inputTokens, 0);
  const rate = (ok / verdicts.length) * 100;
  return [
    label,
    `Input tokens (est.):      ${totalTokens.toLocaleString("en-US")}`,
    `Success:                  ${ok}/${verdicts.length}`,
    `Success rate:             ${rate.toFixed(1)}%`,
    "",
  ].join("\n");
}

const preset = ((process.argv[2] as PresetName | undefined) ?? "balanced") as PresetName;

const baseline: Verdict[] = [];
const optimized: Verdict[] = [];

for (const task of TASKS) {
  const context = readFileSync(join(FIXTURES_DIR, task.fixture), "utf8");
  baseline.push(verifyTask(task, context));
  const result = optimize(context, { preset });
  optimized.push(verifyTask(task, result.text));
}

for (const verdict of optimized) {
  if (!verdict.success) {
    process.stderr.write(
      `Warning: task "${verdict.task}" lost facts (${verdict.missingFacts.join(", ")})\n`,
    );
  }
}

mkdirSync(RESULTS_DIR, { recursive: true });
writeFileSync(join(RESULTS_DIR, "quality.json"), JSON.stringify({ preset, baseline, optimized }, null, 2), "utf8");

const baselineOk = baseline.filter((v) => v.success).length;
const optimizedOk = optimized.filter((v) => v.success).length;
const baselineTokens = baseline.reduce((a, v) => a + v.inputTokens, 0);
const optimizedTokens = optimized.reduce((a, v) => a + v.inputTokens, 0);
const regressionPp =
  (baselineOk / baseline.length) * 100 - (optimizedOk / optimized.length) * 100;

console.log(`iritoken quality benchmark (preset: ${preset})`);
console.log("");
console.log("Baseline");
console.log(renderVerdicts("", baseline).trimStart());
console.log("iritoken");
console.log(renderVerdicts("", optimized).trimStart());
console.log(
  [
    `Token reduction (est.):   ${((1 - optimizedTokens / baselineTokens) * 100).toFixed(1)}%`,
    `Success regression:       ${regressionPp.toFixed(0)}pp`,
    "Verification:             deterministic (information preservation)",
    "Provider:                 none (no model called)",
    "",
  ].join("\n"),
);