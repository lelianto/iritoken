import type { BenchmarkScenario, PublicScenario } from "../types.js";

const SYSTEM_INSTRUCTION = [
  "You are editing a synthetic repository. Use only the supplied context and do not execute commands.",
  "Return one JSON object with exactly these fields: answer (string), patch (string), evidence (array of strings).",
  "For code tasks, patch must contain complete TypeScript replacement source, never a unified diff. For multiple files, separate complete sources with lines formatted // FILE: relative/path.ts. Preserve exact identifiers and constraints.",
].join(" ");

export const SCENARIO_CORPUS_ID = "iritoken-evidence-v1-2026-08-11";

export const SCENARIOS: readonly BenchmarkScenario[] = [
  {
    id: "simple-normalize-key",
    clusterId: "repo-synthetic-toolkit",
    category: "simple-coding",
    title: "Implement a Unicode-safe key normalizer",
    description: "A small TypeScript utility task with a compact, nearly all-relevant context.",
    systemInstruction: SYSTEM_INSTRUCTION,
    context: [
      {
        id: "simple-requirements",
        kind: "requirement",
        importance: "must_keep",
        required: true,
        content: [
          "Implement normalizeKey in src/normalize-key.ts.",
          "Apply Unicode NFKC normalization, locale-independent lower-casing, trim outer whitespace,",
          "and replace each run of whitespace or underscores with one hyphen.",
          "Do not remove non-ASCII letters. Export the function and do not add dependencies.",
        ].join(" "),
      },
      {
        id: "simple-source",
        kind: "source",
        importance: "important",
        referenced: true,
        path: "src/normalize-key.ts",
        language: "typescript",
        content: "export function normalizeKey(value: string): string {\n  return value;\n}\n",
      },
      {
        id: "simple-test",
        kind: "test",
        importance: "important",
        path: "test/normalize-key.test.ts",
        language: "typescript",
        dependencies: ["simple-source"],
        content: [
          "assert.equal(normalizeKey('  Café__AU  LAIT '), 'café-au-lait');",
          "assert.equal(normalizeKey('Ｆｏｏ  BAR'), 'foo-bar');",
        ].join("\n"),
      },
    ],
    turns: [{
      id: "implement",
      instruction: "Provide the implementation patch and briefly identify the normalization order in answer and evidence.",
      rubric: {
        facts: [
          { id: "function", alternatives: ["normalizekey"], critical: true },
          { id: "unicode-form", alternatives: ["nfkc"], critical: true },
          { id: "non-ascii-example", alternatives: ["café-au-lait", "café au lait"] },
        ],
        acceptance: [
          { id: "export", description: "Exports normalizeKey", target: "patch", kind: "regex", value: "export\\s+function\\s+normalizeKey", flags: "i", critical: true },
          { id: "nfkc-call", description: "Uses NFKC normalization", target: "patch", kind: "regex", value: "normalize\\s*\\(\\s*['\\\"]NFKC['\\\"]\\s*\\)", flags: "i", critical: true },
          { id: "lowercase", description: "Lower-cases the value", target: "patch", kind: "regex", value: "to(?:Locale)?LowerCase\\s*\\(", flags: "i" },
          { id: "separator-run", description: "Compacts whitespace/underscore runs", target: "patch", kind: "regex", value: "[\\\\s_].*\\+|[\\\\s_]+", flags: "i" },
        ],
        codeShape: {
          requiredPatterns: ["normalizeKey", "return"],
          forbiddenPatterns: ["eval\\s*\\(", "new\\s+Function\\s*\\("],
          minimumPatchLines: 2,
          maximumPatchLines: 40,
        },
      },
    }],
  },
  {
    id: "medium-idempotent-widget-endpoint",
    clusterId: "repo-synthetic-api",
    category: "medium-coding",
    title: "Add an authenticated idempotent API endpoint",
    description: "A multi-file endpoint change with authentication, validation, and conflict semantics.",
    systemInstruction: SYSTEM_INSTRUCTION,
    context: [
      {
        id: "medium-requirements",
        kind: "requirement",
        importance: "must_keep",
        required: true,
        content: [
          "Add POST /v1/widgets. Call requireSession(request) before reading the body.",
          "The JSON body must contain a non-empty name no longer than 80 code points.",
          "Require the Idempotency-Key header. The repository returns the prior widget for a repeated key;",
          "if the key is reused with a different name, return HTTP 409 with code IDEMPOTENCY_CONFLICT.",
          "A newly created widget returns HTTP 201. Do not log the session token.",
        ].join(" "),
      },
      {
        id: "medium-router",
        kind: "source",
        importance: "important",
        path: "src/http/router.ts",
        language: "typescript",
        referenced: true,
        content: [
          "import { json, route } from './framework.js';",
          "import { requireSession } from '../auth/session.js';",
          "import { widgets } from '../widgets/repository.js';",
          "export const routes = [route('GET', '/health', async () => json(200, { ok: true }))];",
        ].join("\n"),
      },
      {
        id: "medium-repository",
        kind: "source",
        importance: "important",
        path: "src/widgets/repository.ts",
        language: "typescript",
        dependencies: ["medium-types"],
        content: [
          "export const widgets = {",
          "  async createOnce(input: { accountId: string; key: string; name: string }): Promise<{ kind: 'created' | 'replayed'; widget: Widget } | { kind: 'conflict' }> {",
          "    throw new Error('synthetic stub');",
          "  },",
          "};",
        ].join("\n"),
      },
      {
        id: "medium-types",
        kind: "type-definition",
        importance: "important",
        path: "src/widgets/types.ts",
        language: "typescript",
        content: "export interface Widget { id: string; accountId: string; name: string; createdAt: string }",
      },
      {
        id: "medium-framework",
        kind: "documentation",
        importance: "compressible",
        content: "Synthetic framework contract: json(status, body) returns Response; request.json() parses JSON; requireSession returns { accountId, token } or throws an HTTP error.",
      },
      {
        id: "medium-tests",
        kind: "test",
        importance: "important",
        path: "test/widgets.route.test.ts",
        language: "typescript",
        dependencies: ["medium-router", "medium-repository"],
        content: [
          "test('creates once', /* expects 201 */);",
          "test('replays same key and name', /* expects 200 and same id */);",
          "test('rejects key reused with another name', /* expects 409 IDEMPOTENCY_CONFLICT */);",
          "test('requires authentication before body parse', /* malformed body still yields 401 */);",
        ].join("\n"),
      },
    ],
    turns: [{
      id: "implement-endpoint",
      instruction: "Return a focused multi-file patch for the route and any helper needed. Explain the replay and conflict status behavior.",
      rubric: {
        facts: [
          { id: "route", alternatives: ["post /v1/widgets", "'/v1/widgets'", "\"/v1/widgets\""], critical: true },
          { id: "header", alternatives: ["idempotency-key"], critical: true },
          { id: "conflict-code", alternatives: ["idempotency_conflict"], critical: true },
          { id: "new-status", alternatives: ["201"] },
          { id: "conflict-status", alternatives: ["409"] },
        ],
        acceptance: [
          { id: "auth-first", description: "Calls requireSession", target: "patch", kind: "contains", value: "requireSession", critical: true },
          { id: "body-parse", description: "Parses JSON body", target: "patch", kind: "regex", value: "request\\.json\\s*\\(", flags: "i" },
          { id: "name-limit", description: "Enforces the 80-code-point limit", target: "combined", kind: "regex", value: "80", critical: true },
          { id: "repository-call", description: "Uses createOnce", target: "patch", kind: "contains", value: "createOnce", critical: true },
          { id: "no-token-log", description: "Does not introduce console logging", target: "patch", kind: "regex", value: "^(?![\\s\\S]*console\\.(?:log|info|debug))", flags: "i", critical: true },
        ],
        codeShape: {
          requiredPatterns: ["POST", "/v1/widgets", "Idempotency-Key"],
          forbiddenPatterns: ["console\\.(?:log|info|debug)", "eval\\s*\\("],
          minimumPatchLines: 8,
          maximumPatchLines: 180,
        },
      },
    }],
  },
  {
    id: "large-noisy-policy-cache",
    clusterId: "repo-synthetic-control-plane",
    category: "large-noisy-repository",
    title: "Fix tenant isolation in a policy cache",
    description: "A relevant four-file dependency chain surrounded by plausible repository noise and operational output.",
    systemInstruction: SYSTEM_INSTRUCTION,
    context: [
      {
        id: "large-requirements",
        kind: "requirement",
        importance: "must_keep",
        required: true,
        content: "Fix policy cache cross-tenant leakage. Cache identity must include tenantId, policyId, and etag. invalidatePolicy must remove every cached etag for exactly one tenantId/policyId pair. Preserve the 30 second TTL and the public loadPolicy signature.",
      },
      {
        id: "large-cache",
        kind: "source",
        importance: "important",
        referenced: true,
        path: "src/policy/cache.ts",
        language: "typescript",
        dependencies: ["large-policy-types"],
        content: [
          "const TTL_MS = 30_000;",
          "const cache = new Map<string, { expiresAt: number; value: CompiledPolicy }>();",
          "export async function loadPolicy(tenantId: string, policyId: string, etag: string): Promise<CompiledPolicy> {",
          "  const key = `${policyId}:${etag}`; // BUG: tenant omitted",
          "  const hit = cache.get(key);",
          "  if (hit && hit.expiresAt > Date.now()) return hit.value;",
          "  const value = await fetchAndCompilePolicy(tenantId, policyId, etag);",
          "  cache.set(key, { expiresAt: Date.now() + TTL_MS, value });",
          "  return value;",
          "}",
          "export function invalidatePolicy(_tenantId: string, policyId: string): void {",
          "  for (const key of cache.keys()) if (key.startsWith(`${policyId}:`)) cache.delete(key);",
          "}",
        ].join("\n"),
      },
      {
        id: "large-policy-types",
        kind: "type-definition",
        importance: "important",
        path: "src/policy/types.ts",
        language: "typescript",
        content: "export interface CompiledPolicy { tenantId: string; policyId: string; etag: string; rules: readonly string[] }",
      },
      {
        id: "large-policy-service",
        kind: "source",
        importance: "important",
        path: "src/policy/service.ts",
        language: "typescript",
        dependencies: ["large-cache"],
        content: "export async function updatePolicy(tenantId: string, policyId: string, body: unknown) { const saved = await repository.save(tenantId, policyId, body); invalidatePolicy(tenantId, policyId); return saved; }",
      },
      {
        id: "large-policy-test",
        kind: "test",
        importance: "important",
        path: "test/policy/cache.test.ts",
        language: "typescript",
        dependencies: ["large-cache", "large-policy-service"],
        content: [
          "it('does not share equal policy ids across tenants', async () => { /* acme/p-7 != globex/p-7 */ });",
          "it('retains other tenants when invalidating', async () => { /* invalidate acme/p-7; globex remains */ });",
          "it('expires entries after 30 seconds', async () => { /* fake clock */ });",
        ].join("\n"),
      },
      {
        id: "large-package",
        kind: "configuration",
        importance: "optional",
        path: "package.json",
        language: "json",
        content: "{\n  \"name\": \"synthetic-control-plane\",\n  \"type\": \"module\",\n  \"scripts\": { \"test\": \"vitest run\", \"lint\": \"eslint .\", \"build\": \"tsc\" },\n  \"dependencies\": { \"fastify\": \"5.2.1\", \"zod\": \"4.0.2\" }\n}",
      },
      {
        id: "large-billing-doc",
        kind: "documentation",
        importance: "optional",
        path: "docs/billing-rollup.md",
        content: "Billing rollups run at 02:15 UTC. The amber ledger uses settlement windows, invoice watermarks, and a retry queue. This subsystem does not import policy modules.",
      },
      {
        id: "large-deploy-log",
        kind: "terminal-output",
        importance: "compressible",
        command: "kubectl logs deployment/search-indexer",
        content: [
          "2026-08-10T13:05:00Z search-indexer shard=12 checkpoint=8801 status=healthy",
          "2026-08-10T13:05:01Z search-indexer shard=12 checkpoint=8801 status=healthy",
          "2026-08-10T13:05:02Z search-indexer shard=12 checkpoint=8801 status=healthy",
          "2026-08-10T13:05:03Z search-indexer shard=13 checkpoint=9914 status=healthy",
          "No policy-cache errors were emitted by this unrelated service.",
        ].join("\n"),
      },
      {
        id: "large-obsolete-architecture",
        kind: "documentation",
        importance: "optional",
        path: "docs/archive/policy-v1.md",
        content: "ARCHIVED: the 2024 design used a global policy id cache without tenant isolation. This document is superseded by the source and tests.",
      },
    ],
    turns: [{
      id: "fix-cache",
      instruction: "Return the minimal cache.ts patch. State the exact cache identity, invalidation boundary, and TTL that remain after the fix.",
      rubric: {
        facts: [
          { id: "tenant", alternatives: ["tenantid"], critical: true },
          { id: "policy", alternatives: ["policyid"], critical: true },
          { id: "etag", alternatives: ["etag"], critical: true },
          { id: "ttl", alternatives: ["30 seconds", "30 second", "30_000", "30000"] },
        ],
        acceptance: [
          { id: "three-part-key", description: "Key includes tenant, policy, and etag", target: "patch", kind: "regex", value: "tenantId[\\s\\S]{0,120}policyId[\\s\\S]{0,120}etag|tenantId.*policyId.*etag", flags: "i", critical: true },
          { id: "tenant-invalidation", description: "Invalidation includes tenant boundary", target: "patch", kind: "regex", value: "invalidatePolicy\\s*\\(\\s*tenantId[\\s\\S]{0,400}tenantId", flags: "i", critical: true },
          { id: "ttl-preserved", description: "Preserves 30 second TTL", target: "combined", kind: "regex", value: "30_?000|30\\s+seconds?", flags: "i" },
          { id: "signature", description: "Preserves loadPolicy signature", target: "patch", kind: "regex", value: "loadPolicy\\s*\\(\\s*tenantId\\s*:\\s*string\\s*,\\s*policyId\\s*:\\s*string\\s*,\\s*etag\\s*:\\s*string", flags: "i", critical: true },
        ],
        codeShape: {
          requiredPatterns: ["loadPolicy", "invalidatePolicy", "cache"],
          forbiddenPatterns: ["cache\\.clear\\s*\\(", "TTL_MS\\s*=\\s*0"],
          minimumPatchLines: 5,
          maximumPatchLines: 100,
        },
      },
    }],
  },
  {
    id: "session-job-state-machine",
    clusterId: "repo-synthetic-worker",
    category: "repeated-agent-session",
    title: "Five-turn state-machine repair session",
    description: "A coding-agent session that repeatedly carries unchanged source, configuration, prior analysis, and corrective feedback.",
    systemInstruction: SYSTEM_INSTRUCTION,
    context: [
      {
        id: "session-requirements",
        kind: "requirement",
        importance: "must_keep",
        required: true,
        content: "The worker state machine may transition QUEUED→RUNNING, RUNNING→PAUSED, PAUSED→RUNNING, and RUNNING→DONE. Every accepted transition appends one audit record. Invalid transitions return { ok: false, code: 'INVALID_TRANSITION' } and must not write an audit record.",
      },
      {
        id: "session-state-source",
        kind: "source",
        importance: "important",
        referenced: true,
        path: "src/jobs/transition.ts",
        language: "typescript",
        dependencies: ["session-state-types"],
        content: [
          "export async function transitionJob(job: Job, next: JobState): Promise<Result> {",
          "  if (job.state === 'QUEUED' && next === 'RUNNING') return accept(job, next);",
          "  if (job.state === 'RUNNING' && next === 'PAUSED') return accept(job, next);",
          "  if (job.state === 'RUNNING' && next === 'DONE') return accept(job, next);",
          "  return { ok: false, code: 'INVALID_TRANSITION' };",
          "}",
          "async function accept(job: Job, next: JobState): Promise<Result> { await audit.append(job.id, job.state, next); job.state = next; return { ok: true }; }",
        ].join("\n"),
      },
      {
        id: "session-state-types",
        kind: "type-definition",
        importance: "important",
        path: "src/jobs/types.ts",
        language: "typescript",
        content: "export type JobState = 'QUEUED' | 'RUNNING' | 'PAUSED' | 'DONE'; export interface Job { id: string; state: JobState }",
      },
      {
        id: "session-config",
        kind: "configuration",
        importance: "optional",
        path: "tsconfig.json",
        content: "{ \"compilerOptions\": { \"strict\": true, \"target\": \"ES2022\", \"module\": \"NodeNext\" } }",
      },
    ],
    turns: [
      {
        id: "inspect",
        instruction: "Inspect the supplied state machine and identify the missing valid transition. Do not patch yet.",
        rubric: {
          facts: [{ id: "missing-transition", alternatives: ["paused→running", "paused -> running", "paused to running"], critical: true }],
          acceptance: [{ id: "no-invalid-write", description: "Recognizes invalid paths do not audit", target: "combined", kind: "regex", value: "invalid[\\s\\S]{0,120}(?:no|not|must not)[\\s\\S]{0,80}audit|must not write", flags: "i" }],
          codeShape: { maximumPatchLines: 4 },
        },
      },
      {
        id: "implement",
        instruction: "Now provide the smallest transitionJob patch that adds the missing valid transition.",
        rubric: {
          facts: [{ id: "transition", alternatives: ["paused", "running"], critical: true }],
          acceptance: [{ id: "branch", description: "Adds PAUSED to RUNNING branch", target: "patch", kind: "regex", value: "job\\.state\\s*===?\\s*['\\\"]PAUSED['\\\"][\\s\\S]{0,120}next\\s*===?\\s*['\\\"]RUNNING['\\\"]", flags: "i", critical: true }],
          codeShape: { requiredPatterns: ["transitionJob", "PAUSED", "RUNNING"], minimumPatchLines: 2, maximumPatchLines: 40 },
        },
      },
      {
        id: "audit-check",
        instruction: "Verify whether your change can append duplicate audit records and explain why or adjust the patch.",
        rubric: {
          facts: [{ id: "one-audit", alternatives: ["one audit", "once", "single audit"], critical: true }],
          acceptance: [{ id: "accept-path", description: "Uses the existing accept helper once", target: "combined", kind: "regex", value: "accept\\s*\\(\\s*job\\s*,\\s*next\\s*\\)", flags: "i", critical: true }],
        },
      },
      {
        id: "type-correction",
        instruction: "A reviewer asks whether PAUSED is already part of JobState. Answer from the supplied type and do not invent a type edit.",
        rubric: {
          facts: [{ id: "already-present", alternatives: ["already", "is part", "includes paused"], critical: true }, { id: "job-state", alternatives: ["jobstate"] }],
          acceptance: [{ id: "no-type-edit", description: "Does not propose adding PAUSED to JobState", target: "combined", kind: "regex", value: "^(?![\\s\\S]*(?:add|insert)[\\s\\S]{0,80}PAUSED[\\s\\S]{0,80}JobState)", flags: "i", critical: true }],
        },
      },
      {
        id: "final",
        instruction: "Return the final focused patch and a concise regression-test list covering valid and invalid transitions.",
        rubric: {
          facts: [
            { id: "added-transition", alternatives: ["paused", "running"], critical: true },
            { id: "invalid-code", alternatives: ["invalid_transition"], critical: true },
            { id: "audit", alternatives: ["audit"] },
          ],
          acceptance: [
            { id: "final-branch", description: "Final patch has PAUSED to RUNNING", target: "patch", kind: "regex", value: "PAUSED[\\s\\S]{0,140}RUNNING", flags: "i", critical: true },
            { id: "tests-valid", description: "Mentions a valid transition regression test", target: "answer", kind: "regex", value: "test[\\s\\S]{0,160}PAUSED[\\s\\S]{0,80}RUNNING", flags: "i" },
            { id: "tests-invalid", description: "Mentions invalid transition behavior", target: "combined", kind: "contains", value: "INVALID_TRANSITION", critical: true },
          ],
          codeShape: { requiredPatterns: ["PAUSED", "RUNNING", "accept"], minimumPatchLines: 2, maximumPatchLines: 60 },
        },
      },
    ],
  },
  {
    id: "conversation-orchid-export",
    clusterId: "repo-synthetic-exporter",
    category: "long-conversation",
    title: "Long conversation with superseded export requirements",
    description: "A dialogue whose early requirements are explicitly replaced by a later audited specification.",
    systemInstruction: SYSTEM_INSTRUCTION,
    context: [
      {
        id: "conversation-source",
        kind: "source",
        importance: "important",
        referenced: true,
        path: "src/export/orchid.ts",
        language: "typescript",
        content: "export const orchidConfig = { region: 'us-east-1', ttlSeconds: 120, revisionHeader: 'X-Orchid-Version' };",
      },
      {
        id: "conversation-final-spec",
        kind: "requirement",
        importance: "must_keep",
        required: true,
        content: "FINAL AUDITED SPECIFICATION: use region ap-southeast-3, TTL 45 seconds, and response header X-Orchid-Revision. This supersedes every earlier region, TTL, and header. Preserve the exported orchidConfig name.",
      },
    ],
    seedHistory: [
      { role: "user", content: "Draft 1 requested eu-west-2, TTL 90, header X-Orchid-Version." },
      { role: "assistant", content: "Recorded draft 1; it may change after compliance review." },
      { role: "user", content: "Draft 2 changes the region to ap-northeast-1 but leaves TTL 90." },
      { role: "assistant", content: "Recorded draft 2 as provisional." },
      { role: "user", content: "Unrelated discussion: the metrics dashboard uses violet bars and seven-day windows." },
      { role: "assistant", content: "That dashboard note is unrelated to the exporter configuration." },
    ],
    turns: [
      {
        id: "resolve-spec",
        instruction: "Identify which specification governs and list the three effective configuration values.",
        rubric: {
          facts: [
            { id: "final", alternatives: ["final audited", "final specification"], critical: true },
            { id: "region", alternatives: ["ap-southeast-3"], critical: true },
            { id: "ttl", alternatives: ["45"] },
            { id: "header", alternatives: ["x-orchid-revision"], critical: true },
          ],
          acceptance: [{ id: "supersession", description: "Recognizes earlier drafts are superseded", target: "answer", kind: "regex", value: "supersed|final|audited", flags: "i", critical: true }],
        },
      },
      {
        id: "implement-final",
        instruction: "Patch orchidConfig to the final audited specification. Do not preserve obsolete values as fallbacks or comments.",
        rubric: {
          facts: [
            { id: "region", alternatives: ["ap-southeast-3"], critical: true },
            { id: "ttl", alternatives: ["45"], critical: true },
            { id: "header", alternatives: ["x-orchid-revision"], critical: true },
          ],
          acceptance: [
            { id: "export-name", description: "Preserves orchidConfig export", target: "patch", kind: "regex", value: "export\\s+const\\s+orchidConfig", flags: "i", critical: true },
            { id: "final-values", description: "Patch contains all final values", target: "patch", kind: "regex", value: "ap-southeast-3[\\s\\S]{0,180}45[\\s\\S]{0,180}X-Orchid-Revision", flags: "i", critical: true },
            { id: "no-obsolete-values", description: "Final replacement omits superseded values", target: "patch", kind: "regex", value: "^(?![\\s\\S]*(?:eu-west-2|ap-northeast-1|ttlSeconds\\s*:\\s*90))", flags: "i", critical: true },
          ],
          codeShape: { requiredPatterns: ["orchidConfig", "ap-southeast-3", "X-Orchid-Revision"], minimumPatchLines: 2, maximumPatchLines: 40 },
        },
      },
    ],
  },
  {
    id: "dense-payment-signature",
    clusterId: "repo-synthetic-payments",
    category: "dense-adversarial-context",
    title: "Dense signature verification context",
    description: "Nearly every line is required; aggressive compression should fail open rather than chase a target.",
    systemInstruction: SYSTEM_INSTRUCTION,
    context: [
      {
        id: "dense-security-requirements",
        kind: "requirement",
        importance: "must_keep",
        required: true,
        content: [
          "SECURITY REQUIREMENTS: verifyWebhook must reject before JSON parsing when X-Sable-Signature is absent.",
          "The signature is lower-case hex HMAC-SHA256 over the exact UTF-8 bytes:",
          "`${timestamp}.${nonce}.${rawBody}` in that order, with no trailing newline.",
          "Read X-Sable-Timestamp and X-Sable-Nonce. Timestamp skew must be at most 300 seconds.",
          "Reject a nonce already recorded for the same merchantId. Compare signatures with timingSafeEqual only after equal byte length is established.",
          "Return codes SIGNATURE_REQUIRED, TIMESTAMP_EXPIRED, NONCE_REPLAYED, or SIGNATURE_INVALID as applicable.",
        ].join(" "),
      },
      {
        id: "dense-source",
        kind: "source",
        importance: "must_keep",
        required: true,
        referenced: true,
        path: "src/webhooks/verify.ts",
        language: "typescript",
        dependencies: ["dense-types", "dense-nonce-store"],
        content: [
          "export async function verifyWebhook(input: VerifyInput): Promise<VerifyResult> {",
          "  const signature = input.headers.get('X-Sable-Signature');",
          "  const timestamp = input.headers.get('X-Sable-Timestamp');",
          "  const nonce = input.headers.get('X-Sable-Nonce');",
          "  // TODO: implement before input.parseJson() is called by the route",
          "  return { ok: false, code: 'SIGNATURE_INVALID' };",
          "}",
        ].join("\n"),
      },
      {
        id: "dense-types",
        kind: "type-definition",
        importance: "must_keep",
        required: true,
        path: "src/webhooks/types.ts",
        language: "typescript",
        content: [
          "export interface VerifyInput { merchantId: string; secret: Uint8Array; rawBody: string; headers: Headers; nowEpochSeconds: number }",
          "export type VerifyResult = { ok: true } | { ok: false; code: 'SIGNATURE_REQUIRED' | 'TIMESTAMP_EXPIRED' | 'NONCE_REPLAYED' | 'SIGNATURE_INVALID' };",
        ].join("\n"),
      },
      {
        id: "dense-nonce-store",
        kind: "source",
        importance: "must_keep",
        required: true,
        path: "src/webhooks/nonces.ts",
        language: "typescript",
        content: "export const nonces = { async has(merchantId: string, nonce: string): Promise<boolean> { return false; }, async record(merchantId: string, nonce: string, ttlSeconds: number): Promise<void> {} };",
      },
      {
        id: "dense-test",
        kind: "test",
        importance: "must_keep",
        required: true,
        path: "test/webhooks/verify.test.ts",
        language: "typescript",
        dependencies: ["dense-source", "dense-types", "dense-nonce-store"],
        content: [
          "it('uses exact timestamp.nonce.rawBody bytes without a newline');",
          "it('rejects 301 second skew but permits exactly 300 seconds');",
          "it('checks nonce replay within merchant scope');",
          "it('does not call timingSafeEqual for unequal byte lengths');",
          "it('does not parse JSON before authenticating raw bytes');",
        ].join("\n"),
      },
    ],
    turns: [{
      id: "implement-verifier",
      instruction: "Provide a focused verifyWebhook patch satisfying every security requirement, then enumerate the rejection order in evidence.",
      rubric: {
        facts: [
          { id: "canonical-order", alternatives: ["timestamp.nonce.rawbody", "timestamp}.${nonce}.${rawbody", "timestamp nonce rawbody"], critical: true },
          { id: "algorithm", alternatives: ["hmac-sha256", "sha256"], critical: true },
          { id: "skew", alternatives: ["300"] },
          { id: "signature-header", alternatives: ["x-sable-signature"], critical: true },
          { id: "nonce-header", alternatives: ["x-sable-nonce"], critical: true },
          { id: "timestamp-header", alternatives: ["x-sable-timestamp"], critical: true },
          { id: "constant-time", alternatives: ["timingsafeequal"], critical: true },
        ],
        acceptance: [
          { id: "required-code", description: "Handles missing signature", target: "patch", kind: "contains", value: "SIGNATURE_REQUIRED", critical: true },
          { id: "expired-code", description: "Handles timestamp expiry", target: "patch", kind: "contains", value: "TIMESTAMP_EXPIRED", critical: true },
          { id: "replay-code", description: "Handles nonce replay", target: "patch", kind: "contains", value: "NONCE_REPLAYED", critical: true },
          { id: "invalid-code", description: "Handles invalid signature", target: "patch", kind: "contains", value: "SIGNATURE_INVALID", critical: true },
          { id: "merchant-scope", description: "Scopes nonce lookup to merchant", target: "patch", kind: "regex", value: "nonces\\.has\\s*\\(\\s*input\\.merchantId\\s*,\\s*nonce", flags: "i", critical: true },
          { id: "length-check", description: "Checks equal lengths before timingSafeEqual", target: "patch", kind: "regex", value: "length[\\s\\S]{0,180}timingSafeEqual", flags: "i", critical: true },
          { id: "no-json-parse", description: "Does not parse JSON", target: "patch", kind: "regex", value: "^(?![\\s\\S]*(?:parseJson|JSON\\.parse))", flags: "i", critical: true },
        ],
        codeShape: {
          requiredPatterns: ["verifyWebhook", "createHmac", "timingSafeEqual", "nonces"],
          forbiddenPatterns: ["JSON\\.parse", "parseJson\\s*\\(", "===\\s*signature"],
          minimumPatchLines: 12,
          maximumPatchLines: 180,
        },
      },
    }],
  },
];

