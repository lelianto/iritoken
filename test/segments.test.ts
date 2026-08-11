import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { optimizeSegments } from "../src/index.js";

describe("optimizeSegments", () => {
  it("optimizes declared terminal fences and preserves everything else exactly", () => {
    const markdown = [
      "# Incident notes\n\nProse  stays  exact.\n\n",
      "```terminal\n\x1b[31mERROR\x1b[0m\n\n\n\n\n```\n",
      "```typescript\nconst  value = 1;\n```\n",
    ].join("");
    const result = optimizeSegments(markdown);
    assert.equal(result.text, [
      "# Incident notes\n\nProse  stays  exact.\n\n",
      "```terminal\nERROR\n\n```\n",
      "```typescript\nconst  value = 1;\n```\n",
    ].join(""));
    assert.equal(result.segmentsFound, 2);
    assert.equal(result.segmentsOptimized, 1);
    assert.equal(result.segments.length, 1);
  });

  it("supports tilde fences and is idempotent", () => {
    const markdown = "Before\n~~~console-output\n\x1b[32mPASS\x1b[0m\n~~~\nAfter\n";
    const once = optimizeSegments(markdown, { preset: "balanced" });
    const twice = optimizeSegments(once.text, { preset: "balanced" });
    assert.equal(once.text, "Before\n~~~console-output\nPASS\n~~~\nAfter\n");
    assert.equal(twice.text, once.text);
  });

  it("does nothing to unlabelled and shell source fences", () => {
    const markdown = "```\n\x1b[31mraw\x1b[0m\n```\n```shell\necho  hello\n```\n";
    assert.equal(optimizeSegments(markdown).text, markdown);
  });
});
