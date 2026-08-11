import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStats } from "../src/stats/calculate.js";
import { estimateTokens } from "../src/token/counter.js";

const detection = { type: "generic-terminal-output" as const, confidence: "high" as const };

describe("buildStats", () => {
  it("computes character stats", () => {
    const s = buildStats(
      "abcd",
      { text: "ab", changes: [{ name: "x", count: 1, description: "x" }], detection },
      {},
    );
    assert.equal(s.originalCharacters, 4);
    assert.equal(s.optimizedCharacters, 2);
    assert.equal(s.charactersRemoved, 2);
    assert.equal(s.reductionPercentage, 50);
  });

  it("aggregates multiple transformation counts", () => {
    const s = buildStats(
      "123456",
      {
        text: "1",
        changes: [
          { name: "d", count: 2, description: "d" },
          { name: "d", count: 3, description: "d" },
          { name: "other", count: 1, description: "o" },
        ],
        detection,
      },
      {},
    );
    assert.deepEqual(s.transformations, { d: 5, other: 1 });
  });

  it("returns 0 when nothing is removed", () => {
    const s = buildStats("abc", { text: "abc", changes: [], detection }, {});
    assert.equal(s.reductionPercentage, 0);
    assert.equal(s.charactersRemoved, 0);
  });

  it("adds exact token stats when a counter is provided", () => {
    const s = buildStats(
      "hello world",
      { text: "hello", changes: [], detection },
      { tokenCounter: { count: (t: string) => t.length }, exactTokens: true },
    );
    assert.ok(s.tokens);
    assert.equal(s.tokens.originalTokens, "hello world".length);
    assert.equal(s.tokens.optimizedTokens, 5);
    assert.equal(s.tokens.exact, true);
  });

  it("omits token stats without a counter", () => {
    const s = buildStats("hello", { text: "hi", changes: [], detection }, {});
    assert.equal(s.tokens, undefined);
  });

  it("estimateTokens is deterministic and non-negative", () => {
    assert.equal(estimateTokens(""), 0);
    const t1 = estimateTokens("the quick brown fox jumps over the lazy dog");
    const t2 = estimateTokens("the quick brown fox jumps over the lazy dog");
    assert.equal(t1, t2);
    assert.ok(t1 > 0);
  });
});