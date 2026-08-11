# Enhancement 006: CI adoption and release integrity

Status: implemented  
Release: 0.4.0  
Date: 2026-08-11

## Goal

Make iritoken enforceable in CI without breaking existing consumers, safely
optimize mixed Markdown context, and keep npm and GitHub releases synchronized.

## CLI policy contract

`--check` requires at least one policy and exits with `0` when all policies
pass, `1` when any policy fails, and `2` for invalid CLI configuration.

| Option | Unit | Pass condition |
| --- | --- | --- |
| `--min-reduction <n>` | character percentage | actual reduction is at least `n` |
| `--max-output-bytes <n>` | UTF-8 bytes | optimized output is at most `n` |
| `--require-detection <type>` | content type | detected type equals required type |

When a policy fails, `--output` is not written. All failures are returned in a
single run. JSON schema v1 remains the default and unchanged.
`--json-version 2` adds a stable `output` envelope and `policy` object.

## Segment-aware Markdown

`--segments` and `optimizeSegments()` process only fences labelled `console`,
`console-output`, `shell-session`, `terminal`, or `terminal-output`. Other
fences, prose, and markers remain byte-for-byte identical. The mode is opt-in
and idempotent.

## GitHub Action

The root `action.yml` runs the pinned 0.4.0 package, enforces policies, writes a
job summary, exposes pass/reduction/byte outputs, and optionally uploads the
optimized context artifact.

## Release integrity

`npm run release:integrity` verifies package, lockfile, changelog, and optional
tag consistency. The trusted workflow runs mandatory security and real-case
gates, publishes npm with provenance, then creates `v<version>` with the npm
tarball, SHA-256 checksum, and CycloneDX SBOM. GitHub Release creation cannot
happen before npm publication succeeds.

## Mandatory verification

- Built-CLI policy success/failure, aggregate diagnostics, no-write-on-failure,
  and JSON v1/v2 compatibility tests.
- Mixed Markdown preservation and segment idempotence tests.
- GitHub Actions, Terraform, Docker Compose, and ESLint fixtures in the
  three-preset corpus regression gate.
- Existing `test:security` and `test:real-cases` package release gates.
