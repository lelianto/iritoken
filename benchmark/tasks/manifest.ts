/**
 * Quality-benchmark task definitions.
 *
 * A task models a real coding scenario whose context is a fixture, and
 * defines deterministic verification criteria. A task "succeeds" only when
 * every `mustContain` fact survives in the given context.
 *
 * For v0.1 the verification is deterministic substring/info-preservation
 * checks (an information-preservation proxy). The same task runner is
 * designed so a `BenchmarkProvider` can later replace the check with a real
 * LLM run of "ORIGINAL CONTEXT -> LLM -> RESULT A" vs
 * "OPTIMIZED CONTEXT -> LLM -> RESULT B".
 */

export interface TaskVerification {
  /** Facts required to still be present for the task to succeed. */
  mustContain: string[];
  /** Noise markers whose removal is REQUIRED (optional). */
  mustNotContain?: string[];
  /** Exact occurrence counts that carry meaning and must be preserved. */
  mustPreserveOccurrences?: Record<string, number>;
}

export interface BenchmarkTask {
  name: string;
  fixture: string;
  description: string;
  verification: TaskVerification;
  /** Optional pricing (USD per 1k tokens) used for cost-per-success. */
  pricing?: { inputPer1kTokens: number; outputPer1kTokens: number };
}

export const TASKS: BenchmarkTask[] = [
  {
    name: "semantic-whitespace-preservation",
    fixture: "semantic-whitespace.txt",
    description: "Preserve Markdown hard breaks and blank lines inside a YAML block scalar.",
    verification: {
      mustContain: [
        "Markdown hard break follows this line.  \n",
        "The previous two spaces are meaningful.  \n",
        "  first paragraph\n\n\n  second paragraph",
      ],
    },
  },
  {
    name: "source-code-repetition-preservation",
    fixture: "repeated-source-code.txt",
    description: "Preserve repeated source-code entries exactly instead of converting them into prose markers.",
    verification: {
      mustContain: ["export const values = [", "];"],
      mustNotContain: ["[repeated"],
      mustPreserveOccurrences: { '  "same-value",': 3 },
    },
  },
  {
    name: "instruction-repetition-preservation",
    fixture: "repeated-instructions.txt",
    description: "Preserve repeated natural-language instructions because repetition may be intentional.",
    verification: {
      mustContain: ["repeat this instruction exactly"],
      mustNotContain: ["[repeated"],
      mustPreserveOccurrences: { "repeat this instruction exactly": 3 },
    },
  },
  {
    name: "npm-error-diagnosis",
    fixture: "npm-install.txt",
    description: "Report the lifecycle error code, failing script, exact package version, and command that failed.",
    verification: {
      mustContain: [
        "ELIFECYCLE",
        "postinstall",
        "@vendor/pkg@1.4.2",
        "node scripts/build.js",
      ],
    },
  },
  {
    name: "tsc-fix-list",
    fixture: "tsc-errors.txt",
    description: "List every failing file and the code of each TypeScript error.",
    verification: {
      mustContain: [
        "src/services/auth.service.ts",
        "src/routes/users.route.ts",
        "src/models/user.model.ts",
        "src/utils/jwt.ts",
        "TS2345",
        "TS2322",
        "Found 9 errors",
      ],
    },
  },
  {
    name: "vitest-failure-analysis",
    fixture: "vitest-output.txt",
    description: "Identify the failed test, serialized error code, relevant source path, and final test summary.",
    verification: {
      mustContain: [
        "loads external plugin",
        "EPLUGIN",
        "/tmp/plug/loader.js",
        "Tests  51 passed | 1 failed",
      ],
    },
  },
  {
    name: "jest-failure-analysis",
    fixture: "jest-output.txt",
    description: "Identify the failed test and quote its expected value, received value, and source location.",
    verification: {
      mustContain: [
        "throws on invalid email",
        "Expected: [Error: invalid email]",
        "Received: [Error: missing at symbol]",
        "src/validate.test.ts:23",
      ],
    },
  },
  {
    name: "stack-understanding",
    fixture: "stack-trace.txt",
    description: "List every distinct runtime/root error and quote the relevant origin or evidence for each.",
    verification: {
      mustContain: [
        "TypeError: Cannot read properties of undefined (reading 'name')",
        "src/graph.ts:42",
        "ECONNRESET",
        "Maximum call stack size exceeded",
      ],
    },
  },
  {
    name: "log-forensics",
    fixture: "repetitive-logs.txt",
    description: "Report the connection target/configuration, lifecycle, final error code, and dead-letter outcome.",
    verification: {
      mustContain: [
        "connection lost (code=320)",
        "dead-letter",
        "localhost:5672",
        "prefetch=64",
      ],
    },
  },
  {
    name: "agent-context-understanding",
    fixture: "mixed-agent-context.txt",
    description: "Report the build source location, failed test, working branch, and final test summary.",
    verification: {
      mustContain: [
        "src/utils/helpers.ts:12",
        "validate › rejects empty string",
        "fix/validate-empty",
        "Tests  3 passed | 1 failed",
      ],
    },
  },
  {
    name: "docker-build-diagnosis",
    fixture: "docker-build.txt",
    description: "Identify the failing build stage, source diagnostic, Dockerfile line, and exit code.",
    verification: {
      mustContain: ["builder 5/6", "src/server.ts(42,18)", "Dockerfile:18", "exit code: 2"],
    },
  },
  {
    name: "kubernetes-incident",
    fixture: "kubernetes-events.txt",
    description: "Identify the pod, image, health failure, and missing secret.",
    verification: {
      mustContain: ["pod/api-7c9d", "api:2.4.1", "statuscode: 503", "api-config"],
    },
  },
  {
    name: "python-root-cause",
    fixture: "python-traceback.txt",
    description: "Identify both exceptions, origin, job, customer, and retry count.",
    verification: {
      mustContain: ["KeyError: 'account'", "/app/client.py", "invoice-4821", "customer-91", "5 attempts"],
    },
  },
];
