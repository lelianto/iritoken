import { basename } from "node:path";
import { optimize } from "../pipeline/optimize.js";
import type { OptimizeOptions, OptimizeResult, PresetName } from "../types.js";

export type CommandFamily = "test" | "build" | "logs" | "version-control" | "read" | "unknown";

export interface CommandProfile {
  family: CommandFamily;
  executable: string;
  preset: PresetName;
  confidence: "high" | "medium" | "low";
}

const TEST_COMMANDS = new Set(["jest", "vitest", "pytest", "cargo", "go", "rspec"]);
const BUILD_COMMANDS = new Set(["npm", "npx", "pnpm", "yarn", "tsc", "eslint", "ruff"]);
const LOG_COMMANDS = new Set(["docker", "kubectl", "terraform", "journalctl"]);
const VERSION_CONTROL_COMMANDS = new Set(["git", "gh"]);
const READ_COMMANDS = new Set(["cat", "sed", "head", "tail", "rg", "grep", "find", "ls", "tree"]);

function firstExecutable(command: string): string {
  const first = command.trim().split(/\s+/u)[0] ?? "";
  return basename(first).toLowerCase();
}

export function classifyCommand(command: string): CommandProfile {
  const executable = firstExecutable(command);
  if (TEST_COMMANDS.has(executable)) {
    return { family: "test", executable, preset: "balanced", confidence: "high" };
  }
  if (BUILD_COMMANDS.has(executable)) {
    const isTest = /(?:^|\s)(?:test|run\s+test)(?:\s|$)/u.test(command);
    return { family: isTest ? "test" : "build", executable, preset: "balanced", confidence: "medium" };
  }
  if (LOG_COMMANDS.has(executable)) {
    return { family: "logs", executable, preset: "balanced", confidence: "high" };
  }
  if (VERSION_CONTROL_COMMANDS.has(executable)) {
    return { family: "version-control", executable, preset: "safe", confidence: "high" };
  }
  if (READ_COMMANDS.has(executable)) {
    return { family: "read", executable, preset: "safe", confidence: "high" };
  }
  return { family: "unknown", executable, preset: "safe", confidence: "low" };
}

export interface OptimizeCommandResult extends OptimizeResult {
  command: CommandProfile;
}

/** Select a conservative preset from command provenance, then use the audited core pipeline. */
export function optimizeCommandOutput(
  command: string,
  output: string,
  options: OptimizeOptions = {},
): OptimizeCommandResult {
  const profile = classifyCommand(command);
  const result = optimize(output, { ...options, preset: options.preset ?? profile.preset });
  return { ...result, command: profile };
}

