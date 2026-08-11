import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compactConversation, fitTokenBudget, rankContext } from "../src/index.js";

const words = {
  count: (text: string): number => text.trim() === "" ? 0 : text.trim().split(/\s+/).length,
};

describe("required budget safety", () => {
  it("retains every required item and reports an unachievable target", () => {
    const result = fitTokenBudget([
      { id: "system", text: "one two three", score: 1, required: true },
      { id: "acceptance", text: "four five", score: 1, required: true },
      { id: "optional", text: "six", score: 100 },
    ], 3, words);

    assert.deepEqual(result.selected.map((item) => item.id), ["system", "acceptance"]);
    assert.deepEqual(result.omitted.map((item) => item.id), ["optional"]);
    assert.equal(result.requiredTokens, 5);
    assert.equal(result.usedTokens, 5);
    assert.equal(result.targetAchievable, false);
  });

  it("fills remaining space only after all required content", () => {
    const result = fitTokenBudget([
      { id: "required", text: "one two", score: 0, required: true },
      { id: "small", text: "three", score: 0.8 },
      { id: "large", text: "four five six", score: 0.9 },
    ], 3, words);

    assert.deepEqual(result.selected.map((item) => item.id), ["required", "small"]);
    assert.equal(result.requiredTokens, 2);
    assert.equal(result.usedTokens, 3);
    assert.equal(result.targetAchievable, true);
  });

  it("keeps protected conversation messages when they exceed the budget", () => {
    const result = compactConversation([
      { role: "system", content: "always retain these safety rules" },
      { role: "assistant", content: "old unrelated note" },
      { role: "user", content: "latest requirement has several important words" },
    ], {
      tokenCounter: words,
      budgetTokens: 2,
      keepRecent: 1,
      query: "latest requirement",
    });

    assert.deepEqual(result.messages.map((message) => message.role), ["system", "user"]);
    assert.equal(result.targetAchievable, false);
    assert.equal(result.requiredTokens, result.compactedTokens);
    assert.ok(result.compactedTokens > result.budgetTokens);
  });
});

describe("ordinal conversation recency", () => {
  it("uses sequence ordinals independently of the wall clock", () => {
    const ranked = rankContext("", [
      { id: "old", text: "same", ordinal: 0 },
      { id: "new", text: "same", ordinal: 8 },
    ], {
      newestOrdinal: 8,
      recencyHalfLifeItems: 2,
      now: Number.MAX_SAFE_INTEGER,
    });

    assert.equal(ranked[0]?.id, "new");
    assert.equal(ranked[0]?.signals.recency, 1);
    assert.equal(ranked[1]?.signals.recency, 2 ** -4);
  });

  it("rejects invalid ordinal recency configuration", () => {
    assert.throws(
      () => rankContext("q", [{ id: "x", text: "q", ordinal: 0 }], {
        recencyHalfLifeItems: 0,
      }),
      /recencyHalfLifeItems/,
    );
    assert.throws(
      () => rankContext("q", [{ id: "x", text: "q", ordinal: Number.NaN }]),
      /ordinals/,
    );
  });
});
