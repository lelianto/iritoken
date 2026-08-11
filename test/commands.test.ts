import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyCommand, optimizeCommandOutput } from "../src/integrations/commands.js";

describe("command-aware integration", () => {
  it("classifies known command families without executing input", () => {
    assert.equal(classifyCommand("npm test -- --run").family, "test");
    assert.equal(classifyCommand("/usr/local/bin/pytest -q").family, "test");
    assert.equal(classifyCommand("git diff --cached").family, "version-control");
    assert.equal(classifyCommand("kubectl logs api").family, "logs");
    assert.equal(classifyCommand("cat package.json").family, "read");
    assert.equal(classifyCommand("custom-command --token secret").family, "unknown");
  });

  it("selects balanced for test provenance and reports the profile", () => {
    const output = [
      "PASS src/a.test.ts",
      "PASS src/a.test.ts",
      "PASS src/a.test.ts",
      "Tests: 3 passed, 3 total",
    ].join("\n");
    const result = optimizeCommandOutput("npm test", output);
    assert.equal(result.command.family, "test");
    assert.equal(result.command.preset, "balanced");
    assert.ok(result.text.length <= output.length);
  });

  it("allows an explicit preset to override the profile", () => {
    const output = "line\nline\nline\n";
    const result = optimizeCommandOutput("git status", output, { preset: "aggressive" });
    assert.equal(result.command.preset, "safe");
    assert.ok(result.text.length <= output.length);
  });
});

