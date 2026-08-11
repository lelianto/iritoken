import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "../src/detectors/content-type.js";

const here = dirname(fileURLToPath(import.meta.url));

const labelled = [
  ["repetitive-logs.txt", true],
  ["npm-install.txt", true],
  ["docker-build.txt", true],
  // Column alignment is meaningful here, so this must not enter the shared
  // high-confidence path until whitespace handling becomes table-aware.
  ["kubernetes-events.txt", false],
  ["repeated-source-code.txt", false],
  ["repeated-instructions.txt", false],
  ["mixed-agent-context.txt", false],
  ["jest-output.txt", false],
] as const;

let truePositive = 0;
let trueNegative = 0;
let falsePositive = 0;
let falseNegative = 0;

for (const [fixture, expectedEligible] of labelled) {
  const text = readFileSync(join(here, "fixtures", fixture), "utf8");
  const detection = classify(text);
  const actualEligible =
    detection.type === "generic-terminal-output" && detection.confidence === "high";
  if (actualEligible && expectedEligible) truePositive += 1;
  else if (!actualEligible && !expectedEligible) trueNegative += 1;
  else if (actualEligible) falsePositive += 1;
  else falseNegative += 1;
  process.stdout.write(
    `${fixture}: expected=${expectedEligible} actual=${actualEligible} detection=${detection.type}/${detection.confidence}\n`,
  );
}

const positiveCount = truePositive + falseNegative;
const negativeCount = trueNegative + falsePositive;
const recall = positiveCount === 0 ? 0 : truePositive / positiveCount;
const specificity = negativeCount === 0 ? 0 : trueNegative / negativeCount;

process.stdout.write(
  `Terminal eligibility: recall=${(recall * 100).toFixed(1)}% specificity=${(specificity * 100).toFixed(1)}% TP=${truePositive} TN=${trueNegative} FP=${falsePositive} FN=${falseNegative}\n`,
);

if (falsePositive > 0 || falseNegative > 0) process.exitCode = 1;
