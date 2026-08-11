import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DuplicateLinesCleaner } from "../src/cleaners/duplicate-lines.js";
import type { ContentDetection } from "../src/types.js";

const TERMINAL: ContentDetection = { type: "generic-terminal-output", confidence: "high" };

const cleaner = new DuplicateLinesCleaner();

describe("DuplicateLinesCleaner", () => {
  it("collapses consecutive identical lines with a repeated marker", () => {
    const r = cleaner.clean(
      "Connecting...\nConnecting...\nConnecting...\nConnecting...\nConnection failed",
      TERMINAL,
    );
    assert.equal(r.text, "Connecting... [repeated 4 times]\nConnection failed");
    assert.equal(r.changes[0]?.count, 1);
  });

  it("collapses the whole file when every line repeats", () => {
    const r = cleaner.clean(
      "session heartbeat ok\nsession heartbeat ok\nsession heartbeat ok",
      TERMINAL,
    );
    assert.equal(r.text, "session heartbeat ok [repeated 3 times]");
  });

  it("does not collapse identical lines that are not consecutive", () => {
    const text = "connecting\nfailure\nconnecting";
    const r = cleaner.clean(text, TERMINAL);
    assert.equal(r.text, text);
    assert.deepEqual(r.changes, []);
  });

  it("collapses multiple separate runs independently", () => {
    const text =
      "worker process finished cleanly\nworker process finished cleanly\nmiddle step\nnetwork retry failed once\nnetwork retry failed once\nnetwork retry failed once\nlast step\nmiddle step\nworker process finished cleanly";
    const r = cleaner.clean(text, TERMINAL);
    assert.equal(r.changes[0]?.count, 1);
    assert.ok(r.text.includes("worker process finished cleanly [repeated 2 times]"));
    assert.ok(r.text.includes("network retry failed once\nnetwork retry failed once\nnetwork retry failed once"));
    assert.ok(r.text.includes("middle step"));
  });

  it("does not collapse single lines", () => {
    const text = "a\nb\nc";
    const r = cleaner.clean(text, TERMINAL);
    assert.equal(r.text, text);
  });

  it("skips empty lines", () => {
    const text = "\n\n\n";
    const r = cleaner.clean(text, TERMINAL);
    assert.equal(r.text, text);
  });

  it("does not enlarge content when the marker is larger than the savings", () => {
    const text = "x\nx\nx";
    const r = cleaner.clean(text, TERMINAL);
    assert.equal(r.text, text); // unchanged: marker would be larger
  });

  it("distinguishes near-identical lines (trailing space) as not duplicates", () => {
    const text = "a\n a\n";
    const r = cleaner.clean(text, TERMINAL);
    assert.equal(r.text, text);
  });

  it("preserves repeated high-signal warning and error lines", () => {
    const text = "warning: retrying\nwarning: retrying\nwarning: retrying\nerror: lost\nerror: lost\nerror: lost";
    assert.equal(cleaner.clean(text, TERMINAL).text, text);
  });

  it("handles unicode lines", () => {
    const text = "✓ test α suite passed\n✓ test α suite passed\n✓ test α suite passed";
    const r = cleaner.clean(text, TERMINAL);
    assert.equal(r.text, "✓ test α suite passed [repeated 3 times]");
  });

  it("returns empty text unchanged", () => {
    const r = cleaner.clean("", TERMINAL);
    assert.equal(r.text, "");
    assert.deepEqual(r.changes, []);
  });

  it("handles text with no trailing newline", () => {
    const r = cleaner.clean(
      "connection poll attempt\nconnection poll attempt\nconnection poll attempt",
      TERMINAL,
    );
    assert.equal(r.text, "connection poll attempt [repeated 3 times]");
  });

  it("preserves CRLF line endings", () => {
    const r = cleaner.clean(
      "connection poll attempt\r\nconnection poll attempt\r\nconnection poll attempt\r\ndone",
      TERMINAL,
    );
    assert.equal(r.text, "connection poll attempt [repeated 3 times]\r\ndone");
  });

  it("does not re-collapse existing markers (idempotent)", () => {
    const once = cleaner.clean("a\na\na\na", TERMINAL);
    const twice = cleaner.clean(once.text, TERMINAL);
    assert.equal(twice.text, once.text);
    assert.deepEqual(twice.changes, []);
  });

  it("handles very large input", () => {
    const line = "something repeated heavily\n";
    const big = line.repeat(10000) + "done\n";
    const r = cleaner.clean(big, TERMINAL);
    assert.ok(r.text.includes("[repeated 10000 times]"));
    assert.ok(r.text.length < big.length);
  });
});
