import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const input = process.env.IRITOKEN_INPUT;
const output = process.env.IRITOKEN_OUTPUT || "iritoken-output.txt";
if (!input) throw new Error("input is required");
const args = [
  "--yes", "iritoken@0.4.0", input,
  "--output", output,
  "--preset", process.env.IRITOKEN_PRESET || "balanced",
  "--check", "--min-reduction", process.env.IRITOKEN_MIN_REDUCTION || "0",
  "--json-version", "2",
];
if (process.env.IRITOKEN_MAX_OUTPUT_BYTES) args.push("--max-output-bytes", process.env.IRITOKEN_MAX_OUTPUT_BYTES);
if (process.env.IRITOKEN_REQUIRE_DETECTION) args.push("--require-detection", process.env.IRITOKEN_REQUIRE_DETECTION);
if (process.env.IRITOKEN_SEGMENTS === "true") args.push("--segments");
const command = process.env.IRITOKEN_NPX || "npx";
const run = spawnSync(command, args, { encoding: "utf8" });
let result;
try { result = JSON.parse(run.stdout); } catch { process.stderr.write(run.stderr || run.stdout); process.exit(2); }
const outputs = [
  `passed=${result.policy.passed}`,
  `reduction-percentage=${result.stats.reductionPercentage}`,
  `optimized-bytes=${result.bytes.optimized}`,
].join("\n") + "\n";
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, outputs);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    "## iritoken context policy", "",
    `- Result: **${result.policy.passed ? "PASS" : "FAIL"}**`,
    `- Reduction: ${result.stats.reductionPercentage.toFixed(2)}%`,
    `- Output: ${result.bytes.optimized} bytes`,
    `- Detection: ${result.stats.detection.type} (${result.stats.detection.confidence})`,
    ...(result.policy.failures.length ? ["", ...result.policy.failures.map((failure) => `- ${failure}`)] : []),
    "",
  ].join("\n"));
}
if (!result.policy.passed) {
  process.stderr.write(`iritoken policy failed: ${result.policy.failures.join("; ")}\n`);
  process.exit(1);
}
