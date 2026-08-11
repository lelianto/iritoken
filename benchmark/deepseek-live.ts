/** Live, cost-capped DeepSeek V4 Flash benchmark (development-only). */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { optimize } from "../src/pipeline/optimize.js";
import { TASKS } from "./tasks/manifest.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const API_BASE = "https://api.deepseek.com";
const MODEL = "deepseek-v4-flash";
const INPUT_PRICE_PER_MILLION = 0.14;
const OUTPUT_PRICE_PER_MILLION = 0.28;

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}
interface ApiResponse {
  id: string;
  model: string;
  choices: Array<{ message: { content: string | null } }>;
  usage: Usage;
}
interface Run {
  trial: number;
  task: string;
  variant: "original" | "optimized";
  requestId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  factsFound: number;
  factsRequired: number;
  factRecall: number;
  success: boolean;
  missingFacts: string[];
  answerSha256: string;
}

function loadLocalEnv(): void {
  try {
    for (const rawLine of readFileSync(join(PROJECT_ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const name = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (process.env[name] === undefined) process.env[name] = value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function seededOrder<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed >>> 0;
  for (let index = out.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const target = state % (index + 1);
    [out[index], out[target]] = [out[target] as T, out[index] as T];
  }
  return out;
}

async function request(path: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, init);
    if (response.ok) return response;
    const body = (await response.text()).slice(0, 500).replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
    if (attempt < 5 && (response.status === 429 || response.status >= 500)) {
      const retrySeconds = Number(response.headers.get("retry-after"));
      const waitMs = Math.min(30_000, Math.max(1000, retrySeconds * 1000 || 0, 1000 * 2 ** attempt));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    throw new Error(`DeepSeek API ${response.status}: ${body}`);
  }
  throw new Error("DeepSeek API retry limit reached");
}

async function validateModel(apiKey: string): Promise<void> {
  const response = await request("/models", { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await response.json() as { data: Array<{ id: string }> };
  if (!body.data.some((model) => model.id === MODEL)) throw new Error(`${MODEL} is not available for this account`);
}

async function completion(apiKey: string, task: string, context: string): Promise<ApiResponse> {
  const response = await request("/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      thinking: { type: "disabled" },
      temperature: 0,
      max_tokens: 256,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Use only the supplied context. Return valid JSON with one string field named answer. Be concise, but include every item requested and preserve technical evidence verbatim." },
        { role: "user", content: `Task: ${task}\n\nContext:\n${context}` },
      ],
    }),
  });
  return response.json() as Promise<ApiResponse>;
}

loadLocalEnv();
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw new Error("DEEPSEEK_API_KEY is missing from .env.local or the process environment");
const trials = Number(argument("--trials") ?? "1");
if (!Number.isSafeInteger(trials) || trials < 1 || trials > 10) throw new Error("--trials must be an integer from 1 to 10");
const maxCostUsd = Number(argument("--max-cost-usd") ?? "0.03");
if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0 || maxCostUsd > 1) throw new Error("--max-cost-usd must be greater than 0 and at most 1");
const taskFilter = argument("--task");
const selectedTasks = taskFilter ? TASKS.filter((task) => task.name === taskFilter) : TASKS;
if (selectedTasks.length === 0) throw new Error(`Unknown --task: ${taskFilter}`);
await validateModel(apiKey);

const jobs = [];
for (let trial = 1; trial <= trials; trial += 1) {
  for (const task of selectedTasks) {
    for (const variant of ["original", "optimized"] as const) jobs.push({ trial, task, variant });
  }
}
const orderedJobs = seededOrder(jobs, 0xdee5_ee4 + trials);
const runs: Run[] = [];
const resultsDir = join(ROOT, "results");
const resultSuffix = taskFilter ? `-${taskFilter.replace(/[^a-z0-9-]/gi, "-")}` : "";
mkdirSync(resultsDir, { recursive: true });

