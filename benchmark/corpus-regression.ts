import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { optimize } from "../src/index.js";
import { TASKS } from "./tasks/manifest.js";
import type { PresetName } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const presets: PresetName[] = ["safe", "balanced", "aggressive"];
let failed = false;

for (const task of TASKS) {
  const original = readFileSync(join(here, "fixtures", task.fixture), "utf8");
  for (const preset of presets) {
    const result = optimize(original, { preset });
    const second = optimize(result.text, { preset });
    const missing = task.verification.mustContain.filter((fact) => !result.text.includes(fact));
    const expanded = result.text.length > original.length;
    const unstable = second.text !== result.text;
    if (missing.length > 0 || expanded || unstable) {
      failed = true;
      process.stderr.write(`${task.name}/${preset}: missing=${missing.join("|") || "none"} expanded=${expanded} idempotent=${!unstable}\n`);
    }
  }
}

if (failed) process.exitCode = 1;
else process.stdout.write(`Corpus regression passed: ${TASKS.length} tasks x ${presets.length} presets.\n`);
