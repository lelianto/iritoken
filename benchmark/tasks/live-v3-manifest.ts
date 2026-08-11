import type { BenchmarkTask } from "./manifest.js";

export interface LiveV3Task extends BenchmarkTask {
  command?: string;
}

/** Fresh corpus created only for the post-context-router live campaign. */
export const LIVE_V3_CORPUS_ID = "live-v3-2026-08-11-aurora";

export const LIVE_V3_TASKS: LiveV3Task[] = [
  {
    name: "aurora-jsonl-audit",
    fixture: "live-v3-aurora-jsonl.txt",
    workload: "structured-tool-output",
    command: "kubectl get events -o json",
    description: "Report the affected service, correlation id, policy verdict, and evidence object key.",
    verification: {
      mustContain: ["svc-aurora-payments", "corr_8VN4K2", "deny-quarantine", "evidence/2026/08/aurora-771.json"],
    },
  },
  {
    name: "topaz-stream-incident",
    fixture: "live-v3-topaz-stream.txt",
    workload: "application-log",
    command: "docker compose logs stream-worker",
    description: "Report the consumer group, partition, last committed offset, and terminal broker code.",
    verification: {
      mustContain: ["group=topaz-reconciler-4", "partition=27", "offset=884219", "BRK-5921"],
    },
  },
  {
    name: "helix-stack-investigation",
    fixture: "live-v3-helix-stack.txt",
    workload: "stack-trace",
    command: "node dist/worker.js",
    description: "Report the exception type, workspace, first application frame, and trace id.",
    verification: {
      mustContain: ["SnapshotFenceError", "workspace=helix-62", "src/snapshot/fence.ts:143:11", "trace_HX7P31"],
    },
  },
  {
    name: "marigold-test-failure",
    fixture: "live-v3-marigold-tests.txt",
    workload: "test-output",
    command: "pnpm vitest run src/marigold",
    description: "Report the failing test, expected revision, received revision, and assertion location.",
    verification: {
      mustContain: ["rejects stale marigold checkpoint", "rev_MG_440", "rev_MG_438", "src/marigold/checkpoint.test.ts:119"],
    },
  },
  {
    name: "nebula-build-diagnosis",
    fixture: "live-v3-nebula-build.txt",
    workload: "build-output",
    command: "docker buildx build .",
    description: "Report the failed build step, compiler diagnostic, build file location, and exit status.",
    verification: {
      mustContain: ["resolver 11/14", "src/nebula/graph.ts(203,18)", "Buildfile:47", "exit status 29"],
    },
  },
  {
    name: "pelican-deploy-forensics",
    fixture: "live-v3-pelican-deploy.txt",
    workload: "terminal-log",
    command: "kubectl rollout status deployment/pelican-api",
    description: "Report the rollout id, cluster, artifact digest, and final rollback trigger.",
    verification: {
      mustContain: ["rollout=PEL-9036", "cluster=sea-edge-4", "sha256:4df19a8c72e6", "health code HC-917"],
    },
  },
];

