# Benchmark result policy

Generated JSON files contain `schemaVersion`, `methodologyVersion`, generation
time, runtime identity, preset, and raw fixture results. A published report must
state its methodology version and may only be compared directly with another
report using the same version.

`semantic-gates-v1` supersedes pre-gate compression reports for safety claims.
Older reports remain historical measurements; they are not silently rewritten
or cited as evidence for the current implementation.

When methodology changes:

1. assign a new `methodologyVersion`;
2. document which earlier methodology it supersedes and why;
3. regenerate every preset on the same revision;
4. retain any published historical Markdown report;
5. never combine incompatible runs into one aggregate.
