import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StackTraceCleaner } from "../src/cleaners/stack-trace.js";
import type { ContentDetection } from "../src/types.js";

const STACK_DET: ContentDetection = { type: "stack-trace", confidence: "high" };
const TERMINAL: ContentDetection = { type: "generic-terminal-output", confidence: "high" };

const STACK_TEXT = `TypeError: Cannot read properties of undefined (reading 'x')
    at compute (src/calc.ts:12:5)
    at run (src/index.ts:34:11)
    at Object.<anonymous> (src/index.ts:40:3)
    at Module._compile (node:internal/modules/cjs/loader:1234:34)
    at Object.<anonymous> (src/index.ts:45:3)
`;

const cleaner = new StackTraceCleaner();

describe("StackTraceCleaner", () => {
  it("collapses consecutive identical V8 frames", () => {
    const r = cleaner.clean(STACK_TEXT, STACK_DET);
    assert.ok(r.text.includes("at compute (src/calc.ts:12:5)"));
    assert.ok(!r.text.match(/compute \(src\/calc.*?compute \(src\/calc/));
  });

  it("preserves all unique frames byte for byte", () => {
    const text = "Error: boom\n    at a (f.ts:1:1)\n    at b (f.ts:2:2)\n    at c (f.ts:3:3)\n    at d (f.ts:4:4)";
    const r = cleaner.clean(text, STACK_DET);
    assert.equal(r.text, text);
    assert.deepEqual(r.changes, []);
  });

  it("does not touch a stack trace with a single frame", () => {
    const text = "Error: boom\n    at a (f.ts:1:1)";
    const r = cleaner.clean(text, STACK_DET);
    assert.equal(r.text, text);
  });

  it("skips non-stack content even when it looks frame-ish", () => {
    const text = "indent at the start of a normal sentence with trailing 42";
    const r = cleaner.clean(text, TERMINAL);
    assert.equal(r.text, text);
  });

  it("preserves the repeated marker (idempotent)", () => {
    const once = cleaner.clean(
      "Error: boom\n    at spin (f.ts:1:1)\n    at spin (f.ts:1:1)\n    at spin (f.ts:1:1)\n    at outer (f.ts:9:9)",
      STACK_DET,
    );
    assert.ok(once.text.includes("[repeated 3 times]"));
    const twice = cleaner.clean(once.text, STACK_DET);
    assert.equal(twice.text, once.text);
    assert.deepEqual(twice.changes, []);
  });

  it("requires a min bar of real frames for generic content", () => {
    const fourFrames =
      "    at a (f.ts:1:1)\n    at a (f.ts:1:1)\n    at a (f.ts:1:1)\n    at boot (f.ts:9:9)";
    assert.equal(cleaner.clean(fourFrames, TERMINAL).text, fourFrames);
    const sixFrames =
      "    at a (f.ts:1:1)\n    at a (f.ts:1:1)\n    at a (f.ts:1:1)\n    at a (f.ts:1:1)\n    at a (f.ts:1:1)\n    at a (f.ts:1:1)\n    at boot (f.ts:9:9)";
    const r = cleaner.clean(sixFrames, TERMINAL);
    assert.ok(r.text.includes("a (f.ts:1:1) [repeated 6 times]"));
  });

  it("handles Python-style frames", () => {
    const text =
      'Traceback (most recent call last):\n  File "/app/app.py", line 10, in main\n  File "/app/app.py", line 10, in main\n  File "/app/app.py", line 10, in main\n    do_thing()';
    const r = cleaner.clean(text, STACK_DET);
    assert.ok(r.text.includes('File "/app/app.py", line 10, in main [repeated 3 times]'));
    assert.ok(r.text.includes("    do_thing()"));
  });

  it("collapses repeated Python frame and source-line records", () => {
    const text = [
      "Traceback (most recent call last):",
      '  File "/app/client.py", line 41, in fetch',
      '    return response.json()["account"]',
      '  File "/app/client.py", line 41, in fetch',
      '    return response.json()["account"]',
      '  File "/app/client.py", line 41, in fetch',
      '    return response.json()["account"]',
      "KeyError: 'account'",
    ].join("\n");
    const result = cleaner.clean(text, STACK_DET);
    assert.ok(result.text.includes('line 41, in fetch [repeated 3 times]'));
    assert.equal(result.text.split('return response.json()["account"]').length - 1, 1);
    assert.ok(result.text.endsWith("KeyError: 'account'"));
  });

  it("handles very large stack output", () => {
    const frame = "    at recurse (src/deep.ts:3:3)\n";
    const text = "Error: deep\n" + frame.repeat(2000) + "    at boot (src/main.ts:1:1)\n";
    const r = cleaner.clean(text, STACK_DET);
    assert.ok(r.text.includes("recurse (src/deep.ts:3:3) [repeated 2000 times]"));
    assert.ok(r.text.endsWith("at boot (src/main.ts:1:1)\n"));
  });

  it("handles empty input", () => {
    const r = cleaner.clean("", STACK_DET);
    assert.equal(r.text, "");
    assert.deepEqual(r.changes, []);
  });
});
