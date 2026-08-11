import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/detectors/content-type.js";

const VITEST = `RERUN  src/a.test.ts
 stderr | src/a.test.ts > add > keeps ans
 ...
 ✓ src/a.test.ts (1) 2ms
 ✓ src/b.test.ts (1) 3ms
 ✓ src/c.test.ts (1) 4ms
 ✓ src/d.test.ts (1) 5ms
 ✓ src/e.test.ts (2) 7ms
 ✗ src/f.test.ts (1) 9ms
 ❯ src/f.test.ts > failing test
 Test Files  4 passed | 1 failed (5)
      Tests  6 passed | 1 failed (7)
  Duration  1.2s
`;

const JEST = `PASS  src/a.test.ts
  ✓ adds numbers (3 ms)
  ✓ handles empty (2 ms)
FAIL  src/c.test.ts
  ✕ throws on bad input (5 ms)
  ● throws on bad input
    expect(fn).toThrow()
    Expected: Error
`;

const STACK = `TypeError: Cannot read properties of undefined (reading 'x')
    at compute (src/calc.ts:12:5)
    at run (src/index.ts:34:11)
    at Object.<anonymous> (src/index.ts:40:3)
    at Module._compile (node:internal/modules/cjs/loader:1234:34)
    at Object.<anonymous> (src/index.ts:45:3)
`;

const SOURCE = `import { readFileSync } from "node:fs";
const config = readFileSync("tsconfig.json", "utf8");
export function build() {
  return config.length;
}
interface Options {
  strict: boolean;
}
const opts: Options = { strict: true };
`;

describe("classify content type", () => {
  it("detects vitest output", () => {
    const found = classify(VITEST);
    assert.equal(found.type, "test-output");
  });

  it("detects jest output", () => {
    const found = classify(JEST);
    assert.equal(found.type, "test-output");
  });

  it("detects V8 stack traces", () => {
    const found = classify(STACK);
    assert.equal(found.type, "stack-trace");
  });

  it("detects Python tracebacks", () => {
    const text = 'Traceback (most recent call last):\n  File "/app/a.py", line 1, in run\n  File "/app/b.py", line 2, in call\n  File "/app/b.py", line 2, in call\nKeyError: "id"';
    assert.deepEqual(classify(text), { type: "stack-trace", confidence: "medium" });
  });

  it("detects pytest, Go, and Cargo passing output", () => {
    const samples = [
      "tests/test_api.py::test_create PASSED [ 33%]\ntests/test_api.py::test_read PASSED [ 66%]\ntests/test_api.py::test_delete PASSED [100%]\n=== 3 passed in 0.03s ===",
      "--- PASS: TestCreate (0.00s)\n--- PASS: TestRead (0.00s)\n--- PASS: TestDelete (0.00s)\nPASS\nok example/api 0.003s",
      "test tests::create ... ok\ntest tests::read ... ok\ntest tests::delete ... ok\ntest result: ok. 3 passed; 0 failed",
    ];
    for (const text of samples) assert.equal(classify(text).type, "test-output");
  });

  it("detects source code", () => {
    const found = classify(SOURCE);
    assert.equal(found.type, "source-code");
  });

  it("labels empty input as unknown", () => {
    assert.equal(classify("").type, "unknown");
    assert.equal(classify("   \n  ").type, "unknown");
  });

  it("labels short inputs as unknown", () => {
    assert.equal(classify("hello").type, "unknown");
  });

  it("labels generic terminal lines as generic-terminal-output", () => {
    const lines =
      "building bundle\n  compiled 42 modules\ndone in 1.2s\nwarning: unused import\n  total size 2.1 MB\n  exit code 0\n  log saved";
    const found = classify(lines);
    assert.equal(found.type, "generic-terminal-output");
  });

  it("assigns high confidence only with repeated terminal evidence", () => {
    const timestamped = [
      "[14:22:01] connecting to queue",
      "[14:22:02] processing batch",
      "[14:22:03] processing batch",
      "[14:22:04] complete",
    ].join("\n");
    assert.deepEqual(classify(timestamped), {
      type: "generic-terminal-output",
      confidence: "high",
    });
  });

  it("does not promote repeated source code or instructions", () => {
    const source = [
      "export const values = [",
      '  "same-value",',
      '  "same-value",',
      '  "same-value",',
      "];",
    ].join("\n");
    const instructions = "repeat this instruction exactly\n".repeat(3).trimEnd();
    assert.notEqual(classify(source).confidence, "high");
    assert.notEqual(classify(instructions).type, "generic-terminal-output");
  });

  it("handles unicode test output", () => {
    const found = classify(`✓ héllo 漢字 test passes\n✓ another one passes\n✓ third passes\n✓ fourth passes\nTests  4 passed (4)`);
    assert.equal(found.type, "test-output");
  });

  it("is deterministic", () => {
    assert.equal(classify(VITEST).type, classify(VITEST).type);
  });
});
