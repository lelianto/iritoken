#!/usr/bin/env node
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { optimize } from "../pipeline/optimize.js";
import { estimateTokens } from "../token/counter.js";
import type { OptimizeResult } from "../types.js";
import {
  DEFAULT_MAX_INPUT_BYTES,
  InputLimitError,
  safeDiagnostic,
} from "../security.js";

const require = createRequire(import.meta.url);

type PresetArg = "safe" | "balanced" | "aggressive";

interface CliOptions {
  file?: string;
  output?: string;
  preset: PresetArg;
  explain: boolean;
  dryRun: boolean;
  help: boolean;
  version: boolean;
  maxInputBytes: number;
  stdout: boolean;
  json: boolean;
  quiet: boolean;
}

const DISPLAY_OPERATIONS: Array<[string, string]> = [
  ["ansi", "ANSI"],
  ["whitespace", "Whitespace"],
  ["duplicate-lines", "Duplicates"],
  ["stack-trace", "Stack frames"],
  ["test-output", "Test output"],
  ["repeated-blocks", "Repeated blocks"],
];

const EXPLAIN_FRAMES: Record<string, [string, string]> = {
  ansi: ["ANSI escape sequences", "Removed:"],
  whitespace: ["Excessive whitespace", "Edits:"],
  "duplicate-lines": ["Consecutive duplicate lines", "Groups collapsed:"],
  "stack-trace": ["Repeated stack frames", "Groups collapsed:"],
  "test-output": ["Repeated passing test lines", "Runs collapsed:"],
  "repeated-blocks": ["Repeated multiline blocks", "Groups collapsed:"],
};

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    preset: "safe",
    explain: false,
    dryRun: false,
    help: false,
    version: false,
    maxInputBytes: DEFAULT_MAX_INPUT_BYTES,
    stdout: false,
    json: false,
    quiet: false,
  };

  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "-v":
      case "--version":
        options.version = true;
        break;
      case "--explain":
        options.explain = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--stdout":
        options.stdout = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "-q":
      case "--quiet":
        options.quiet = true;
        break;
      case "-o":
      case "--output":
      case "--preset":
      {
        i += 1;
        const value = argv[i];
        if (!value) {
          throw new Error(`${arg} requires a value`);
        }
        if (arg === "--output" || arg === "-o") {
          options.output = value;
        } else if (value !== "safe" && value !== "balanced" && value !== "aggressive") {
          throw new Error("--preset must be safe, balanced, or aggressive");
        } else {
          options.preset = value;
        }
        break;
      }
      case "--max-input-mb": {
        i += 1;
        const value = argv[i];
        const mib = value === undefined ? NaN : Number(value);
        if (!Number.isFinite(mib) || mib <= 0 || mib > 1024) {
          throw new Error("--max-input-mb must be a number between 0 and 1024");
        }
        options.maxInputBytes = Math.floor(mib * 1024 * 1024);
        break;
      }
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        positional.push(arg);
    }
  }

  options.file = positional[0];
  if (positional.length > 1) {
    throw new Error(`Unexpected argument: ${positional[1]}`);
  }
  if (options.stdout && options.output) {
    throw new Error("--stdout cannot be combined with --output");
  }
  if (options.stdout && options.json) {
    throw new Error("--stdout cannot be combined with --json");
  }
  if (options.dryRun && options.stdout) {
    throw new Error("--dry-run cannot be combined with --stdout");
  }
  return options;
}

const USAGE = `iritoken - deterministic token optimization for AI coding context

Usage:
  iritoken [file] [options]
  command | iritoken [options]

Reads a file, or stdin when no file is given and stdin is piped.

Options:
  -o, --output <path>   Write the optimized text to a file
  --preset <name>       safe (default) | balanced | aggressive
  --dry-run             Report statistics without writing output
  --stdout              Write only optimized text to stdout (Unix filter mode)
  --json                Write a stable machine-readable result as JSON
  -q, --quiet           Suppress the human report when using --output
  --max-input-mb <n>    Reject larger input (default: 16 MiB, max: 1024)
  --explain             Explain what would change
  -h, --help            Show this help
  -v, --version         Show the version

Examples:
  iritoken build.log
  npm test 2>&1 | iritoken
  npm test 2>&1 | iritoken --stdout > optimized.log
  iritoken build.log --json
  iritoken build.log --output optimized.log
  iritoken build.log --preset balanced --explain
`;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

