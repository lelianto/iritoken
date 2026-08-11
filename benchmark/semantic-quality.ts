import assert from "node:assert/strict";
import ts from "typescript";
import { optimize } from "../src/pipeline/optimize.js";
import type { PresetName } from "../src/types.js";

interface SemanticCase {
  name: string;
  workload: string;
  input: string;
  allowedTransformations: readonly string[];
  validate(original: string, optimized: string): void;
}

const exact = (original: string, optimized: string) => assert.equal(optimized, original);

const cases: SemanticCase[] = [
  {
    name: "json-value-equivalence",
    workload: "structured-data",
    input: JSON.stringify({ entries: ["same", "same", "same"], nested: { enabled: true } }, null, 2),
    allowedTransformations: [],
    validate(original, optimized) {
      assert.deepEqual(JSON.parse(optimized), JSON.parse(original));
    },
  },
  {
    name: "typescript-syntax-and-repetition",
    workload: "source-code",
    input: 'export const values = [\n  "same",\n  "same",\n  "same",\n];\n',
    allowedTransformations: [],
    validate(original, optimized) {
      const diagnostics = ts.transpileModule(optimized, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
        reportDiagnostics: true,
      }).diagnostics ?? [];
      assert.equal(diagnostics.length, 0);
      assert.equal(optimized, original);
    },
  },
  {
    name: "markdown-hard-breaks",
    workload: "documentation",
    input: "first line  \nsecond line  \n",
    allowedTransformations: [],
    validate: exact,
  },
  {
    name: "yaml-block-scalar",
    workload: "structured-data",
    input: "message: |\n  first paragraph\n\n\n  second paragraph\n",
    allowedTransformations: [],
    validate: exact,
  },
  {
    name: "aligned-terminal-table",
    workload: "tabular-output",
    input: "NAME        STATUS    AGE\napi-7c9d    Running   12s\nweb-1       Pending   3s\n",
    allowedTransformations: [],
    validate: exact,
  },
  {
    name: "stack-unique-frames",
    workload: "stack-trace",
    input: "TypeError: failed\n    at first (src/a.ts:1:2)\n    at second (src/b.ts:3:4)\n    at third (src/c.ts:5:6)\n",
    allowedTransformations: [],
    validate: exact,
  },
  {
    name: "confirmed-terminal-cleanup",
    workload: "terminal-log",
    input: "\x1b[32m[12:00:00] ready\x1b[0m   \n\n\n[12:00:01] done\n[12:00:02] exit\n",
    allowedTransformations: ["ansi", "whitespace"],
    validate(original, optimized) {
      assert.notEqual(optimized, original);
      assert.equal(optimized.includes("\x1b"), false);
      assert.match(optimized, /\[12:00:02\] exit/);
    },
  },
];

let checks = 0;
let unexpectedTransformations = 0;
const byCleaner: Record<string, { opportunities: number; falsePositives: number }> = {};

for (const preset of ["safe", "balanced", "aggressive"] satisfies PresetName[]) {
  for (const item of cases) {
    const result = optimize(item.input, { preset });
    item.validate(item.input, result.text);
    assert.equal(optimize(result.text, { preset }).text, result.text);
    assert.ok(result.text.length <= item.input.length);
    const allowed = new Set(item.allowedTransformations);
    for (const decision of result.stats.decisions) {
      const metric = byCleaner[decision.cleaner] ?? { opportunities: 0, falsePositives: 0 };
      if (decision.enabled && !allowed.has(decision.cleaner)) {
        metric.opportunities += 1;
        if (decision.changes > 0) {
          metric.falsePositives += 1;
          unexpectedTransformations += 1;
        }
      }
      byCleaner[decision.cleaner] = metric;
    }
    checks += 1;
  }
}

process.stdout.write(`Semantic quality: ${checks}/${checks} checks passed\n`);
for (const [cleaner, metric] of Object.entries(byCleaner)) {
  const rate = metric.opportunities === 0 ? 0 : metric.falsePositives / metric.opportunities;
  process.stdout.write(
    `${cleaner}: false-positive=${metric.falsePositives}/${metric.opportunities} (${(rate * 100).toFixed(1)}%)\n`,
  );
}
if (unexpectedTransformations > 0) process.exitCode = 1;
