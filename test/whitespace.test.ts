import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WhitespaceCleaner } from "../src/cleaners/whitespace.js";
import type { ContentDetection } from "../src/types.js";

const TERMINAL: ContentDetection = { type: "generic-terminal-output", confidence: "high" };
const SOURCE: ContentDetection = { type: "source-code", confidence: "high" };
const UNKNOWN: ContentDetection = { type: "unknown", confidence: "medium" };

const cleaner = new WhitespaceCleaner();

describe("WhitespaceCleaner", () => {
  it("collapses excessive blank lines to a single empty line", () => {
    const r = cleaner.clean("hello\n\n\n\n\n\n\nworld", TERMINAL);
    assert.equal(r.text, "hello\n\nworld");
  });

  it("removes trailing whitespace on each line", () => {
    const r = cleaner.clean("  a  \nb\t\n c\n", TERMINAL);
    assert.equal(r.text, "  a\nb\n c\n");
  });

  it("does not collapse a single blank line", () => {
    const text = "a\n\nb";
    const r = cleaner.clean(text, TERMINAL);
    assert.equal(r.text, text);
    assert.deepEqual(r.changes, []);
  });

  it("treats whitespace-only lines as blank", () => {
    const r = cleaner.clean("a\n   \n   \n\n\nb", TERMINAL);
    assert.equal(r.text, "a\n\nb");
  });

  it("preserves leading indentation", () => {
    const r = cleaner.clean("    const a = 1;\n        const b = 2;", TERMINAL);
    assert.equal(r.text, "    const a = 1;\n        const b = 2;");
  });

  it("collapses mid-line 3+ spaces only outside source/unknown content", () => {
    assert.equal(cleaner.clean("a   b", TERMINAL).text, "a b");
    // source code: untouched
    assert.equal(cleaner.clean("a   b", SOURCE).text, "a   b");
    // unknown/prose: untouched
    assert.equal(cleaner.clean("a   b", UNKNOWN).text, "a   b");
  });

  it("preserves diagnostic alignment unless generic terminal detection is high confidence", () => {
    const text = "12    const total = sum(items);\n        modified:   src/a.ts";
    assert.equal(cleaner.clean(text, { type: "test-output", confidence: "medium" }).text, text);
  });

  it("preserves semantic whitespace in Markdown, source, and unknown text", () => {
    const markdown = "first line  \nsecond line  \n";
    const yaml = "message: |\n  first\n\n\n  second\n";
    const source = "const snapshot = `first   value\n\n\nsecond`;\n";

    assert.equal(cleaner.clean(markdown, UNKNOWN).text, markdown);
    assert.equal(cleaner.clean(yaml, { type: "generic-terminal-output", confidence: "medium" }).text, yaml);
    assert.equal(cleaner.clean(source, SOURCE).text, source);
  });

  it("leaves double spaces in prose untouched", () => {
    assert.equal(cleaner.clean("a  b", TERMINAL).text, "a  b");
  });

  it("does not collapse internal padding of table-like lines", () => {
    assert.equal(cleaner.clean("a   |   b   |   c", TERMINAL).text, "a   |   b   |   c");
  });

  it("returns empty text unchanged", () => {
    const r = cleaner.clean("", TERMINAL);
    assert.equal(r.text, "");
    assert.deepEqual(r.changes, []);
  });

  it("handles CRLF input without mixing line endings", () => {
    const r = cleaner.clean("a\r\nb   \r\nc", TERMINAL);
    assert.equal(r.text, "a\r\nb\r\nc");
  });

  it("is idempotent", () => {
    const input = "x\n\n\n\n\n\ny\ny   \n";
    const first = cleaner.clean(input, TERMINAL);
    const second = cleaner.clean(first.text, TERMINAL);
    assert.equal(second.text, first.text);
    assert.deepEqual(second.changes, []);
  });

  it("handles very large input", () => {
    const big = ("line of text\n\n\n\n\n" ).repeat(5000);
    const r = cleaner.clean(big, TERMINAL);
    assert.ok(r.text.length < big.length);
  });

  it("preserves unicode characters", () => {
    const r = cleaner.clean("héllo   wörld\n\n\n\n✓ 漢字", TERMINAL);
    assert.ok(r.text.includes("héllo"));
    assert.ok(r.text.includes("漢字"));
    assert.ok(r.text.includes("✓"));
  });

  it("does not modify already-optimized input", () => {
    const optimized = "clean line\n\nnext line";
    const r = cleaner.clean(optimized, TERMINAL);
    assert.equal(r.text, optimized);
    assert.deepEqual(r.changes, []);
  });
});
