import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
  createOptimizeTransform,
  createTerminalOptimizeTransform,
} from "../src/stream.js";

type Mode = "buffered" | "terminal";

interface Trial {
  mode: Mode;
  inputBytes: number;
  outputBytes: number;
  ms: number;
  peakRssMiB: number;
}

function *terminalChunks(targetBytes: number): Generator<Buffer> {
  const chunk = Buffer.from(
    "\x1b[32m[12:00:00] processing batch\x1b[0m   \n" +
    "[12:00:01] processing batch\n[12:00:02] processing batch\n\n\n",
  );
  let emitted = 0;
  while (emitted < targetBytes) {
    const next = Math.min(chunk.length, targetBytes - emitted);
    emitted += next;
    yield chunk.subarray(0, next);
  }
}

async function worker(mode: Mode, targetBytes: number): Promise<void> {
  global.gc?.();
  let outputBytes = 0;
  const transform = mode === "buffered"
    ? createOptimizeTransform({ preset: "safe" })
    : createTerminalOptimizeTransform();
  const start = performance.now();
  for await (const chunk of Readable.from(terminalChunks(targetBytes)).pipe(transform)) {
    outputBytes += Buffer.byteLength(chunk as Buffer);
  }
  const result: Trial = {
    mode,
    inputBytes: targetBytes,
    outputBytes,
    ms: performance.now() - start,
    peakRssMiB: process.resourceUsage().maxRSS / 1024,
  };
  process.stdout.write(JSON.stringify(result));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

if (process.argv[2] === "--worker") {
  await worker(process.argv[3] as Mode, Number(process.argv[4]));
} else {
  const targetBytes = 12 * 1024 * 1024;
  const script = fileURLToPath(import.meta.url);
  const results: Trial[] = [];
  for (const mode of ["buffered", "terminal"] satisfies Mode[]) {
    const trials: Trial[] = [];
    for (let trial = 0; trial < 3; trial += 1) {
      const output = execFileSync(
        process.execPath,
        ["--expose-gc", "--import", "tsx", script, "--worker", mode, String(targetBytes)],
        { encoding: "utf8", maxBuffer: 1024 * 1024 },
      );
      trials.push(JSON.parse(output) as Trial);
    }
    results.push({
      mode,
      inputBytes: targetBytes,
      outputBytes: median(trials.map((item) => item.outputBytes)),
      ms: median(trials.map((item) => item.ms)),
      peakRssMiB: median(trials.map((item) => item.peakRssMiB)),
    });
  }
  process.stdout.write("Stream benchmark: 12 MiB, isolated median of 3\n");
  for (const result of results) {
    process.stdout.write(
      `${result.mode}: ${result.ms.toFixed(1)} ms, peak RSS ${result.peakRssMiB.toFixed(1)} MiB, output ${(result.outputBytes / 1024 / 1024).toFixed(2)} MiB\n`,
    );
  }
  const buffered = results.find((item) => item.mode === "buffered");
  const terminal = results.find((item) => item.mode === "terminal");
  if (!buffered || !terminal || terminal.peakRssMiB >= buffered.peakRssMiB) {
    process.stderr.write("Memory-bounded terminal stream did not reduce peak RSS.\n");
    process.exitCode = 1;
  }
}
