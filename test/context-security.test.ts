import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MetricsCollector, SemanticCache, SemanticIndex, compactConversation,
  createOpenAICompatibleAdapter, fitTokenBudget, rankContext, routeModel,
} from "../src/index.js";

const counter = { count: (text: string) => text.length };

describe("context-engine resource hardening", () => {
  it("rejects ambiguous or excessive budget inputs", () => {
    assert.throws(() => fitTokenBudget([{ id: "x", text: "a", score: 1 }, { id: "x", text: "b", score: 1 }], 10, counter), /duplicate/);
    assert.throws(() => fitTokenBudget([{ id: "x", text: "a", score: Number.NaN }], 10, counter), /finite/);
    assert.throws(() => fitTokenBudget([{ id: "x", text: "a", score: 1 }], 10, counter, { maxItems: 0 }), RangeError);
  });

  it("bounds ranking and conversation cardinality and characters", () => {
    assert.throws(() => rankContext("q", [{ id: "a", text: "a" }, { id: "b", text: "b" }], { maxCandidates: 1 }), /candidate count/);
    assert.throws(() => rankContext("query", [{ id: "a", text: "text" }], { maxTotalCharacters: 5 }), /ranking text/);
    const messages = [{ role: "user", content: "1234" }, { role: "user", content: "5678" }];
    assert.throws(() => compactConversation(messages, { tokenCounter: counter, budgetTokens: 10, maxMessages: 1 }), /message count/);
    assert.throws(() => compactConversation(messages, { tokenCounter: counter, budgetTokens: 10, maxTotalCharacters: 5 }), /too large/);
  });

  it("bounds semantic index and cache vectors", () => {
    const index = new SemanticIndex({ maxEntries: 1, maxDimensions: 2, maxTextCharacters: 4 });
    index.upsert({ id: "a", text: "four", embedding: [1, 0] });
    assert.throws(() => index.upsert({ id: "b", text: "x", embedding: [0, 1] }), /entry limit/);
    assert.throws(() => index.upsert({ id: "a", text: "12345", embedding: [1, 0] }), /text exceeds/);
    assert.throws(() => index.search([1, 0], { minimumSimilarity: 2 }), /minimumSimilarity/);
    const cache = new SemanticCache({ maxDimensions: 2 });
    cache.set("a", [1, 0], "value");
    assert.throws(() => cache.set("b", [1, 0, 0], "value"), /maximum dimensions/);
    assert.throws(() => cache.get("a", [1]), /dimension mismatch/);
    let now = 0;
    const expiring = new SemanticCache({ ttlMilliseconds: 1, now: () => now });
    expiring.set("old", [1, 0], "value");
    now = 1;
    assert.doesNotThrow(() => expiring.set("new", [1, 0, 0], "value"));
  });

  it("bounds telemetry and validates model routes", () => {
    const metrics = new MetricsCollector({ maxObservations: 1, maxAttributes: 1, maxStringCharacters: 8 });
    metrics.record("count", 1, { ok: "yes" });
    assert.throws(() => metrics.record("again", 2), /observation limit/);
    const fresh = new MetricsCollector({ maxAttributes: 1, maxStringCharacters: 4 });
    assert.throws(() => fresh.record("12345", 1), /name length/);
    assert.throws(() => fresh.record("ok", 1, { a: 1, b: 2 }), /attribute count/);
    assert.throws(() => routeModel([
      { id: "same", provider: "a", model: "a", maxContextTokens: 10 },
      { id: "same", provider: "b", model: "b", maxContextTokens: 10 },
    ], { inputTokens: 1 }), /duplicate/);
  });
});

describe("provider boundary hardening", () => {
  it("validates destination, credentials, and request bounds before fetch", async () => {
    assert.throws(() => createOpenAICompatibleAdapter({ baseUrl: "file:///tmp/x", apiKey: "x" }), /http/);
    assert.throws(() => createOpenAICompatibleAdapter({ baseUrl: "https://example.test", apiKey: "" }), /apiKey/);
    const adapter = createOpenAICompatibleAdapter({ baseUrl: "https://example.test", apiKey: "x", maxMessages: 1, fetch: async () => new Response("{}") });
    await assert.rejects(() => adapter.complete({ model: "m", messages: [{ role: "user", content: "a" }, { role: "user", content: "b" }] }), /message count/);
  });

  it("enforces timeout and prevents custom authorization override", async () => {
    let authorization = "";
    const timeoutAdapter = createOpenAICompatibleAdapter({
      baseUrl: "https://example.test", apiKey: "real", timeoutMilliseconds: 5,
      fetch: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }),
    });
    await assert.rejects(() => timeoutAdapter.complete({ model: "m", messages: [] }), /timed out/);
    const headerAdapter = createOpenAICompatibleAdapter({
      baseUrl: "https://example.test", apiKey: "real", headers: { Authorization: "Bearer attacker" },
      fetch: async (_input, init) => {
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
      },
    });
    await headerAdapter.complete({ model: "m", messages: [] });
    assert.equal(authorization, "Bearer real");
  });
});