for (const job of orderedJobs) {
  const original = readFileSync(join(ROOT, "fixtures", job.task.fixture), "utf8");
  const context = job.variant === "original" ? original : optimize(original, { preset: "balanced" }).text;
  const result = await completion(apiKey, job.task.description, context);
  const raw = result.choices[0]?.message.content ?? "";
  let answer = raw;
  try {
    const parsed = JSON.parse(raw) as { answer?: unknown };
    if (typeof parsed.answer === "string") answer = parsed.answer;
  } catch {
    // Score the raw response conservatively if the provider returns malformed JSON.
  }
  const normalizedAnswer = normalize(answer);
  const missingFacts = job.task.verification.mustContain.filter((fact) => !normalizedAnswer.includes(normalize(fact)));
  const factsFound = job.task.verification.mustContain.length - missingFacts.length;
  runs.push({
    trial: job.trial, task: job.task.name, variant: job.variant, requestId: result.id,
    promptTokens: result.usage.prompt_tokens, completionTokens: result.usage.completion_tokens,
    totalTokens: result.usage.total_tokens, factsFound,
    factsRequired: job.task.verification.mustContain.length,
    factRecall: factsFound / job.task.verification.mustContain.length,
    success: missingFacts.length === 0, missingFacts,
    answerSha256: createHash("sha256").update(answer).digest("hex"),
  });
  const spendSoFar = runs.reduce(
    (total, run) => total + (run.promptTokens * INPUT_PRICE_PER_MILLION + run.completionTokens * OUTPUT_PRICE_PER_MILLION) / 1_000_000,
    0,
  );
  if (spendSoFar > maxCostUsd) throw new Error(`Cost cap exceeded: $${spendSoFar.toFixed(6)} > $${maxCostUsd.toFixed(6)}`);
  writeFileSync(join(resultsDir, `deepseek-live${resultSuffix}.partial.json`), JSON.stringify({ model: MODEL, trials, runs }, null, 2), "utf8");
  process.stdout.write(`${job.task.name} ${job.variant}: ${result.usage.prompt_tokens} input, ${factsFound}/${job.task.verification.mustContain.length} facts\n`);
}

function forVariant(variant: Run["variant"]): Run[] { return runs.filter((run) => run.variant === variant); }
function sum(list: Run[], field: "promptTokens" | "completionTokens" | "factsFound" | "factsRequired"): number {
  return list.reduce((total, run) => total + run[field], 0);
}
const original = forVariant("original");
const optimized = forVariant("optimized");
const originalInput = sum(original, "promptTokens");
const optimizedInput = sum(optimized, "promptTokens");
const outputTokens = sum(runs, "completionTokens");
const inputTokens = originalInput + optimizedInput;
const pairedDifferences = [];
for (let trial = 1; trial <= trials; trial += 1) {
  for (const task of selectedTasks) {
    const originalRun = runs.find((run) => run.trial === trial && run.task === task.name && run.variant === "original");
    const optimizedRun = runs.find((run) => run.trial === trial && run.task === task.name && run.variant === "optimized");
    if (originalRun && optimizedRun) pairedDifferences.push(optimizedRun.factRecall - originalRun.factRecall);
  }
}

