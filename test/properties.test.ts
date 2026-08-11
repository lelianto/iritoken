import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { optimize } from "../src/pipeline/optimize.js";
import type { PresetName, PresetOptions } from "../src/types.js";

const PRESET_NAMES: PresetName[] = ["safe", "balanced", "aggressive"];
const OPTION_NAMES: Array<keyof PresetOptions> = ["ansi", "whitespace", "duplicateLines", "stackTrace", "testOutput", "repeatedBlocks"];

function overrides(mask: number): Partial<PresetOptions> {
  return Object.fromEntries(OPTION_NAMES.map((name, bit) => [name, Boolean(mask & (1 << bit))]));
}

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function adversarialInputs(count: number): string[] {
  const next = rng(0x51ec_0bad);
  const atoms = ["\x1b[31m", "\x1b]0;title\x07", "\x1b]unfinished", "\0", "\r", "\n", "\r\n", "   ", "\t", "✓ test", "at run (x.ts:1:2)", "💥", "\ud800", "[repeated 2 times]"];
  return Array.from({ length: count }, () => {
    const length = next() % 1200;
    let value = "";
    while (value.length < length) value += atoms[next() % atoms.length];
    return value.slice(0, length);
  });
}

describe("optimization properties", () => {
  it("is deterministic, idempotent, and non-expanding for adversarial text", () => {
    for (const input of adversarialInputs(400)) {
      for (const preset of PRESET_NAMES) {
        const first = optimize(input, { preset });
        assert.equal(optimize(input, { preset }).text, first.text);
        assert.equal(optimize(first.text, { preset }).text, first.text);
        assert.ok(first.text.length <= input.length);
      }
    }
  });

  it("never enlarges across every preset and cleaner override combination", () => {
    for (const input of adversarialInputs(24)) {
      for (const preset of PRESET_NAMES) {
        for (let mask = 0; mask < 2 ** OPTION_NAMES.length; mask += 1) {
          const result = optimize(input, { preset, cleaners: overrides(mask) });
          assert.ok(result.text.length <= input.length, `${preset}, mask=${mask}`);
        }
      }
    }
  });
});
