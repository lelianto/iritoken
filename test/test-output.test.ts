import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TestOutputCleaner } from "../src/cleaners/test-output.js";
import type { ContentDetection } from "../src/types.js";

const TEST_OUT: ContentDetection = { type: "test-output", confidence: "high" };
const TERMINAL: ContentDetection = { type: "generic-terminal-output", confidence: "high" };

const cleaner = new TestOutputCleaner();

describe("TestOutputCleaner", () => {
  it("collapses a run of passing test lines into a summary line", () => {
    const r = cleaner.clean(
      "✓ test A\n✓ test B\n✓ test C\n✓ test D\n\nTests: 4 passed\n",
      TEST_OUT,
    );
    assert.ok(r.text.includes("✓ 4 test cases passed"));
    assert.ok(r.text.includes("Tests: 4 passed"));
    assert.ok(!r.text.includes("✓ test A"));
    assert.equal(r.changes[0]?.count, 1);
  });

  it("does not collapse fewer than 3 passing lines", () => {
    const text = "✓ one\n✓ two\n\nFAILED: three\n";
    const r = cleaner.clean(text, TEST_OUT);
    assert.equal(r.text, text);
    assert.deepEqual(r.changes, []);
  });

  it("preserves failing test names, assertions, and summary", () => {
    const text = [
      "✓ passes one",
      "✓ passes two",
      "✓ passes three",
      "✓ passes four",
      "✗ fails hard",
      "  ● fails hard",
      "    expect(actual).toBe(expected)",
      "    Expected: 42",
      "    Received: 41",
      "Tests: 4 passed, 1 failed",
    ].join("\n");
    const r = cleaner.clean(text, TEST_OUT);
    assert.ok(r.text.includes("✗ fails hard"));
    assert.ok(r.text.includes("expect(actual).toBe(expected)"));
    assert.ok(r.text.includes("Expected: 42"));
    assert.ok(r.text.includes("Received: 41"));
    assert.ok(r.text.includes("Tests: 4 passed, 1 failed"));
    assert.ok(r.text.includes("✓ passes one"));
  });

  it("does not collapse passing-test context in a report containing a failure", () => {
    const text = "✓ pass one\n✓ pass two\n✓ pass three\nFAIL src/a.test.ts\nExpected: 1\nReceived: 2";
    const result = cleaner.clean(text, TEST_OUT);
    assert.equal(result.text, text);
    assert.deepEqual(result.changes, []);
  });

  it("does not run on non-test content", () => {
    const text = "✓ item one\n✓ item two\n✓ item three\n✓ item four\n✓ item five\n✓ item six";
    const r = cleaner.clean(text, TERMINAL);
    assert.equal(r.text, text);
    assert.deepEqual(r.changes, []);
  });

  it("is idempotent", () => {
    const input = "✓ a\n✓ b\n✓ c\n✓ d\n✓ e\n✗ f\n";
    const first = cleaner.clean(input, TEST_OUT);
    const second = cleaner.clean(first.text, TEST_OUT);
    assert.equal(second.text, first.text);
    assert.deepEqual(second.changes, []);
  });

  it("handles empty input", () => {
    const r = cleaner.clean("", TEST_OUT);
    assert.equal(r.text, "");
    assert.deepEqual(r.changes, []);
  });

  it("handles unicode test names", () => {
    const r = cleaner.clean("✓ héllo 漢字 1\n✓ héllo 漢字 2\n✓ héllo 漢字 3\n✓ héllo 漢字 4\n✓ héllo 漢字 5", TEST_OUT);
    assert.ok(r.text.includes("✓ 5 test cases passed"));
  });

  it("handles very large passing output", () => {
    const text = Array.from({ length: 500 }, (_, i) => `✓ test number ${i} passed fast`).join("\n");
    const r = cleaner.clean(text, TEST_OUT);
    assert.ok(r.text.includes("✓ 500 test cases passed"));
    assert.ok(r.text.length < text.length);
  });

  it("collapses runs that end at end of input", () => {
    const r = cleaner.clean(
      "✓ auth flow sends the correct token to the server\n✓ auth flow rejects a bad refresh token\n✓ auth flow expires the session after an hour\n✓ auth flow stores the refresh token safely\n✓ auth flow logs the user out cleanly",
      TEST_OUT,
    );
    assert.ok(r.text.includes("✓ 5 test cases passed"));
  });

  it("handles multiple separate passing runs", () => {
    const text =
      "✓ auth flow stores the refresh token safely\n✓ auth flow sends the correct token to the server\n✓ auth flow rejects a bad refresh token\n✓ auth flow expires the session after an hour\n×××\n✓ profile flow loads the user avatar\n✓ profile flow updates the display name\n✓ profile flow deletes the account safely\n";
    const r = cleaner.clean(text, TEST_OUT);
    assert.equal(r.changes[0]?.count, 2);
  });

  it("collapses pytest, Go, and Cargo passing tests", () => {
    const samples = [
      "tests/test_api.py::test_create PASSED [ 33%]\ntests/test_api.py::test_read PASSED [ 66%]\ntests/test_api.py::test_delete PASSED [100%]\n=== 3 passed in 0.03s ===",
      "=== RUN   TestCreate\n--- PASS: TestCreate (0.00s)\n=== RUN   TestRead\n--- PASS: TestRead (0.00s)\n=== RUN   TestDelete\n--- PASS: TestDelete (0.00s)\nPASS\nok example/api 0.003s",
      "test tests::create ... ok\ntest tests::read ... ok\ntest tests::delete ... ok\ntest result: ok. 3 passed; 0 failed",
    ];
    for (const text of samples) {
      const result = cleaner.clean(text, TEST_OUT);
      assert.match(result.text, /✓ 3 test cases passed/);
      assert.equal(result.changes[0]?.count, 1);
    }
  });

  it("preserves complete pytest, Go, and Cargo failure reports", () => {
    const samples = [
      "tests/test_api.py::test_create PASSED [ 50%]\ntests/test_api.py::test_delete FAILED [100%]\nE assert 1 == 2\n=== 1 failed, 1 passed ===",
      "--- PASS: TestCreate (0.00s)\n--- FAIL: TestDelete (0.01s)\n    api_test.go:42: got 1, want 2\nFAIL",
      "test tests::create ... ok\ntest tests::delete ... FAILED\nassertion failed: left == right\ntest result: FAILED. 1 passed; 1 failed",
    ];
    for (const text of samples) assert.equal(cleaner.clean(text, TEST_OUT).text, text);
  });
});