function bootstrapInterval(values: number[], iterations = 10_000): [number, number] {
  let state = 0xb007_57a9;
  const means: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0;
    for (let index = 0; index < values.length; index += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      total += values[state % values.length] ?? 0;
    }
    means.push(total / values.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(iterations * 0.025)] ?? 0, means[Math.floor(iterations * 0.975)] ?? 0];
}
const meanPairedDifference = pairedDifferences.reduce((total, value) => total + value, 0) / pairedDifferences.length;
// Resample task-level means rather than treating repeated trials of the same
// fixture as independent tasks. This produces a more conservative interval.
const taskMeanDifferences = selectedTasks.map((task) => {
  const values = [];
  for (let trial = 1; trial <= trials; trial += 1) {
    const originalRun = runs.find((run) => run.trial === trial && run.task === task.name && run.variant === "original");
    const optimizedRun = runs.find((run) => run.trial === trial && run.task === task.name && run.variant === "optimized");
    if (originalRun && optimizedRun) values.push(optimizedRun.factRecall - originalRun.factRecall);
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
});
const pairedDifferenceCi95 = bootstrapInterval(
  taskMeanDifferences.length === 1 ? pairedDifferences : taskMeanDifferences,
);
const nonInferiorityMargin = -0.05;
const summary = {
  provider: "deepseek", model: MODEL, thinking: "disabled", preset: "balanced", trials, taskFilter: taskFilter ?? null,
  requests: runs.length, originalPromptTokens: originalInput, optimizedPromptTokens: optimizedInput,
  promptTokensRemoved: originalInput - optimizedInput,
  promptTokenReductionPercentage: Math.round((1 - optimizedInput / originalInput) * 10000) / 100,
  originalFactRecall: sum(original, "factsFound") / sum(original, "factsRequired"),
  optimizedFactRecall: sum(optimized, "factsFound") / sum(optimized, "factsRequired"),
  originalTaskSuccesses: original.filter((run) => run.success).length,
  optimizedTaskSuccesses: optimized.filter((run) => run.success).length,
  pairedObservations: pairedDifferences.length,
  bootstrapClusters: taskMeanDifferences.length,
  meanPairedFactRecallDifference: meanPairedDifference,
  pairedFactRecallDifferenceCi95: pairedDifferenceCi95,
  nonInferiorityMargin,
  nonInferiorityPassed: pairedDifferenceCi95[0] >= nonInferiorityMargin,
  maxCostUsd,
  estimatedMaximumCostUsd: Math.round(((inputTokens * INPUT_PRICE_PER_MILLION + outputTokens * OUTPUT_PRICE_PER_MILLION) / 1_000_000) * 1e8) / 1e8,
  measuredAt: new Date().toISOString(), source: "DeepSeek API usage",
};
writeFileSync(join(resultsDir, `deepseek-live${resultSuffix}.json`), JSON.stringify({ summary, runs }, null, 2), "utf8");
writeFileSync(join(resultsDir, `DEEPSEEK${resultSuffix}.md`), [
  "# iritoken live DeepSeek benchmark", "", `- Model: \`${MODEL}\` (thinking disabled)`,
  `- Trials / requests: ${trials} / ${runs.length}`, `- Original input tokens: ${originalInput.toLocaleString("en-US")}`,
  `- Task filter: ${taskFilter ?? "all"}`,
  `- Optimized input tokens: ${optimizedInput.toLocaleString("en-US")}`,
  `- API-reported input-token reduction: ${summary.promptTokenReductionPercentage}%`,
  `- Original fact recall: ${(summary.originalFactRecall * 100).toFixed(1)}%`,
  `- Optimized fact recall: ${(summary.optimizedFactRecall * 100).toFixed(1)}%`,
  `- Original complete tasks: ${summary.originalTaskSuccesses}/${original.length}`,
  `- Optimized complete tasks: ${summary.optimizedTaskSuccesses}/${optimized.length}`,
  `- Mean paired fact-recall difference: ${(meanPairedDifference * 100).toFixed(2)}pp`,
  `- ${taskMeanDifferences.length === 1 ? "Paired-trial" : "Task-cluster"} bootstrap 95% CI: ${(pairedDifferenceCi95[0] * 100).toFixed(2)}pp to ${(pairedDifferenceCi95[1] * 100).toFixed(2)}pp`,
  `- Non-inferiority margin / result: ${(nonInferiorityMargin * 100).toFixed(1)}pp / ${summary.nonInferiorityPassed ? "PASS" : "NOT PROVEN"}`,
  `- Approximate API cost at documented cache-miss rates: $${summary.estimatedMaximumCostUsd.toFixed(6)}`,
  "", "Token counts come from DeepSeek API usage, not a character heuristic.",
  "Jobs are deterministically shuffled and the API never receives variant labels.",
  "Answers are not stored; only hashes and missing rubric facts are retained.", "",
].join("\n"), "utf8");
console.log("\nSummary", summary);
