import assert from "node:assert/strict";
import test from "node:test";
import { FULL_STACK_TARGET_CONFIGURATIONS, TARGET_CONFIGURATIONS, stageOnlyAblations } from "../scenarios/ablations.js";
import { SCENARIOS, toPublicScenario } from "../scenarios/manifest.js";
import { prepareTurn } from "./optimizer.js";

const simple = SCENARIOS.find((scenario) => scenario.id === "simple-normalize-key");
if (!simple) throw new Error("simple scenario fixture is missing");

test("baseline bypasses the optimizer and preserves the public units", async () => {
  const baseline = TARGET_CONFIGURATIONS.find((configuration) => configuration.target === 0);
  if (!baseline) throw new Error("baseline configuration is missing");
  const prepared = await prepareTurn({
    scenario: toPublicScenario(simple),
    turnIndex: 0,
    conversationHistory: [],
    ablation: baseline,
    requireCore: true,
  });
  assert.equal(prepared.adapter, "baseline");
  assert.equal(prepared.metrics.reductionPercentage, 0);
  assert.equal(prepared.metrics.requiredCoverage, 1);
  assert.ok(prepared.messages.some((message) => message.content.includes("normalizeKey")));
  assert.equal(prepared.messages.some((message) => message.content.includes("requiredPatterns")), false);
});

test("context-only treatment maps importance safely and does not add output policy", async () => {
  const contextOnly = TARGET_CONFIGURATIONS.find((configuration) => configuration.target === 50);
  if (!contextOnly) throw new Error("context-only configuration is missing");
  const prepared = await prepareTurn({
    scenario: toPublicScenario(simple),
    turnIndex: 0,
    conversationHistory: [],
    ablation: contextOnly,
    requireCore: true,
  });
  assert.equal(prepared.adapter, "iritoken-core");
  assert.ok(Number.isFinite(prepared.metrics.reductionPercentage));
  assert.ok(prepared.metrics.requiredCoverage >= 0 && prepared.metrics.requiredCoverage <= 1);
  assert.equal(prepared.messages.some((message) => message.content.includes("IRITOKEN OUTPUT POLICY")), false);
});

test("full-stack treatment declares its prompt-side output policy", async () => {
  const fullStack = FULL_STACK_TARGET_CONFIGURATIONS.find((configuration) => configuration.target === 50);
  if (!fullStack) throw new Error("full-stack configuration is missing");
  const prepared = await prepareTurn({
    scenario: toPublicScenario(simple),
    turnIndex: 0,
    conversationHistory: [],
    ablation: fullStack,
    requireCore: true,
  });
  assert.equal(prepared.adapter, "iritoken-core");
  assert.ok(prepared.messages.some((message) => message.role === "system" && message.content.includes("IRITOKEN OUTPUT POLICY")));
});

test("normalization-only ablation never invokes target budgeting", async () => {
  const onlyNormalization = stageOnlyAblations(90).find((configuration) => configuration.enabledStages[0] === "normalization");
  if (!onlyNormalization) throw new Error("normalization ablation is missing");
  const prepared = await prepareTurn({ scenario: toPublicScenario(simple), turnIndex: 0, conversationHistory: [], ablation: onlyNormalization, requireCore: true });
  assert.equal(prepared.metrics.targetReductionPercentage, 0);
  assert.deepEqual(prepared.omittedUnitIds, []);
});

test("manifest retention labels cannot protect a non-requirement answer-bearing block", async () => {
  const publicScenario = toPublicScenario(simple);
  const scenario = {
    ...publicScenario,
    context: [...publicScenario.context, {
      id: "oracle-bait", kind: "noise" as const, importance: "must_keep" as const,
      required: true, referenced: true,
      content: `SECRET_ANSWER ${"unrelated telemetry field ".repeat(120)}`,
    }],
  };
  const targetOnly = stageOnlyAblations(90).find((configuration) => configuration.enabledStages[0] === "targetReduction");
  if (!targetOnly) throw new Error("target reduction ablation is missing");
  const prepared = await prepareTurn({ scenario, turnIndex: 0, conversationHistory: [], ablation: targetOnly, requireCore: true });
  assert.ok(prepared.omittedUnitIds.includes(`${simple.id}:context:oracle-bait`));
});
