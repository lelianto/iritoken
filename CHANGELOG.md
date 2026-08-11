# Changelog

## 0.2.0 - 2026-08-11

- Add a memory-bounded terminal transform with UTF-8, control-sequence,
  randomized chunk-boundary, and backpressure coverage.
- Add indexed and aggregate statistics to message optimization while preserving
  the existing `stats` field.
- Report UTF-8 bytes independently from characters in CLI text and JSON output.
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
