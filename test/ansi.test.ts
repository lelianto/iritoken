import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AnsiCleaner } from "../src/cleaners/ansi.js";
import type { ContentDetection } from "../src/types.js";

const TERMINAL: ContentDetection = { type: "generic-terminal-output", confidence: "high" };

const cleaner = new AnsiCleaner();

describe("AnsiCleaner", () => {
  it("removes color codes without changing text", () => {
    const r = cleaner.clean("\x1b[31mERROR\x1b[0m Something failed", TERMINAL);
    assert.equal(r.text, "ERROR Something failed");
    assert.equal(r.changes[0]?.count, 2);
  });

  it("removes bold, underline, and other SGR codes", () => {
    const r = cleaner.clean("a\x1b[1;4;38;5;196mb\x1b[0m c", TERMINAL);
    assert.equal(r.text, "ab c");
  });

  it("removes OSC sequences (e.g. window titles)", () => {
    const r = cleaner.clean("before\x1b]0;my-title\x07after", TERMINAL);
    assert.equal(r.text, "beforeafter");
  });

  it("returns empty text unchanged", () => {
    const r = cleaner.clean("", TERMINAL);
    assert.equal(r.text, "");
    assert.deepEqual(r.changes, []);
  });

  it("handles malformed/partial escape sequences conservatively", () => {
    const part = "\x1b[31m";
    assert.equal(cleaner.clean(part, TERMINAL).text, ""); // CSI with no final byte terminates anyway in strips
    // incomplete CSI that cannot finish should be left alone per grammar
    const incomplete = "a\x1b[2";
    const base = cleaner.clean(incomplete, TERMINAL);
    assert.equal(base.text, "a\x1b[2");
  });

  it("is idempotent", () => {
    const first = cleaner.clean("\x1b[32mok\x1b[0m", TERMINAL);
    const second = cleaner.clean(first.text, TERMINAL);
    assert.equal(second.text, first.text);
    assert.deepEqual(second.changes, []);
  });

  it("handles very large input", () => {
    const line = "log\x1b[90m \x1b[0m\n".repeat(1000);
    const r = cleaner.clean(line, TERMINAL);
    assert.equal(r.text, "log \n".repeat(1000));
  });

  it("preserves unicode characters untouched", () => {
    const r = cleaner.clean("✓ ▒ 漢字 café \x1b[31m失敗\x1b[0m", TERMINAL);
    assert.equal(r.text, "✓ ▒ 漢字 café 失敗");
  });

  it("does not modify plain text", () => {
    const plain = "plain text with no escapes\n  and indentation";
    const r = cleaner.clean(plain, TERMINAL);
    assert.equal(r.text, plain);
    assert.deepEqual(r.changes, []);
  });

  it("counts each removed sequence", () => {
    const r = cleaner.clean("\x1b[1m\x1b[2m\x1b[3m\x1b[0m", TERMINAL);
    assert.equal(r.changes[0]?.count, 4);
  });
});