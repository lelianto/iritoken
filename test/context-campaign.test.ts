import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prepareCampaignVariant, scoreFacts } from "../benchmark/context-e2e-lib.js";
import { CONTEXT_V4_CORPUS_ID, CONTEXT_V4_TASKS } from "../benchmark/tasks/context-v4-manifest.js";

describe("fresh DeepSeek context campaign", () => {
  it("has a new balanced easy-to-hard corpus with unique tasks", () => {
    assert.match(CONTEXT_V4_CORPUS_ID, /context-v4/);
    assert.equal(CONTEXT_V4_TASKS.length, 9);
    assert.equal(new Set(CONTEXT_V4_TASKS.map((task) => task.name)).size, 9);
    for (const difficulty of ["easy", "medium", "hard"]) {
      assert.equal(CONTEXT_V4_TASKS.filter((task) => task.difficulty === difficulty).length, 3);
    }
  });

  it("traces every stage and preserves all required facts before live calls", () => {
    const expectedStages = [
      "01-raw-context", "02-content-routing-and-optimization", "03-semantic-retrieval",
      "04-context-ranking", "05-token-budget-and-conversation-compaction", "06-model-routing",
      "07-cache-aware-prompt", "08-semantic-cache-probe",
    ];
    for (const task of CONTEXT_V4_TASKS) {
      const prepared = prepareCampaignVariant(task, "optimized");
      assert.deepEqual(prepared.traces.map((trace) => trace.stage), expectedStages, task.name);
      assert.equal(scoreFacts(prepared.messages.map((message) => message.content).join("\n"), task.requiredFacts).recall, 1, task.name);
      assert.equal(prepared.cacheProbe.similarHit, true, task.name);
      assert.equal(prepared.cacheProbe.dissimilarMiss, true, task.name);
      if (task.expectedRetrievedIds) assert.deepEqual(prepared.retrievedIds, task.expectedRetrievedIds, task.name);
      const budget = prepared.traces[4]?.details;
      assert.ok(typeof budget?.usedTokens === "number" && budget.usedTokens <= task.budgetTokens, task.name);
    }
  });

  it("produces deterministic prompt checkpoints", () => {
    for (const task of CONTEXT_V4_TASKS) {
      const first = prepareCampaignVariant(task, "optimized");
      const second = prepareCampaignVariant(task, "optimized");
      assert.deepEqual(first.traces, second.traces, task.name);
      assert.deepEqual(first.messages, second.messages, task.name);
    }
  });
});
