# Changelog

## Unreleased

- Add `createIritoken()` as a deterministic, stage-toggleable middleware with
  typed context importance, dependency-aware selection, fail-open token budgets,
  output-policy metadata, and a per-unit decision ledger.
- Make hard budgets retain every required item even when the requested target is
  impossible, and report required-token pressure instead of silently discarding
  mandatory context.
- Add a versioned DeepSeek V4 Flash hypothesis benchmark covering six coding and
  conversation workload categories, 0/25/50/60/70/80/90 targets, ablations,
  provider-reported input/output/total tokens, cache-aware cost accounting,
  deterministic scoring, cluster-aware uncertainty, and honest frontier states.
- Document token-reduction research, DeepSeek API/accounting facts, experimental
  controls, anti-gaming rules, and the evidence boundary for any 50–90% claim.
- Add a dated competitor landscape covering Tamp, Tokenade, Klood, FastContext,
  RTK, and the requirements for a fair head-to-head benchmark.

## 0.4.0 - 2026-08-11

- Add `optimizeContext()` with structured, command-aware, and generic routing.
- Add lexical-lossless JSON and JSONL whitespace compaction without parse/reserialize loss.
- Add command provenance profiles for test, build, log, version-control, and read tools.
- Add apply/shadow audit evidence with content SHA-256 identities.
- Add bounded, TTL-based, content-addressed original retrieval.
- Add provider-neutral paired quality gates with aggregate and per-case thresholds.
- Add adversarial, property, security, integration, and regression coverage for these APIs.
- Validate the new context router on a fresh six-task DeepSeek V4 Flash campaign:
  5.39% API-reported input-token reduction, non-inferiority PASS, and no reused v2 context.
- Add hard token budgets, context ranking/compaction, vector retrieval, semantic
  cache, model routing, OpenAI-compatible/DeepSeek adapters, cache-aware prompts,
  and bounded metrics collection.
- Validate the complete context engine on nine new easy-to-hard synthetic tasks:
  54/54 DeepSeek V4 Flash runs complete, 100% original/optimized fact recall,
  and 12.0% API-reported prompt-token reduction.
- Bound context cardinality/text, semantic entries/dimensions, routes, telemetry,
  and provider requests; add provider timeouts, abort propagation, protected auth
  headers, and explicit SSRF trust-boundary documentation.
- Add an isolated context-engine performance gate: 10,000 entries in 81.4 ms
  median with 128.5 MiB peak RSS on the recorded runtime.
- Document the package as one modular toolkit with separate responsibilities,
  adoption paths, use cases, and metrics for solo developers and enterprises.
- Replace the universal-looking benchmark hero with architecture, adoption, and
  explicitly scoped benchmark-evidence visuals.

- Add CI policy gates for minimum reduction, maximum output bytes, and required
  content detection, with policy-failure exit codes and structured JSON v2.
- Preserve the existing JSON v1 contract by default; schema v2 is explicit via
  `--json-version 2`.
- Add opt-in Markdown segment optimization for explicitly labelled terminal
  output fences while preserving prose, source fences, and markers exactly.
- Ship a reusable GitHub Action with job summaries, typed outputs, optimized
  context artifacts, and policy enforcement.
- Expand the committed real-case corpus with GitHub Actions, Terraform, Docker
  Compose, and ESLint failures.
- Validate package/lock/changelog versions and make trusted releases publish
  npm provenance first, then create a matching GitHub Release with tarball,
  CycloneDX SBOM, and SHA-256 checksum.

## 0.3.0 - 2026-08-11

- Make security regressions and committed real-case validation explicit,
  mandatory gates for local npm publishing, CI, and trusted releases.
- Detect Python tracebacks as stack traces so repeated Python frames are
  compacted by the balanced and aggressive presets while exception details,
  source lines, and unique frames remain intact.
- Recognize and compact consecutive passing-test records from pytest, Go test,
  and Cargo in addition to Vitest and Jest.
- Preserve complete reports whenever the supported runners emit a failure.
- Expand deterministic corpus, detection, and semantic gates for the new
  runtime and test-runner formats.

## 0.2.2 - 2026-08-11

- Make `npm run release:check` repeatable for already-published versions by
  validating with `npm pack --dry-run` instead of contacting the publish
  endpoint.
- Reduce the npm tarball by excluding large documentation PNGs while retaining
  the small package logo and loading README images from their GitHub URLs.
- Add package-content and compressed-size regression checks to the packed
  artifact smoke test.

## 0.2.1 - 2026-08-11

- Replace the not-yet-indexed Scorecard viewer target with the repository's
  working Scorecard workflow page.
- Remove the Socket badge because its public package endpoint returns HTTP 403.

## 0.2.0 - 2026-08-11

- Add a memory-bounded terminal transform with UTF-8, control-sequence,
  randomized chunk-boundary, and backpressure coverage.
- Add indexed and aggregate statistics to message optimization while preserving
  the existing `stats` field.
- Report UTF-8 bytes independently from characters in CLI text and JSON output.
- Harden CLI file handling: reject symlink/non-regular inputs and outputs,
  detect input/output hard-link aliasing, enforce byte limits while reading the
  already-open descriptor, and publish output through an owner-only temporary
  file plus atomic rename.
- Expand terminal-injection cleanup to OSC clipboard payloads, C1 controls, and
  DCS/SOS/PM/APC control-string families, including malformed partial escapes.
- Add semantic, detection, performance, and stream regression gates with
  versioned machine-readable artifacts.
- Validate the balanced preset against a newly authored six-task live corpus
  using `deepseek-v4-flash`: 13.74% fewer input tokens with unchanged 88.0%
  fact recall across 60 requests.
- Harden release provenance with SHA-pinned actions, an SBOM artifact, and npm
  trusted publishing support.

### Compatibility

The public API remains backward-compatible. New message and CLI JSON fields are
additive. The CLI JSON `schemaVersion` remains `1`.

## 0.1.0 - 2026-08-10

- Initial release of deterministic local context optimization, CLI, presets,
  streaming adapter, tokenizer adapters, and benchmark corpus.
