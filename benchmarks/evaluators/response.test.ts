import assert from "node:assert/strict";
import test from "node:test";
import { TARGET_CONFIGURATIONS, FULL_STACK_TARGET_CONFIGURATIONS } from "../scenarios/ablations.js";
import { SCENARIOS, toPublicScenario, validateScenarioManifest } from "../scenarios/manifest.js";
import { parseModelResponse, scoreFactCoverage, scoreTurnResponse } from "./response.js";

test("scenario manifest covers every required category and strips hidden rubrics", () => {
  validateScenarioManifest();
  assert.equal(new Set(SCENARIOS.map((scenario) => scenario.category)).size, 6);
  for (const scenario of SCENARIOS) {
    const publicScenario = toPublicScenario(scenario);
    for (const turn of publicScenario.turns) assert.equal("rubric" in turn, false);
  }
});

test("primary target comparisons never enable output optimization", () => {
  assert.deepEqual(TARGET_CONFIGURATIONS.map((configuration) => configuration.target), [0, 25, 50, 60, 70, 80, 90]);
  for (const configuration of TARGET_CONFIGURATIONS) {
    assert.equal(configuration.primaryComparison, true);
    assert.equal(configuration.enabledStages.includes("outputOptimization"), false);
  }
  assert.ok(FULL_STACK_TARGET_CONFIGURATIONS.every((configuration) => configuration.enabledStages.includes("outputOptimization")));
});

test("parser requires the exact JSON response schema but safely recovers fields", () => {
  const valid = parseModelResponse('{"answer":"ok","patch":"return 1;","evidence":["source"]}');
  assert.equal(valid.validJson, true);
  const fenced = parseModelResponse('```json\n{"answer":"ok","patch":"","evidence":[]}\n```');
  assert.equal(fenced.validJson, false);
  assert.equal(fenced.answer, "ok");
  const extra = parseModelResponse('{"answer":"ok","patch":"","evidence":[],"score":1}');
  assert.equal(extra.validJson, false);
});

test("fact matching uses normalized token boundaries", () => {
  assert.equal(scoreFactCoverage("TTL is 45 seconds", [{ id: "ttl", alternatives: ["45"] }]).coverage, 1);
  assert.equal(scoreFactCoverage("TTL is 145 seconds", [{ id: "ttl", alternatives: ["45"] }]).coverage, 0);
  assert.equal(scoreFactCoverage("Use X-Orchid-Revision", [{ id: "header", alternatives: ["x orchid revision"] }]).coverage, 1);
});

test("deterministic scoring inspects code shape without executing model code", () => {
  const marker = "__iritokenEvaluatorExecuted";
  Reflect.deleteProperty(globalThis, marker);
  const raw = JSON.stringify({
    answer: "uses NFKC",
    patch: `(globalThis as any).${marker} = true;\nexport function normalizeKey(v: string) { return v.normalize('NFKC'); }`,
    evidence: ["NFKC"],
  });
  const scored = scoreTurnResponse(raw, {
    facts: [{ id: "nfkc", alternatives: ["NFKC"], critical: true }],
    acceptance: [{ id: "export", description: "exports function", target: "patch", kind: "contains", value: "normalizeKey", critical: true }],
    codeShape: { requiredPatterns: ["export function"], forbiddenPatterns: ["eval\\s*\\("] },
  });
  assert.equal(scored.quality.factCoverage, 1);
  assert.equal(scored.quality.syntaxValid, true);
  assert.equal(Reflect.has(globalThis, marker), false);
});

test("syntax-invalid replacement code cannot pass a code task", () => {
  const scored = scoreTurnResponse(JSON.stringify({ answer: "ok", patch: "export function broken( {", evidence: [] }), {
    facts: [], acceptance: [], codeShape: { requiredPatterns: ["broken"] },
  });
  assert.equal(scored.quality.syntaxChecked, true);
  assert.equal(scored.quality.syntaxValid, false);
  assert.equal(scored.quality.taskSuccess, false);
  assert.ok(scored.quality.syntaxDiagnostics.length > 0);
});
