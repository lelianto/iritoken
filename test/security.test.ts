import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { optimize, InputLimitError } from "../src/index.js";

describe("security limits", () => {
  it("rejects library input over the configured character limit", () => {
    assert.throws(
      () => optimize("12345", { maxInputCharacters: 4 }),
      (error) => error instanceof InputLimitError && error.code === "ERR_IRITOKEN_INPUT_TOO_LARGE",
    );
  });

  it("rejects invalid limits", () => {
    assert.throws(() => optimize("x", { maxInputCharacters: -1 }), RangeError);
    assert.throws(() => optimize("x", { maxInputCharacters: Number.NaN }), RangeError);
  });
});
