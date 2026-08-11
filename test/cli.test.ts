import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../src/cli/index.js";

const CLI = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));

function runCli(args: string[], stdin?: string): { status: number; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    input: stdin,
    timeout: 30000,
  });
  return { status: res.status ?? -1, stdout: res.stdout, stderr: res.stderr };
}

let dir: string;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "iritoken-cli-"));
});

after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("iritoken CLI (built)", () => {
  it("prints usage for --help", () => {
    const r = runCli(["--help"]);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("Usage:"));
  });

  it("prints a version", () => {
    const r = runCli(["--version"]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /iritoken \d+\.\d+\.\d+/);
  });

  it("processes a file and prints a report", () => {
    const file = join(dir, "build.log");
    writeFileSync(file, "\x1b[31mERROR\x1b[0m\n\n\n\n\na\na\n");
    const r = runCli([file]);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("Original size"));
    assert.ok(r.stdout.includes("Reduction"));
    assert.ok(r.stdout.includes("ANSI"));
  });

  it("--output writes the optimized file", () => {
    const file = join(dir, "in.log");
    const out = join(dir, "out.log");
    writeFileSync(file, "\x1b[31mERROR\x1b[0m\n\n\n\n\na\na\n");
    const r = runCli([file, "--output", out]);
    assert.equal(r.status, 0);
    assert.ok(existsSync(out));
    const text = readFileSync(out, "utf8");
    assert.ok(text.includes("ERROR"));
    assert.ok(!text.includes("\x1b["));
  });

  it("--dry-run reports but does not write output", () => {
    const file = join(dir, "dry.log");
    const out = join(dir, "none.log");
    writeFileSync(file, "\x1b[31mE\x1b[0m\n");
    const r = runCli([file, "--dry-run", "--output", out]);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("Reduction"));
    assert.equal(existsSync(out), false);
  });

  it("--explain explains the changes", () => {
    const file = join(dir, "explain.log");
    writeFileSync(
      file,
      "\x1b[36mConnecting...\x1b[0m\n\x1b[36mConnecting...\x1b[0m\n\x1b[36mConnecting...\x1b[0m\nConnection failed\n",
    );
    const r = runCli([file, "--explain"]);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("iritoken Analysis"));
    assert.ok(r.stdout.includes("Groups collapsed:"));
    assert.ok(r.stdout.includes("Confidence:"));
  });

  it("--preset safe/balanced/aggressive are accepted", () => {
    const file = join(dir, "preset.log");
    writeFileSync(file, "Connecting...\nConnecting...\nConnecting...\nConnection failed\n");
    for (const preset of ["safe", "balanced", "aggressive"]) {
      const r = runCli([file, "--preset", preset]);
      assert.equal(r.status, 0, `${preset} should be accepted`);
    }
  });

  it("reads from stdin when piped", () => {
    const r = runCli([], "a\nb\nb\nb\nb\nc\n\n\n\n\nd");
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("Reduction"));
  });

  it("--stdout behaves as a composable Unix filter", () => {
    const r = runCli(["--stdout"], "\x1b[31mERROR\x1b[0m\n");
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "ERROR\n");
    assert.equal(r.stderr, "");
  });

  it("--json emits a versioned machine-readable result", () => {
    const r = runCli(["--json"], "\x1b[31mERROR\x1b[0m\n");
    assert.equal(r.status, 0);
    const value = JSON.parse(r.stdout) as { schemaVersion: number; text: string; stats: { decisions: unknown[] } };
    assert.equal(value.schemaVersion, 1);
    assert.equal(value.text, "ERROR\n");
    assert.ok(Array.isArray(value.stats.decisions));
  });

  it("reports UTF-8 bytes separately from character counts", () => {
    const file = join(dir, "unicode.log");
    writeFileSync(file, "😀\n");
    const report = runCli([file]);
    assert.equal(report.status, 0);
    assert.match(report.stdout, /5 B\s+3 chars/);

    const json = runCli([file, "--json"]);
    const value = JSON.parse(json.stdout) as {
      bytes: { original: number };
      stats: { originalCharacters: number };
    };
    assert.equal(value.bytes.original, 5);
    assert.equal(value.stats.originalCharacters, 3);
  });

  it("--quiet suppresses reports written alongside an output file", () => {
    const file = join(dir, "quiet-in.log");
    const out = join(dir, "quiet-out.log");
    writeFileSync(file, "\x1b[31mERROR\x1b[0m\n");
    const r = runCli([file, "--output", out, "--quiet"]);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    assert.equal(readFileSync(out, "utf8"), "ERROR\n");
  });

  it("rejects conflicting output modes", () => {
    const r = runCli(["--stdout", "--json"], "input");
    assert.equal(r.status, 2);
    assert.match(r.stderr, /cannot be combined/);
  });

  it("rejects stdin above the configured size limit", () => {
    const r = runCli(["--max-input-mb", "0.000001"], "too large");
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes("input is too large"));
  });

  it("rejects a file above the configured size limit", () => {
    const file = join(dir, "oversized.log");
    writeFileSync(file, "x".repeat(128 * 1024));
    const r = runCli([file, "--max-input-mb", "0.0625"]);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes("input is too large"));
  });

  it("refuses to overwrite the input file", () => {
    const file = join(dir, "same.log");
    writeFileSync(file, "original\n");
    const r = runCli([file, "--output", file]);
    assert.equal(r.status, 1);
    assert.equal(readFileSync(file, "utf8"), "original\n");
  });

  it("refuses an output hard link to the input file", () => {
    const file = join(dir, "hardlink-input.log");
    const link = join(dir, "hardlink-output.log");
    writeFileSync(file, "\x1b[31moriginal\x1b[0m\n");
    linkSync(file, link);
    const r = runCli([file, "--output", link]);
    assert.equal(r.status, 1);
    assert.equal(readFileSync(file, "utf8"), "\x1b[31moriginal\x1b[0m\n");
  });

  it("rejects a non-regular input path", () => {
    const r = runCli([dir]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /regular file/);
  });

  it("refuses an output symlink", async () => {
    const { symlinkSync } = await import("node:fs");
    const file = join(dir, "symlink-input.log");
    const target = join(dir, "symlink-target.log");
    const link = join(dir, "symlink-output.log");
    writeFileSync(file, "input\n");
    writeFileSync(target, "protected\n");
    symlinkSync(target, link);
    const r = runCli([file, "--output", link]);
    assert.equal(r.status, 1);
    assert.equal(readFileSync(target, "utf8"), "protected\n");
  });

  it("errors on unknown flags", () => {
    const r = runCli(["--nope"]);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes("Unknown option"));
  });

  it("errors on a missing file", () => {
    const r = runCli([join(dir, "does-not-exist.log")]);
    assert.equal(r.status, 1);
  });
});

describe("parseArgs", () => {
  it("parses preset, output, explain, dry-run", () => {
    const o = parseArgs(["f.log", "--preset", "balanced", "-o", "x.out", "--explain", "--dry-run"]);
    assert.equal(o.file, "f.log");
    assert.equal(o.preset, "balanced");
    assert.equal(o.output, "x.out");
    assert.equal(o.explain, true);
    assert.equal(o.dryRun, true);
  });

  it("rejects an unknown preset", () => {
    assert.throws(() => parseArgs(["--preset", "oops"]));
  });
});
