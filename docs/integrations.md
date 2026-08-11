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

const { messages, stats } = optimizeMessages(request.messages, {
  preset: "balanced",
  roles: ["tool"]
});
```

This helper deliberately does not send the messages. Pass its output to the
provider SDK of your choice.

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

The transform is backpressure-aware but bounded-buffered: it waits for all
input so detection and output match `optimize()` exactly. `maxInputBytes`
prevents unbounded memory use.

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
