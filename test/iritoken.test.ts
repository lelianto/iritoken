import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createIritoken,
  type ContextUnit,
  type IritokenStageName,
} from "../src/index.js";

const characters = { count: (text: string): number => text.length };

function disabledPipeline() {
  return createIritoken({
    tokenCounter: characters,
    normalization: false,
    deduplication: false,
    structuredCompaction: false,
    relevanceFiltering: false,
    historyCompression: false,
    dependencySelection: false,
    outputOptimization: false,
  });
}

describe("createIritoken stage orchestration", () => {
  it("makes every requested optimization stage independently toggleable", () => {
    const units: ContextUnit[] = [
      { id: "a", content: "\x1b[31mVALUE\x1b[0m", importance: "IMPORTANT" },
      { id: "b", content: "{\n  \"value\": 1\n}", importance: "IMPORTANT" },
      { id: "c", content: "duplicate", kind: "tool-output" },
      { id: "d", content: "duplicate", kind: "tool-output" },
    ];
    const result = disabledPipeline().optimize({ query: "value", units });

    assert.deepEqual(result.units.map((unit) => unit.content), units.map((unit) => unit.content));
    assert.deepEqual(result.omittedUnitIds, []);
    const disabled = new Set<IritokenStageName>([
      "normalization", "deduplication", "structured-compaction",
      "relevance-filtering", "history-compression", "dependency-selection",
      "output-optimization",
    ]);
    for (const stage of result.stages) {
      if (disabled.has(stage.stage)) assert.equal(stage.enabled, false, stage.stage);
    }
  });

  it("runs deterministic normalization, exact deduplication, and structured compaction", () => {
    const result = createIritoken({
      tokenCounter: characters,
      normalization: true,
      deduplication: true,
      structuredCompaction: true,
      relevanceFiltering: false,
      historyCompression: false,
      dependencySelection: false,
    }).optimize({
      query: "value duplicate",
      units: [
        { id: "ansi", content: "\x1b[31mVALUE\x1b[0m", kind: "tool-output" },
        { id: "json", content: "{\n  \"value\": 1\n}", kind: "configuration" },
        { id: "first", content: "duplicate", kind: "tool-output" },
        { id: "second", content: "duplicate", kind: "tool-output" },
      ],
    });

    assert.equal(result.units.find((unit) => unit.id === "ansi")?.content, "VALUE");
    assert.equal(result.units.find((unit) => unit.id === "json")?.content, "{\"value\":1}");
    assert.ok(result.omittedUnitIds.includes("second"));
    assert.equal(result.ledger.find((entry) => entry.id === "second")?.representedBy, "first");
    assert.ok(result.metrics.verifiedRemovedTokens > 0);
    assert.equal(result.metrics.requiredCoverage.percentage, 100);
  });

  it("never removes MUST_KEEP units merely to reach a target", () => {
    const required = "critical acceptance criteria";
    const result = createIritoken({
      tokenCounter: characters,
      targetReductionPercentage: 90,
      normalization: false,
      deduplication: false,
      structuredCompaction: false,
      relevanceFiltering: false,
      historyCompression: false,
      dependencySelection: false,
    }).optimize({
      query: "critical",
      units: [
        { id: "required", content: required, kind: "acceptance-criteria" },
        { id: "optional", content: "dispensable note", importance: "OPTIONAL" },
      ],
    });

    assert.equal(result.units.find((unit) => unit.id === "required")?.content, required);
    assert.equal(result.metrics.requiredCoverage.percentage, 100);
    assert.equal(result.metrics.requiredTokens, required.length);
    assert.equal(result.metrics.targetAchievable, false);
    assert.match(result.metrics.riskReasons.join(" "), /target-unachievable/);
  });

  it("preserves exact duplicate MUST_KEEP units", () => {
    const result = createIritoken({
      tokenCounter: characters,
      relevanceFiltering: false,
      historyCompression: false,
      dependencySelection: false,
    }).optimize({
      query: "rule",
      units: [
        { id: "rule-a", content: "same rule", required: true },
        { id: "rule-b", content: "same rule", required: true },
      ],
    });
    assert.deepEqual(result.units.map((unit) => unit.id), ["rule-a", "rule-b"]);
    assert.equal(result.metrics.requiredCoverage.retained, 2);
  });

  it("promotes a duplicate representative to the strongest declared importance", () => {
    const result = createIritoken({
      tokenCounter: characters,
      relevanceFiltering: false,
      historyCompression: false,
      dependencySelection: false,
    }).optimize({
      query: "",
      units: [
        { id: "first", content: "shared evidence", kind: "tool-output" },
        { id: "second", content: "shared evidence", kind: "tool-output", importance: "IMPORTANT" },
      ],
    });
    assert.deepEqual(result.units.map((unit) => unit.id), ["first"]);
    assert.equal(result.ledger.find((entry) => entry.id === "first")?.importance, "IMPORTANT");
    assert.equal(result.ledger.find((entry) => entry.id === "second")?.representedBy, "first");
  });

  it("filters only removable low-relevance context and keeps recent history", () => {
    const result = createIritoken({
      tokenCounter: characters,
      minimumRelevanceScore: 0.1,
      keepRecentHistory: 1,
      relevanceFiltering: true,
      historyCompression: true,
      normalization: false,
      deduplication: false,
      structuredCompaction: false,
      dependencySelection: false,
    }).optimize({
      query: "database timeout",
      units: [
        { id: "requirement", content: "Fix the database timeout", kind: "user-requirement" },
        { id: "source", content: "unrelated but declared source", kind: "source-code" },
        { id: "relevant-log", content: "database timeout at pool", kind: "tool-output" },
        { id: "noise", content: "CSS palette note", importance: "OPTIONAL" },
        { id: "old-turn", content: "ancient weather discussion", kind: "conversation", ordinal: 1 },
        { id: "latest-turn", content: "new unrelated follow-up", kind: "conversation", ordinal: 2 },
      ],
    });

    assert.ok(result.units.some((unit) => unit.id === "requirement"));
    assert.ok(result.units.some((unit) => unit.id === "source"));
    assert.ok(result.units.some((unit) => unit.id === "relevant-log"));
    assert.ok(result.units.some((unit) => unit.id === "latest-turn"));
    assert.ok(result.omittedUnitIds.includes("noise"));
    assert.ok(result.omittedUnitIds.includes("old-turn"));
    assert.equal(
      result.ledger.find((entry) => entry.id === "latest-turn")?.importance,
      "MUST_KEEP",
    );
  });

  it("restores and promotes dependencies of critical context", () => {
    const result = createIritoken({
      tokenCounter: characters,
      minimumRelevanceScore: 0.5,
      targetReductionPercentage: 0,
      relevanceFiltering: true,
      normalization: false,
      deduplication: false,
      structuredCompaction: false,
      historyCompression: false,
    }).optimize({
      query: "execute request",
      units: [
        {
          id: "code",
          content: "execute(request)",
          kind: "referenced-code",
          dependencies: ["types"],
        },
        {
          id: "types",
          content: "interface HiddenShape { value: string }",
          kind: "documentation",
          importance: "OPTIONAL",
        },
      ],
    });

    assert.deepEqual(result.units.map((unit) => unit.id), ["code", "types"]);
    assert.equal(result.ledger.find((entry) => entry.id === "types")?.importance, "MUST_KEEP");
    const dependencyStage = result.stages.find((stage) => stage.stage === "dependency-selection");
    assert.ok(dependencyStage?.decisions.some((decision) => decision.action === "restored"));
    assert.equal(result.metrics.requiredCoverage.percentage, 100);
  });

  it("surfaces unresolved dependencies without inventing a probability score", () => {
    const result = createIritoken({ tokenCounter: characters }).optimize({
      query: "fix",
      units: [{
        id: "code",
        content: "fix()",
        kind: "referenced-code",
        dependencies: ["missing-type"],
      }],
    });
    assert.deepEqual(result.metrics.riskReasons, ["unresolved-dependency:code->missing-type"]);
    assert.equal("qualityRiskScore" in result.metrics, false);
  });

  it("prioritizes higher-importance context within an achievable target", () => {
    const result = createIritoken({
      tokenCounter: characters,
      targetReductionPercentage: 50,
      normalization: false,
      deduplication: false,
      structuredCompaction: false,
      relevanceFiltering: false,
      historyCompression: false,
      dependencySelection: false,
    }).optimize({
      query: "",
      units: [
        { id: "must", content: "12345", required: true },
        { id: "important", content: "abcdefg", importance: "IMPORTANT" },
        { id: "optional", content: "hijklmnopqrs", importance: "OPTIONAL" },
      ],
    });
    assert.deepEqual(result.units.map((unit) => unit.id), ["must", "important"]);
    assert.equal(result.metrics.targetTokens, 12);
    assert.equal(result.metrics.targetAchievable, true);
    assert.equal(result.metrics.requiredCoverage.percentage, 100);
  });

  it("returns an explicit output policy without claiming input-token savings", () => {
    const result = createIritoken({
      tokenCounter: characters,
      outputOptimization: {
        format: "json",
        maxTokens: 128,
        preferPatch: true,
        suppressUnchanged: true,
      },
      normalization: false,
      deduplication: false,
      structuredCompaction: false,
      relevanceFiltering: false,
      historyCompression: false,
      dependencySelection: false,
    }).optimize({
      query: "change code",
      units: [{ id: "code", content: "const x = 1;", kind: "source-code" }],
    });
    assert.equal(result.outputPolicy?.format, "json");
    assert.equal(result.outputPolicy?.maxTokens, 128);
    assert.match(result.outputPolicy?.instruction ?? "", /patch or diff/);
    const outputStage = result.stages.find((stage) => stage.stage === "output-optimization");
    assert.equal(outputStage?.tokensRemoved, 0);
    assert.match(outputStage?.decisions[0]?.reason ?? "", /no-output-savings-claimed/);
  });

  it("is deterministic and does not mutate caller-owned units", () => {
    const units: ContextUnit[] = [
      { id: "query", content: "Fix E42", kind: "user-requirement" },
      { id: "log", content: "\x1b[31mE42\x1b[0m\n\n\nDetails", kind: "tool-output" },
    ];
    const snapshot = structuredClone(units);
    const engine = createIritoken({ tokenCounter: characters, targetReductionPercentage: 25 });
    const first = engine.optimize({ query: "Fix E42", units });
    const second = engine.optimize({ query: "Fix E42", units });
    assert.deepEqual(first, second);
    assert.deepEqual(units, snapshot);
  });

  it("validates targets, cardinality, identities, and token counters", () => {
    assert.throws(
      () => createIritoken({ tokenCounter: characters, targetReductionPercentage: 101 }),
      /targetReductionPercentage/,
    );
    assert.throws(
      () => createIritoken({ tokenCounter: characters, maxUnits: 1 }).optimize({
        query: "q",
        units: [{ id: "a", content: "a" }, { id: "b", content: "b" }],
      }),
      /unit count/,
    );
    assert.throws(
      () => disabledPipeline().optimize({
        query: "q",
        units: [{ id: "same", content: "a" }, { id: "same", content: "b" }],
      }),
      /duplicate context unit id/,
    );
    assert.throws(
      () => createIritoken({ tokenCounter: { count: () => -1 } }).optimize({
        query: "q", units: [{ id: "a", content: "a" }],
      }),
      /token counter/,
    );
    assert.throws(
      () => createIritoken({ tokenCounter: characters, maxTotalCharacters: 2 }).optimize({
        query: "q", units: [{ id: "a", content: "ab" }],
      }),
      /too large/,
    );
    assert.throws(
      () => createIritoken({
        tokenCounter: characters,
        outputOptimization: { maxTokens: 0 },
      }).optimize({ query: "q", units: [] }),
      /maxTokens/,
    );
  });
});
