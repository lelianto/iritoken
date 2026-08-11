# Generated benchmark artifacts

This directory intentionally contains no claimed benchmark result. Generate an
offline preflight with `npm run benchmark`, run the explicitly cost-capped live
campaign with `npm run benchmark:deepseek:frontier`, and render its
machine-readable analysis and Markdown report with
`npm run benchmark:frontier:report -- --input <campaign.json>`.

The `.partial/` and `.raw/` directories are ignored. Live artifacts contain raw
model output only because the benchmark scenarios are synthetic; do not reuse
that storage policy for private or production prompts.
