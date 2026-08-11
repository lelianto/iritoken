# Integrating iritoken

All integrations are local and deterministic. None calls a model, opens a
network connection, or records source content.

## Unix pipelines

`--stdout` emits optimized text only, so it composes without report parsing:

```bash
npm test 2>&1 | iritoken --preset balanced --stdout > context.txt
```

Use `--json` for automation. The top-level `schemaVersion` is `1`; JSON includes
the selected preset, optimized text (unless `--output` or `--dry-run` is used),
statistics, detection, and per-cleaner decisions.

## OpenAI-compatible messages

`optimizeMessages()` accepts structurally compatible `{ role, content }`
objects, returns copies, and leaves system/assistant content alone by default.

```ts
import { optimizeMessages } from "iritoken";

const { messages, stats, messageStats, totalStats } = optimizeMessages(request.messages, {
  preset: "balanced",
  roles: ["tool"]
});
```

This helper deliberately does not send the messages. Pass its output to the
provider SDK of your choice. `stats` remains the legacy ordered stats array;
`messageStats` adds the source index and role, while `totalStats` aggregates
characters removed and cleaner counts across all optimized messages.

## Node streams

```ts
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createOptimizeTransform } from "iritoken/stream";

await pipeline(
  createReadStream("build.log"),
  createOptimizeTransform({ preset: "balanced", maxInputBytes: 8 * 1024 * 1024 }),
  createWriteStream("context.txt")
);
```

`createOptimizeTransform()` buffers the bounded input so its output remains
exactly equivalent to `optimize()`. For input already known to be terminal
output, use the memory-bounded line-streaming variant:

```ts
import { createTerminalOptimizeTransform } from "iritoken/stream";

source.pipe(createTerminalOptimizeTransform({ maxLineBytes: 1024 * 1024 })).pipe(destination);
```

The terminal variant applies ANSI, whitespace, and consecutive duplicate-line
cleanup. It does not run global detection or balanced/aggressive cleaners.

Both transforms are backpressure-aware. The generic transform waits for all
bounded input so detection and output match `optimize()` exactly; the terminal
variant keeps only the current line and duplicate run. `maxInputBytes` and
`maxLineBytes` enforce their respective bounds.

## Exact tokenizer statistics

```ts
import { fromEncoder, fromTokenizer, optimize } from "iritoken";

optimize(text, { tokenCounter: fromEncoder(encoder) });
optimize(text, { tokenCounter: fromTokenizer(tokenizer) });
```

The adapters are structural and add no dependency. Counts are marked exact
because they come from the caller's tokenizer; accuracy for a target model is
the caller's responsibility.

## Metrics without content leakage

The observer receives only decision/stat objects. It is suitable for local
metrics, but callbacks run synchronously: keep them fast and do not throw.

```ts
optimize(text, {
  observer: {
    onCleaner: ({ cleaner, reason, changes }) => record(cleaner, reason, changes),
    onComplete: ({ reductionPercentage }) => histogram(reductionPercentage)
  }
});
```
