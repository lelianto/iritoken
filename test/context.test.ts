import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { optimizeContext } from "../src/pipeline/context.js";

describe("unified context router", () => {
  it("prefers lexical structured optimization for JSON tool output", () => {
    const events: string[] = [];
    const result = optimizeContext('{\n  "ok": true,\n  "items": [1, 2]\n}\n', {
      command: "kubectl get pods -o json",
      observer: {
        onCleaner: (decision) => events.push(decision.cleaner),
        onComplete: () => events.push("complete"),
      },
    });
    assert.equal(result.strategy, "structured");
    assert.equal(result.structured?.lexicallyLossless, true);
    assert.equal(result.command?.family, "logs");
    assert.deepEqual(events, ["structured-json", "complete"]);
    assert.deepEqual(JSON.parse(result.text), { ok: true, items: [1, 2] });
  });

  it("uses command provenance for ordinary terminal output", () => {
    const result = optimizeContext("PASS a\nPASS a\nPASS a\nTests: 3 passed\n", {
      command: "npm test",
    });
    assert.equal(result.strategy, "command");
    assert.equal(result.command?.family, "test");
    assert.ok(result.text.length <= result.stats.originalCharacters);
  });

  it("falls back to the existing generic optimizer", () => {
    const result = optimizeContext("\x1b[31mERROR\x1b[0m\n");
    assert.equal(result.strategy, "generic");
    assert.equal(result.text, "ERROR\n");
  });

  it("can disable structured routing and enforces the core input limit", () => {
    const input = '{ "space": true }';
    const result = optimizeContext(input, { structured: false });
    assert.equal(result.strategy, "generic");
    assert.equal(result.text, input);
    assert.throws(() => optimizeContext("12345", { maxInputCharacters: 4 }), /too large/);
  });
});