/** Strip all rubric fields before optimization or provider prompt construction. */
export function toPublicScenario(scenario: BenchmarkScenario): PublicScenario {
  return {
    id: scenario.id,
    clusterId: scenario.clusterId,
    category: scenario.category,
    title: scenario.title,
    description: scenario.description,
    systemInstruction: scenario.systemInstruction,
    context: scenario.context.map((block) => ({ ...block, dependencies: block.dependencies ? [...block.dependencies] : undefined })),
    seedHistory: scenario.seedHistory?.map((message) => ({ ...message })),
    turns: scenario.turns.map((turn) => ({ id: turn.id, instruction: turn.instruction })),
  };
}

export function validateScenarioManifest(scenarios: readonly BenchmarkScenario[] = SCENARIOS): void {
  const ids = new Set<string>();
  const requiredCategories = new Set([
    "simple-coding",
    "medium-coding",
    "large-noisy-repository",
    "repeated-agent-session",
    "long-conversation",
    "dense-adversarial-context",
  ]);
  for (const scenario of scenarios) {
    if (ids.has(scenario.id)) throw new Error(`duplicate scenario id: ${scenario.id}`);
    ids.add(scenario.id);
    requiredCategories.delete(scenario.category);
    if (scenario.turns.length === 0) throw new Error(`${scenario.id} has no turns`);
    const blockIds = new Set(scenario.context.map((block) => block.id));
    if (blockIds.size !== scenario.context.length) throw new Error(`${scenario.id} has duplicate context block ids`);
    for (const block of scenario.context) {
      for (const dependency of block.dependencies ?? []) {
        if (!blockIds.has(dependency)) throw new Error(`${scenario.id}/${block.id} has missing dependency ${dependency}`);
      }
    }
    for (const turn of scenario.turns) {
      if (turn.rubric.facts.length === 0 && turn.rubric.acceptance.length === 0) throw new Error(`${scenario.id}/${turn.id} has an empty rubric`);
    }
  }
  if (requiredCategories.size > 0) throw new Error(`missing scenario categories: ${[...requiredCategories].join(", ")}`);
}
