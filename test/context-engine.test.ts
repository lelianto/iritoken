import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MetricsCollector, SemanticCache, SemanticIndex, cacheHitPercentage,
  compactConversation, createDeepSeekAdapter, fitTokenBudget,
  prepareCacheAwarePrompt, rankContext, routeModel,
} from "../src/index.js";

const words = { count: (text: string) => text.trim() === "" ? 0 : text.trim().split(/\s+/).length };

describe("hard token budgeting", () => {
  it("prioritizes required and high-value-per-token context without exceeding budget", () => {
    const result = fitTokenBudget([
      { id: "system", text: "always keep", score: 1, required: true },
      { id: "large", text: "a b c d e", score: 0.9 },
      { id: "small", text: "useful", score: 0.8 },
    ], 3, words);
    assert.deepEqual(result.selected.map((item) => item.id), ["system", "small"]);
    assert.equal(result.usedTokens, 3);
  });
});

describe("context ranking and conversation compaction", () => {
  it("ranks relevant context with explainable signals", () => {
    const ranked = rankContext("database timeout", [
      { id: "a", text: "CSS warning" }, { id: "b", text: "database connection timeout" },
    ]);
    assert.equal(ranked[0]?.id, "b");
    assert.equal(ranked[0]?.signals.lexical, 1);
  });
  it("compresses bodies and omits low-ranked history under a hard budget", () => {
    const result = compactConversation([
      { role: "system", content: "obey rules" },
      { role: "user", content: "irrelevant ancient chatter" },
      { role: "tool", content: "database timeout\n\n\n\ndatabase timeout" },
      { role: "user", content: "fix database timeout" },
    ], { tokenCounter: words, budgetTokens: 10, query: "database timeout", keepRecent: 1 });
    assert.ok(result.compactedTokens <= 10);
    assert.equal(result.messages[0]?.role, "system");
    assert.ok(result.omittedIndices.includes(1));
  });
});

describe("semantic retrieval and cache", () => {
  it("retrieves by vector similarity", () => {
    const index = new SemanticIndex();
    index.upsert({ id: "db", text: "database", embedding: [1, 0] });
    index.upsert({ id: "css", text: "styles", embedding: [0, 1] });
    assert.equal(index.search([0.9, 0.1])[0]?.id, "db");
  });
  it("serves exact or semantically similar cache entries and expires them", () => {
    let now = 0; const cache = new SemanticCache<string>({ similarityThreshold: 0.9, ttlMilliseconds: 10, now: () => now });
    cache.set("question-a", [1, 0], "answer");
    assert.equal(cache.get("other-phrasing", [0.99, 0.01])?.value, "answer");
    assert.equal(cache.get("question-a", [0, 1])?.exact, true);
    now = 10; assert.equal(cache.get("question-a", [1, 0]), undefined);
  });
});

describe("model routing", () => {
  it("filters by capacity/capability and can prefer cost", () => {
    const decision = routeModel([
      { id: "small", provider: "x", model: "small", maxContextTokens: 100, inputCostPerMillion: 1, capabilities: ["json"] },
      { id: "cheap", provider: "y", model: "large", maxContextTokens: 1000, inputCostPerMillion: 0.1, capabilities: ["json"] },
    ], { inputTokens: 200, requiredCapabilities: ["json"], prefer: "cost" });
    assert.equal(decision.route.id, "cheap");
  });
});

describe("provider adapter and prompt caching", () => {
  it("normalizes OpenAI-compatible DeepSeek responses and cache usage", async () => {
    let requestBody = "";
    const adapter = createDeepSeekAdapter("secret", async (_input, init) => {
      requestBody = String(init?.body);
      return new Response(JSON.stringify({ id: "r1", model: "deepseek-v4-flash", choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, prompt_cache_hit_tokens: 8, prompt_cache_miss_tokens: 2 } }), { status: 200 });
    });
    const result = await adapter.complete({ model: "deepseek-v4-flash", messages: [{ role: "user", content: "hello" }], thinking: false });
    assert.equal(result.text, "ok"); assert.equal(result.usage?.cacheHitTokens, 8);
    assert.match(requestBody, /deepseek-v4-flash/);
    assert.equal(cacheHitPercentage(result.usage as NonNullable<typeof result.usage>), 80);
  });
  it("creates a stable reusable prefix fingerprint", () => {
    const first = prepareCacheAwarePrompt([{ role: "system", content: "stable" }], [{ role: "user", content: "a" }]);
    const second = prepareCacheAwarePrompt([{ role: "system", content: "stable" }], [{ role: "user", content: "b" }]);
    assert.equal(first.prefixSha256, second.prefixSha256);
    assert.notDeepEqual(first.messages, second.messages);
  });
});

describe("exportable observability", () => {
  it("records metadata, flushes it, and clears the buffer", async () => {
    const collector = new MetricsCollector(() => 123); const exported: unknown[] = [];
    collector.record("tokens.removed", 42, { model: "deepseek-v4-flash" });
    assert.equal(await collector.flush({ export: (items) => { exported.push(...items); } }), 1);
    assert.equal(collector.size, 0); assert.equal((exported[0] as { timestamp: number }).timestamp, 123);
  });
});