interface ReadInputResult {
  text: string;
  fileStats?: Stats;
}

async function readInput(
  file: string | undefined,
  maximumBytes: number,
): Promise<ReadInputResult> {
  if (file) {
    const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const fileStats = fstatSync(fd);
      if (!fileStats.isFile()) throw new Error("input path must be a regular file");
      if (fileStats.size > maximumBytes) {
        throw new InputLimitError(fileStats.size, maximumBytes, "bytes");
      }

      const chunks: Buffer[] = [];
      const buffer = Buffer.allocUnsafe(64 * 1024);
      let bytes = 0;
      for (;;) {
        const bytesRead = readSync(fd, buffer, 0, buffer.byteLength, null);
        if (bytesRead === 0) break;
        bytes += bytesRead;
        if (bytes > maximumBytes) {
          throw new InputLimitError(bytes, maximumBytes, "bytes");
        }
        chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
      }
      return { text: Buffer.concat(chunks, bytes).toString("utf8"), fileStats };
    } finally {
      closeSync(fd);
    }
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maximumBytes) throw new InputLimitError(bytes, maximumBytes, "bytes");
    chunks.push(buffer);
  }
  return { text: Buffer.concat(chunks, bytes).toString("utf8") };
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function writeOutputSecurely(
  inputPath: string | undefined,
  inputStats: Stats | undefined,
  outputPath: string,
  text: string,
): void {
  if (inputPath) {
    try {
      if (realpathSync(inputPath) === realpathSync(outputPath)) {
        throw new Error("output path must not overwrite the input file");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  try {
    const outputStats = lstatSync(outputPath);
    if (outputStats.isSymbolicLink()) {
      throw new Error("refusing to write through an output symlink");
    }
    if (!outputStats.isFile()) throw new Error("output path must be a regular file");
    if (inputStats && sameFile(inputStats, outputStats)) {
      throw new Error("output path must not overwrite the input file");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const noFollow = constants.O_NOFOLLOW ?? 0;
  const outputDirectory = dirname(outputPath);
  const outputName = basename(outputPath);
  let temporaryPath = "";
  let fd = -1;
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      temporaryPath = join(
        outputDirectory,
        `.${outputName}.iritoken-${randomBytes(8).toString("hex")}.tmp`,
      );
      try {
        fd = openSync(
          temporaryPath,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
          0o600,
        );
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    if (fd === -1) throw new Error("could not create a temporary output file");
    if (!fstatSync(fd).isFile()) throw new Error("output path is not a regular file");
    writeFileSync(fd, text, "utf8");
    closeSync(fd);
    fd = -1;
    renameSync(temporaryPath, outputPath);
    temporaryPath = "";
  } finally {
    if (fd !== -1) closeSync(fd);
    if (temporaryPath) {
      try {
        unlinkSync(temporaryPath);
      } catch {
        // Preserve the original write error; a stale owner-only temp file is safer
        // than throwing from finally and hiding why the output operation failed.
      }
    }
  }
}

function renderReport(original: string, result: OptimizeResult): string {
  const s = result.stats;
  const originalBytes = Buffer.byteLength(original);
  const optimizedBytes = Buffer.byteLength(result.text);
  const rows: string[] = [
    "iritoken",
    "",
    `Original size     ${formatBytes(originalBytes).padEnd(10)} ${formatCount(s.originalCharacters)} chars`,
    `Optimized size    ${formatBytes(optimizedBytes).padEnd(10)} ${formatCount(s.optimizedCharacters)} chars`,
    `Reduction         ${s.reductionPercentage.toFixed(1)}%`,
  ];

  const estOrig = estimateTokens(original);
  const estOpt = estimateTokens(result.text);
  if (estOrig > 0) {
    rows.push(
      `Tokens (est.)      ${formatCount(estOrig)} -> ${formatCount(estOpt)} (heuristic)`,
    );
  }

  rows.push("", "Transformations");
  let wroteAny = false;
  for (const [id, label] of DISPLAY_OPERATIONS) {
    const count = s.transformations[id] ?? 0;
    rows.push(`${label.padEnd(18)}${count}`);
    wroteAny = wroteAny || count > 0;
  }
  if (!wroteAny) {
    rows.push("No transformations applied");
  }

  return rows.join("\n");
}

function renderExplain(original: string, result: OptimizeResult): string {
  const s = result.stats;
  const rows: string[] = ["iritoken Analysis", ""];

  let wroteAny = false;
  for (const [id, [title, verb]] of Object.entries(EXPLAIN_FRAMES)) {
    const count = s.transformations[id] ?? 0;
    if (count === 0) continue;
    wroteAny = true;
    rows.push(title, `${verb} ${formatCount(count)}`, "");
  }
  if (!wroteAny) {
    rows.push("Nothing to change.", "");
  }

  rows.push("Recognized content", `Type: ${s.detection.type}`, `Confidence: ${s.detection.confidence}`);

  const estOrig = estimateTokens(original);
  const estOpt = estimateTokens(result.text);
  rows.push(
    "",
    "Token estimate",
    `${formatCount(estOrig)} -> ${formatCount(estOpt)} tokens (heuristic, not exact model tokens)`,
  );

  return rows.join("\n");
}

export async function mainImpl(argv: string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`iritoken: ${safeDiagnostic(error)}\n\n${USAGE}`);
    return 2;
  }

  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (options.version) {
    let version = "0.2.1";
    try {
      const pkg = require("../../package.json") as { version: string };
      version = pkg.version;
    } catch {
      // fall back to the constant when package.json is not adjacent
    }
    process.stdout.write(`iritoken ${version}\n`);
    return 0;
  }

  if (!options.file && process.stdin.isTTY) {
    process.stdout.write(USAGE);
    return 0;
  }

  let inputResult: ReadInputResult;
  try {
    inputResult = await readInput(options.file, options.maxInputBytes);
  } catch (error) {
    process.stderr.write(`iritoken: could not read input: ${safeDiagnostic(error)}\n`);
    return 1;
  }

  const input = inputResult.text;
  const result = optimize(input, { preset: options.preset });

  if (options.output && !options.dryRun) {
    try {
      writeOutputSecurely(options.file, inputResult.fileStats, options.output, result.text);
    } catch (error) {
      process.stderr.write(`iritoken: could not write output: ${safeDiagnostic(error)}\n`);
      return 1;
    }
  }

  if (options.stdout) {
    process.stdout.write(result.text);
  } else if (options.json) {
    const originalBytes = Buffer.byteLength(input);
    const optimizedBytes = Buffer.byteLength(result.text);
    process.stdout.write(JSON.stringify({
      schemaVersion: 1,
      preset: options.preset,
      text: options.dryRun || options.output ? undefined : result.text,
      bytes: {
        original: originalBytes,
        optimized: optimizedBytes,
        removed: originalBytes - optimizedBytes,
        reductionPercentage: originalBytes === 0
          ? 0
          : Math.round(((originalBytes - optimizedBytes) / originalBytes) * 10_000) / 100,
      },
      stats: result.stats,
    }) + "\n");
  } else if (!(options.quiet && options.output)) {
    process.stdout.write((options.explain ? renderExplain(input, result) : renderReport(input, result)) + "\n");
  }
  return 0;
}

const ENTRY_FILE = process.argv[1];
if (ENTRY_FILE) {
  try {
    const resolvedEntry = realpathSync(ENTRY_FILE);
    if (resolvedEntry === fileURLToPath(import.meta.url)) {
      const code = await mainImpl(process.argv.slice(2));
      process.exitCode = code;
    }
  } catch {
    // not the entry module
  }
}
