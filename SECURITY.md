# Security policy

## Supported versions

Security fixes are provided for the latest published iritoken release. Users should upgrade to the newest patch release before reporting an issue.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting at `https://github.com/lelianto/iritoken/security/advisories/new`. Include the affected version, reproduction steps, impact, and suggested mitigation.

You should receive an acknowledgement within 7 days and an initial assessment within 14 days. Disclosure will be coordinated after a fix is available. If private reporting is unavailable, open a public issue asking the maintainer to enable it without including vulnerability details.

## Scope and security boundary

iritoken's core optimizer processes local strings and files. It does not provide
an HTTP server, authentication, or database access. Optional provider adapters
perform outbound HTTP(S) requests only when explicitly invoked. Adapter base
URLs and API keys are trusted configuration; allowing an untrusted party to
choose a base URL can create SSRF in the host application. Resource exhaustion,
unsafe filesystem behavior, terminal injection, provider-boundary handling,
package integrity, and unexpectedly executed input are in scope. CSRF, SQL
injection prevention, and volumetric DDoS mitigation belong to the application
or gateway exposing iritoken over a network.

## Local security controls

The CLI bounds input by UTF-8 bytes while reading from an already-open file
descriptor. It accepts only regular input files, refuses symlink and
non-regular output targets, and compares device/inode identity to prevent an
input file from being overwritten through a hard-link alias. Output is first
written to an exclusive owner-only temporary file and then atomically renamed.

Terminal cleanup strips ANSI/ECMA-48 styling and control-string families,
including OSC clipboard payloads and C1 forms, without executing input. Stream
APIs enforce total-input or maximum-line limits according to their buffering
model.

Context-engine APIs bound candidate/item/message cardinality and total text,
semantic index entries and vector dimensions, semantic-cache entries and vector
dimensions, route catalogs, and in-memory metric observations. Duplicate IDs
that could make budget or routing decisions ambiguous are rejected. Provider
adapters validate HTTP(S) destinations, credentials, message/request size,
enforce a 30-second default timeout with abort propagation, cap error bodies,
and prevent custom headers from replacing the configured authorization value.

These controls reduce local-file and terminal-injection risk; callers remain
responsible for choosing trusted paths and applying stricter sandboxing where
untrusted users can influence filesystem layout concurrently.

## Mandatory release gates

Every package release must pass both of these commands:

```bash
npm run test:security
npm run test:real-cases
```

`test:security` exercises library and stream resource limits, terminal-control
and clipboard-sequence removal, CLI input boundaries, symlink and non-regular
path rejection, hard-link alias protection, and atomic output behavior.
It also covers context cardinality/character limits, semantic vector/index
bounds, telemetry bounds, duplicate identifiers, provider request ceilings,
timeouts, destination validation, and authorization-header integrity.

`test:real-cases` runs the committed corpus across all presets, the labelled
detection set, and executable semantic invariants. It fails on missing required
facts, occurrence-count changes, forbidden leftover noise, expansion,
non-idempotence, detection regressions, or unexpected cleaner transformations.

Both commands are part of `prepublishOnly`, so the normal npm publish lifecycle
cannot proceed when either gate fails. They also run as separate CI jobs and as
named steps in the trusted release workflow. Deliberately bypassing npm
lifecycle scripts with `--ignore-scripts` is outside the supported release
process.
