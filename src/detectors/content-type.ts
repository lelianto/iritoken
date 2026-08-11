import type { Confidence, ContentDetection, ContentType } from "../types.js";

/**
 * Deterministic content-type detection. Pure heuristics, no ML.
 *
 * Used to decide how aggressive individual cleaners may be and to label
 * the explain report. Detection is deliberately conservative: it only
 * switches away from "generic-terminal-output" when strong signals exist.
 */

const TEST_LINE = /^\s*(?:[✓√✔]|×|✗|✘|✕)\s/;
const TEST_LINE_PLAIN = /^(?:PASS|FAIL)\b/;
const TEST_SUMMARY = /^\s*(?:Test Files|Tests\s|Snapshots\s|Test Suites|Tests:)\s/;
const STACK_FRAME = /^\s+at\s.+/;
const STACK_FRAME_ANON = /^at\s.+/;
const STACK_HEADER = /\b(Error|Exception|Traceback)\b/;
const CODE_LINE =
  /^\s*(?:import\s|export\s|const\s|let\s|var\s|function\s|class\s|interface\s|type\s|return\s|if\s*\(|for\s*\(|while\s*\(|switch\s*\(|case\s|=>)/;
const ANSI_ESCAPE = /\x1b\[/;
const TERMINAL_LINE =
  /^(?:\[\d{2}:\d{2}:\d{2}(?:\.\d+)?\]|#\d+\s|npm\s+(?:WARN|warn|ERR!|error|notice)\b|Level\s+\d+\s+progress:|(?:added|removed|changed)\s+\d+\s+packages?\b|(?:up to date|found\s+\d+\s+vulnerabilit))/;

function classifyConfidence(score: number, strong: number): Confidence {
  if (score >= strong) return "high";
  if (score >= 1) return "medium";
  return "low";
}

export function classify(text: string): ContentDetection {
  const size = text.length;
  if (text.trim() === "") {
    return { type: "unknown", confidence: "high" };
  }

  const lines = text.split(/\r?\n/);
  const lineCount = lines.length;

  let testLines = 0;
  let summaryLines = 0;
  let stackFrames = 0;
  let stackHeaders = 0;
  let codeLines = 0;
  let ansiLines = 0;
  let terminalLines = 0;

  for (const line of lines) {
    if (TEST_LINE.test(line) || TEST_LINE_PLAIN.test(line)) testLines += 1;
    if (TEST_SUMMARY.test(line)) summaryLines += 1;
    if (STACK_FRAME.test(line) || STACK_FRAME_ANON.test(line)) stackFrames += 1;
    if (STACK_HEADER.test(line)) stackHeaders += 1;
    if (CODE_LINE.test(line)) codeLines += 1;
    if (ANSI_ESCAPE.test(line)) ansiLines += 1;
    if (TERMINAL_LINE.test(line)) terminalLines += 1;
  }

  const shortInput = size < 200 && lineCount <= 3;

  if (shortInput) {
    return { type: "unknown", confidence: "high" };
  }

  // Test-runner output wins when its markers are clearly present, because
  // failing tests embed stacks and code snippets that must not be detected
  // over the enclosing report.
  if (testLines >= 3 || (testLines >= 1 && summaryLines >= 1)) {
    return {
      type: "test-output",
      confidence: classifyConfidence(testLines, 8),
    };
  }

  // Raw V8-ish stack traces.
  if (stackFrames >= 3) {
    const conf: Confidence =
      stackHeaders >= 1 && stackFrames >= 5
        ? "high"
        : stackHeaders >= 1
          ? "medium"
          : "low";
    return { type: "stack-trace", confidence: conf };
  }

  // Source code.
  const codeShare = lineCount > 0 ? codeLines / lineCount : 0;
  if ((codeShare >= 0.4 && codeLines >= 6) || (codeShare >= 0.8 && codeLines >= 3)) {
    return {
      type: "source-code",
      confidence: classifyConfidence(codeLines, 20),
    };
  }

  // Terminal-produced output (including ANSI) is the safe default.
  if (ansiLines > 0) {
    return { type: "generic-terminal-output", confidence: "high" };
  }

  // Require several independently terminal-shaped lines. This recovers
  // confidence for plain-text logs without treating a single command-like
  // sentence as evidence that arbitrary prose or source is terminal output.
  if (terminalLines >= 3 && terminalLines / lineCount >= 0.25) {
    return { type: "generic-terminal-output", confidence: "high" };
  }

  // Short multi-line prose-like input gets the "unknown" label so the
  // whitespace cleaner skips the riskier inline-space rule. Prose is
  // recognised by actual sentence-final punctuation on multiple lines.
  let proseLines = 0;
  for (const line of lines) {
    if (/[.!?]["')]?\s*$/.test(line.trim())) proseLines += 1;
  }
  const proseShare = lineCount > 0 ? proseLines / lineCount : 0;
  if (proseShare >= 0.6 && proseLines >= 2 && size >= 120) {
    return { type: "unknown", confidence: "medium" };
  }

  return { type: "generic-terminal-output", confidence: "medium" };
}

export function describe(type: ContentType): string {
  switch (type) {
    case "generic-terminal-output":
      return "generic-terminal-output";
    case "source-code":
      return "source-code";
    case "stack-trace":
      return "stack-trace";
    case "test-output":
      return "test-output";
    case "unknown":
      return "unknown";
  }
}
