import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { optimize, PRESETS } from "../src/pipeline/optimize.js";
import { classify } from "../src/detectors/content-type.js";
import { estimateTokens } from "../src/token/counter.js";

const VITEST = `RERUN  src/a.test.ts
 ✓ src/a.test.ts (1) 2ms
 ✓ src/b.test.ts (1) 3ms
 ✓ src/c.test.ts (1) 4ms
 ✓ src/d.test.ts (1) 5ms
 ✓ src/e.test.ts (2) 7ms
 ✗ src/f.test.ts (1) 9ms
 ❯ src/f.test.ts > failing test
 Test Files  4 passed | 1 failed (5)
      Tests  6 passed | 1 failed (7)
`;

describe("optimize pipeline", () => {
  it("runs the safe preset by default and returns stats", () => {
    const r = optimize("\x1b[31mERROR\x1b[0m\n\n\n\n\nhello\n");
    assert.equal(r.text, "ERROR\n\nhello\n");
    assert.equal(r.stats.originalCharacters, 25);
    assert.equal(r.stats.optimizedCharacters, 13);
    assert.ok(r.stats.reductionPercentage > 0);
    assert.equal(r.stats.transformations.ansi, 2);
  });

  it("is idempotent: optimize(optimize(x)) === optimize(x)", () => {
    const inputs = [
      VITEST,
      "\x1b[31mERROR\x1b[0m\n\n\n\n\na\na\nConnection failed",
      "normal\ntext\nwith no changes at all\n",
      "Connecting...\nConnecting...\nConnection failed\n\n\n\n\n\nthe\n",
    ];
    for (const input of inputs) {
      const once = optimize(input, { preset: "balanced" });
      const twice = optimize(once.text, { preset: "balanced" });
      assert.equal(twice.text, once.text, `idempotence failed for: ${JSON.stringify(input)}`);
    }
  });

  it("never enlarges output", () => {
    const inputs = [
      VITEST,
      "a\na\na\n",
      "✓ one\n✓ two\n✓ three\n",
      "Connecting...\nConnecting...\nConnection failed\n",
    ];
    for (const input of inputs) {
      const r = optimize(input, { preset: "balanced" });
      assert.ok(
        r.text.length <= input.length,
        `output larger than input: ${JSON.stringify(input)}`,
      );
    }
  });

  it("respects per-cleaner toggles", () => {
    const input = "\x1b[31mred\x1b[0m\n\n\n\na\na";
    const disabled = optimize(input, { cleaners: { ansi: false, whitespace: false, duplicateLines: false } });
    assert.equal(disabled.text, input);
    const onlyAnsi = optimize(input, {
      cleaners: { ansi: true, whitespace: false, duplicateLines: false, stackTrace: false, testOutput: false },
    });
    assert.equal(onlyAnsi.text, "red\n\n\n\na\na");
  });

  it("safe preset does not touch test output", () => {
    const r = optimize(VITEST, { preset: "safe" });
    assert.equal(r.stats.transformations["test-output"], undefined);
  });

  it("balanced preset preserves passing-test context in failure reports", () => {
    const r = optimize(VITEST, { preset: "balanced" });
    assert.equal(r.stats.transformations["test-output"], undefined);
  });

  it("aggressive preserves ordinary balanced output when no repeated block applies", () => {
    const safe = optimize(VITEST, { preset: "safe" });
    const bal = optimize(VITEST, { preset: "balanced" });
    const agg = optimize(VITEST, { preset: "aggressive" });
    assert.equal(agg.text, bal.text);
    assert.equal(bal.text, safe.text);
  });

  it("accepts a custom token counter and reports token stats as exact", () => {
    const counter = {
      count(text: string): number {
        return estimateTokens(text);
      },
    };
    const r = optimize("hello\n\n\n\n\nworld world world", { tokenCounter: counter });
    assert.ok(r.stats.tokens);
    assert.equal(r.stats.tokens.originalTokens, counter.count("hello\n\n\n\n\nworld world world"));
    assert.equal(r.stats.tokens.optimizedTokens, counter.count(r.text));
    assert.equal(r.stats.tokens.exact, true);
    assert.equal(r.stats.tokens.optimizedTokens <= r.stats.tokens.originalTokens, true);
  });

  it("does not include token stats when no counter is provided", () => {
    const r = optimize("hello\n\n\n\n\nworld");
    assert.equal(r.stats.tokens, undefined);
  });

  it("reports content detection", () => {
    const r = optimize(VITEST);
    assert.equal(r.stats.detection.type, "test-output");
    assert.deepEqual(classify(VITEST), r.stats.detection);
  });

  it("handles empty input", () => {
    const r = optimize("");
    assert.equal(r.text, "");
    assert.equal(r.stats.reductionPercentage, 0);
    assert.equal(r.stats.detection.type, "unknown");
  });

  it("handles very large input without pathological behavior", () => {
    const big = ("line of terminal output here\n\n\n\n\n" ).repeat(20000) + "end\n";
    const start = performance.now();
    const r = optimize(big, { preset: "balanced" });
    const ms = performance.now() - start;
    assert.ok(r.text.length < big.length);
    assert.ok(ms < 5000, `took ${ms}ms`);
  });

  it("exposes exported presets", () => {
    assert.equal(PRESETS.safe.stackTrace, false);
    assert.equal(PRESETS.balanced.stackTrace, true);
    assert.equal(PRESETS.balanced.repeatedBlocks, false);
    assert.equal(PRESETS.aggressive.repeatedBlocks, true);
  });
});
