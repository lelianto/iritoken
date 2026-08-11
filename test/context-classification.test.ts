import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyContextUnit,
  classifyContextUnits,
  type ContextImportance,
  type ContextUnit,
} from "../src/index.js";

describe("context-unit importance classification", () => {
  it("protects explicit, referenced, system, and critical-kind context", () => {
    const cases: Array<[ContextUnit, ContextImportance]> = [
      [{ id: "required", content: "x", required: true, importance: "OPTIONAL" }, "MUST_KEEP"],
      [{ id: "referenced", content: "x", referenced: true }, "MUST_KEEP"],
      [{ id: "system", content: "x", role: "system" }, "MUST_KEEP"],
      [{ id: "acceptance", content: "x", kind: "acceptance-criteria" }, "MUST_KEEP"],
      [{ id: "security", content: "x", kind: "security-requirement" }, "MUST_KEEP"],
      [{ id: "signature", content: "x", kind: "function-signature" }, "MUST_KEEP"],
      [{ id: "error", content: "x", kind: "error" }, "MUST_KEEP"],
    ];
    for (const [unit, expected] of cases) {
      assert.equal(classifyContextUnit(unit).importance, expected, unit.id);
    }
  });

  it("maps declared kinds conservatively and respects caller importance", () => {
    const classified = classifyContextUnits([
      { id: "source", content: "code", kind: "source-code" },
      { id: "tool", content: "log", kind: "tool-output" },
      { id: "metadata", content: "tree", kind: "repository-metadata" },
      { id: "caller", content: "note", importance: "OPTIONAL" },
      { id: "unknown", content: "opaque" },
      { id: "empty", content: "" },
    ]);
    assert.deepEqual(
      classified.map((unit) => unit.importance),
      ["IMPORTANT", "COMPRESSIBLE", "OPTIONAL", "OPTIONAL", "IMPORTANT", "REDUNDANT"],
    );
    assert.match(classified[4]?.classificationReasons.join(" ") ?? "", /conservative/);
  });

  it("clones dependency and metadata containers without mutating the caller", () => {
    const dependencies = ["types"];
    const metadata = { branch: "main" };
    const input: ContextUnit = { id: "code", content: "x", dependencies, metadata };
    const result = classifyContextUnit(input);
    dependencies.push("config");
    metadata.branch = "changed";
    assert.deepEqual(result.dependencies, ["types"]);
    assert.deepEqual(result.metadata, { branch: "main" });
    assert.equal(input.importance, undefined);
  });
});
