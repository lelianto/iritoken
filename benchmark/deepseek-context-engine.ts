/** Live DeepSeek V4 Flash smoke test using intentionally synthetic, non-sensitive facts. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MetricsCollector, compactConversation, createDeepSeekAdapter,
  prepareCacheAwarePrompt,
} from "../src/index.js";

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
try {
  for (const raw of readFileSync(join(PROJECT_ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const separator = raw.indexOf("=");
    if (separator > 0 && !raw.trimStart().startsWith("#")) {
      const name = raw.slice(0, separator).trim(); let value = raw.slice(separator + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[name] ??= value;
    }
  }
} catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }

const key = process.env.DEEPSEEK_API_KEY;
if (!key) throw new Error("DEEPSEEK_API_KEY is missing");
const counter = { count: (text: string) => text.trim() === "" ? 0 : text.trim().split(/\s+/).length };
const stable = [{ role: "system", content: "This is a test using invented facts only. Answer with a single JSON object containing an answer string. Use only supplied messages." }];
const conversation = [
  ...stable,
  { role: "user", content: "Old unrelated invented note: triangle gardens use paper umbrellas." },
  { role: "assistant", content: "Acknowledged the unrelated invented note." },
  { role: "user", content: "Synthetic astronomy catalog\n\n\n\nPlanet Luma has seven silver rings.\nPlanet Luma has seven silver rings.\nPlanet Luma has seven silver rings.\nIts moon Piko is amber.\nThe fictional survey year is 3142." },
  { role: "user", content: "For Planet Luma, report the ring count, ring color, moon name and color, and survey year." },
];
const compacted = compactConversation(conversation, { tokenCounter: counter, budgetTokens: 70, query: conversation.at(-1)?.content, keepRecent: 2, preset: "balanced" });
if (compacted.compactedTokens > compacted.budgetTokens) throw new Error("hard budget was exceeded");
const adapter = createDeepSeekAdapter(key); const metrics = new MetricsCollector();
const required = [["seven", "7"], ["silver"], ["piko"], ["amber"], ["3142"]];
const runs = [];
for (const [variant, messages] of [["original", conversation], ["compacted", compacted.messages]] as const) {
  const dynamic = messages.slice(1); const prompt = prepareCacheAwarePrompt(stable, dynamic);
  const result = await adapter.complete({ model: "deepseek-v4-flash", messages: prompt.messages, temperature: 0, maxTokens: 128, responseFormat: "json", thinking: false });
  const normalized = result.text.toLocaleLowerCase("en-US"); const missing = required.filter((alternatives) => !alternatives.some((fact) => normalized.includes(fact))).map((alternatives) => alternatives.join("|"));
  metrics.record("live.fact_recall", (required.length - missing.length) / required.length, { variant, model: result.model });
  if (result.usage) { metrics.record("live.input_tokens", result.usage.inputTokens, { variant }); metrics.record("live.cache_hit_tokens", result.usage.cacheHitTokens, { variant }); }
  runs.push({ variant, model: result.model, requestId: result.id, missing, success: missing.length === 0, usage: result.usage, prefixSha256: prompt.prefixSha256 });
}
if (runs.some((run) => !run.success)) throw new Error(`live recall failed: ${JSON.stringify(runs.map((run) => ({ variant: run.variant, missing: run.missing })))}`);
process.stdout.write(`${JSON.stringify({ model: "deepseek-v4-flash", syntheticDataOnly: true, budget: { originalTokens: compacted.originalTokens, compactedTokens: compacted.compactedTokens, maximumTokens: compacted.budgetTokens, omittedIndices: compacted.omittedIndices }, runs, observations: metrics.snapshot() }, null, 2)}\n`);
