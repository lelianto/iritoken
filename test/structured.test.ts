import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyStructured } from "../src/detectors/structured-content.js";
import { optimizeStructured } from "../src/pipeline/structured.js";

describe("structured optimization", () => {
  it("compacts JSON while preserving parsed values and lexical tokens", () => {
    const input = '{\n  "url": "https://example.test/a b",\n  "n": 1e+03,\n  "escaped": "a\\\\b\\"c"\n}\n';
    const result = optimizeStructured(input);
    assert.equal(result.type, "json");
    assert.equal(result.lexicallyLossless, true);
    assert.ok(result.text.length < input.length);
    assert.deepEqual(JSON.parse(result.text), JSON.parse(input));
    assert.match(result.text, /1e\+03/);
  });

  it("preserves duplicate keys instead of parse/reserialize data loss", () => {
    const input = '{ "same": 1, "same": 2 }';
    const result = optimizeStructured(input);
    assert.equal(result.text, '{"same":1,"same":2}');
    assert.equal((result.text.match(/"same"/g) ?? []).length, 2);
  });

  it("compacts JSONL independently and preserves its trailing newline", () => {
    const input = '{ "id": 1, "value": "a b" }\n{ "id": 2, "value": "c" }\n';
    const result = optimizeStructured(input);
    assert.equal(result.type, "jsonl");
    assert.equal(result.text, '{"id":1,"value":"a b"}\n{"id":2,"value":"c"}\n');
  });

  it("fails open for malformed and ordinary text", () => {
    for (const input of ['{"broken":', "ordinary prose\nwith lines", "", "null"]) {
      const result = optimizeStructured(input);
      assert.equal(result.text, input);
      assert.equal(result.changed, false);
      assert.equal(result.type, "text");
    }
  });

  it("is deterministic, idempotent, and non-expanding over generated JSON", () => {
    let seed = 0x12345678;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };
    for (let index = 0; index < 300; index += 1) {
      const value = {
        id: random(),
        text: `space ${random()} quote " slash \\ newline\n`,
        flags: [Boolean(random() & 1), null, random() % 100],
      };
      const compact = JSON.stringify(value);
      const input = JSON.stringify(value, null, (random() % 4) + 1) + "\n";
      const once = optimizeStructured(input);
      const twice = optimizeStructured(once.text);
      assert.deepEqual(JSON.parse(once.text), value);
      assert.equal(once.text, compact);
      assert.equal(twice.text, once.text);
      assert.ok(once.text.length <= input.length);
    }
  });

  it("does not mistake a single JSON scalar for structured context", () => {
    assert.deepEqual(classifyStructured("123"), { type: "text", confidence: "low" });
  });
});
