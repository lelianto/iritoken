import type { BenchmarkTask } from "./manifest.js";

/** Fresh synthetic corpus reserved for post-0.1 live provider validation. */
export const LIVE_V2_CORPUS_ID = "live-v2-2026-08-11-quartz";

export const LIVE_V2_TASKS: BenchmarkTask[] = [
  {
    name: "quartz-queue-incident",
    fixture: "live-v2-quartz-queue.txt",
    workload: "application-log",
    description: "Report the queue endpoint, shard, batch id, and terminal failure code.",
    verification: {
      mustContain: ["grpc://quartz-17.internal:7443", "shard=ember-6", "batch=Q2M-8841", "QZ-7419"],
    },
  },
  {
    name: "violet-stack-diagnosis",
    fixture: "live-v2-violet-stack.txt",
    workload: "stack-trace",
    description: "Report the exception, tenant, first application location, and upstream request id.",
    verification: {
      mustContain: ["LedgerWindowError", "tenant=violet-39", "src/ledger/window.ts:217:13", "req_7KM92P"],
    },
  },
  {
    name: "cobalt-build-failure",
    fixture: "live-v2-cobalt-build.txt",
    workload: "build-output",
    description: "Identify the failing stage, source diagnostic, manifest line, and process exit code.",
    verification: {
      mustContain: ["compiler 7/9", "src/cobalt/router.ts(88,27)", "Containerfile:31", "exit code: 17"],
    },
  },
  {
    name: "saffron-test-analysis",
    fixture: "live-v2-saffron-tests.txt",
    workload: "test-output",
    description: "Report the failed test, expected token, received token, and source location.",
    verification: {
      mustContain: ["rotates saffron lease", "lease_9ZP", "lease_2HD", "src/lease/rotate.test.ts:64"],
    },
  },
  {
    name: "indigo-deploy-forensics",
    fixture: "live-v2-indigo-deploy.txt",
    workload: "terminal-log",
    description: "Report the deployment id, region, final artifact digest, and rollback reason.",
    verification: {
      mustContain: ["deploy=IND-5528", "region=ap-south-2", "sha256:91ac77e5b4", "probe code PX-308"],
    },
  },
  {
    name: "opal-compiler-summary",
    fixture: "live-v2-opal-compiler.txt",
    workload: "compiler-output",
    description: "List both diagnostic codes, both file paths, and the final error count.",
    verification: {
      mustContain: ["OP204", "OP771", "src/opal/cache.op", "src/opal/codec.op", "Found 5 errors"],
    },
  },
];
