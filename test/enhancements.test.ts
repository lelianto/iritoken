import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  fromEncoder,
  fromTokenizer,
  optimize,
  optimizeMessages,
} from "../src/index.js";
import { createOptimizeTransform, createTerminalOptimizeTransform } from "../src/stream.js";

describe("tokenizer adapters", () => {
  it("adapts encode and tokenize interfaces", () => {
    assert.equal(fromEncoder({ encode: (text) => [...text] }).count("abc"), 3);
    assert.equal(fromTokenizer({ tokenize: (text) => text.split(/\s+/) }).count("a b"), 2);
  });
});

describe("message integration", () => {
  it("optimizes selected roles without mutating messages or system instructions", () => {
    const input = [
      { role: "system", content: "keep   exact" },
      { role: "tool", content: "\x1b[31mERROR\x1b[0m" },
    ];
    const result = optimizeMessages(input);
    assert.equal(result.messages[0]?.content, "keep   exact");
    assert.equal(result.messages[1]?.content, "ERROR");
    assert.equal(input[1]?.content, "\x1b[31mERROR\x1b[0m");
    assert.equal(result.stats.length, 1);
    assert.equal(result.messageStats[0]?.index, 1);
    assert.equal(result.messageStats[0]?.role, "tool");
    assert.equal(result.totalStats.originalCharacters, input[1]?.content.length);
    assert.equal(result.totalStats.optimizedCharacters, "ERROR".length);
    assert.deepEqual(result.totalStats.transformations, { ansi: 2 });
  });
});

describe("observability", () => {
  it("reports metadata-only decisions and completion", () => {
    const decisions: string[] = [];
    let complete = false;
    const result = optimize("\x1b[31mERROR\x1b[0m", {
      observer: {
        onCleaner: (decision) => decisions.push(`${decision.cleaner}:${decision.reason}`),
        onComplete: () => { complete = true; },
      },
    });
    assert.ok(decisions.includes("ansi:applied"));
    assert.ok(decisions.includes("stack-trace:disabled-by-preset"));
    assert.equal(result.stats.decisions.length, 6);
    assert.equal(complete, true);
  });
});

describe("stream integration", () => {
  const freshTerminalInput =
    "\x1b]0;nebula-run\x07\x1b[36mnebula shard online 😀\x1b[0m  \r\n" +
    "nebula shard online 😀\r\nnebula shard online 😀\r\nnebula shard online 😀\r\n\r\n\r\ncheckpoint zeta-91\r\n";
  const freshTerminalExpected =
    "nebula shard online 😀 [repeated 4 times]\r\n\r\ncheckpoint zeta-91\r\n";

  it("matches optimize across split UTF-8 chunks", async () => {
    const input = "\x1b[31mERROR 😀\x1b[0m\n";
    const bytes = Buffer.from(input);
    const source = Readable.from([bytes.subarray(0, 12), bytes.subarray(12, 16), bytes.subarray(16)]);
    const output: Buffer[] = [];
    for await (const chunk of source.pipe(createOptimizeTransform())) output.push(chunk as Buffer);
    assert.equal(Buffer.concat(output).toString("utf8"), optimize(input).text);
  });

  it("enforces byte limits", async () => {
    const stream = Readable.from(["too large"]).pipe(createOptimizeTransform({ maxInputBytes: 2 }));
    await assert.rejects(async () => {
      for await (const chunk of stream) void chunk;
    }, /input is too large/);
  });

  it("incrementally optimizes known terminal output across chunk boundaries", async () => {
    const input = "\x1b[32mterminal worker ready\x1b[0m   \nterminal worker ready\nterminal worker ready\nterminal worker ready\n\n\nfinished\n";
    const bytes = Buffer.from(input);
    const stats: Array<{ inputBytes: number; outputBytes: number }> = [];
    const transform = createTerminalOptimizeTransform({
      onStats: (value) => stats.push(value),
    });
    const output: Buffer[] = [];
    const chunks = Array.from({ length: bytes.length }, (_, index) => bytes.subarray(index, index + 1));
    for await (const chunk of Readable.from(chunks).pipe(transform)) output.push(chunk as Buffer);
    const text = Buffer.concat(output).toString("utf8");
    assert.equal(text, "terminal worker ready [repeated 4 times]\n\nfinished\n");
    assert.equal(stats[0]?.inputBytes, bytes.length);
    assert.equal(stats[0]?.outputBytes, Buffer.byteLength(text));
  });

  it("bounds newline-free terminal input", async () => {
    const stream = Readable.from(["12345"]).pipe(
      createTerminalOptimizeTransform({ maxLineBytes: 4 }),
    );
    await assert.rejects(async () => {
      for await (const chunk of stream) void chunk;
    }, /input is too large/);
  });

  it("is invariant across randomized byte chunk boundaries", async () => {
    const bytes = Buffer.from(freshTerminalInput);
    for (let seed = 1; seed <= 64; seed += 1) {
      let state = seed;
      const chunks: Buffer[] = [];
      for (let offset = 0; offset < bytes.length;) {
        state = (state * 1664525 + 1013904223) >>> 0;
        const width = 1 + (state % 11);
        chunks.push(bytes.subarray(offset, Math.min(bytes.length, offset + width)));
        offset += width;
      }
      const output: Buffer[] = [];
      for await (const chunk of Readable.from(chunks).pipe(createTerminalOptimizeTransform())) {
        output.push(chunk as Buffer);
      }
      assert.equal(Buffer.concat(output).toString("utf8"), freshTerminalExpected, `seed ${seed}`);
    }
  });

  it("honors downstream backpressure without losing data", async () => {
    const repeated = freshTerminalInput.repeat(200);
    const output: Buffer[] = [];
    const slowSink = new Writable({
      highWaterMark: 1,
      write(chunk: Buffer, _encoding, callback) {
        output.push(Buffer.from(chunk));
        setImmediate(callback);
      },
    });
    await pipeline(
      Readable.from(Array.from(Buffer.from(repeated), (byte) => Buffer.from([byte]))),
      createTerminalOptimizeTransform(),
      slowSink,
    );
    assert.equal(Buffer.concat(output).toString("utf8"), freshTerminalExpected.repeat(200));
  });
});

describe("distinct aggressive preset", () => {
  it("collapses repeated multiline terminal blocks only in aggressive mode", () => {
    const header = "Build started\nTarget: app\n";
    const input = `${header}${header}${header}ERROR: final failure\ncommand exited with code 1\n`;
    const balanced = optimize(input, { preset: "balanced" });
    const aggressive = optimize(input, { preset: "aggressive" });
    assert.ok(aggressive.text.length < balanced.text.length);
    assert.match(aggressive.text, /\[block repeated 3 times\]/);
    assert.equal(optimize(aggressive.text, { preset: "aggressive" }).text, aggressive.text);
  });
});
