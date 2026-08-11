import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateQualityGate, type QualityCase } from "../src/evaluation/quality-gate.js";

interface Facts { facts: string[] }

function factCase(id: string, context: string, required: string[]): QualityCase<Facts> {
  return {
    id,
    context,
    async run(value) {
      await Promise.resolve();
      return { facts: required.filter((fact) => value.includes(fact)) };
    },
    score(result) {
      return result.facts.length / required.length;
    },
  };
}

describe("quality gate", () => {
  it("passes paired cases when facts survive and the reduction target is met", async () => {
    const cases = [
      factCase("ansi", "\x1b[31mERROR E42\x1b[0m\n\n\n\nfile.ts:7\n", ["ERROR E42", "file.ts:7"]),
      factCase("duplicates", "Connecting\nConnecting\nConnecting\nFAILED queue-9\n", ["Connecting", "FAILED queue-9"]),
    ];
    const result = await evaluateQualityGate(cases, {
      optimize: { preset: "balanced" },
      minimumReductionPercentage: 5,
      maximumMeanQualityRegression: 0,
      maximumCaseQualityRegression: 0,
    });
    assert.equal(result.passed, true);
    assert.equal(result.meanQualityDelta, 0);
    assert.ok(result.aggregateReductionPercentage >= 5);
    assert.equal(result.cases.length, 2);
  });

  it("reports both insufficient saving and per-case quality regressions", async () => {
    const context = "\x1b[31mrepeat\x1b[0m\nterminal failure\n";
    const result = await evaluateQualityGate([{
      id: "deliberate-regression",
      context,
      run: (value) => value,
      score: (value) => value === context ? 1 : 0,
    }], {
      minimumReductionPercentage: 99,
      maximumMeanQualityRegression: 0,
      maximumCaseQualityRegression: 0,
    });
    assert.equal(result.passed, false);
    assert.ok(result.failures.some((failure) => failure.startsWith("reduction")));
    assert.ok(result.failures.some((failure) => failure.startsWith("mean quality")));
    assert.ok(result.failures.some((failure) => failure.includes("deliberate-regression")));
  });

  it("rejects empty suites and invalid scorer results", async () => {
    await assert.rejects(() => evaluateQualityGate([]), RangeError);
    await assert.rejects(() => evaluateQualityGate([{
      id: "bad-score", context: "x", run: () => "x", score: () => Number.NaN,
    }]), /non-finite score/);
  });

  it("rejects nonsensical policy thresholds", async () => {
    const cases = [{ id: "x", context: "x", run: () => 1, score: (value: number) => value }];
    await assert.rejects(
      () => evaluateQualityGate(cases, { minimumReductionPercentage: 101 }),
      /between 0 and 100/,
    );
    await assert.rejects(
      () => evaluateQualityGate(cases, { maximumMeanQualityRegression: -1 }),
      /non-negative/,
    );
    await assert.rejects(
      () => evaluateQualityGate(cases, { maximumCaseQualityRegression: Number.NaN }),
      /non-negative/,
    );
  });
});
