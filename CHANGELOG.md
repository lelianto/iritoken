# Changelog

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
