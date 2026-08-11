/**
 * Live Groq benchmark. This file is development-only and is never shipped in
 * the npm package. It compares identical tasks against original and optimized
 * contexts and trusts Groq's API-reported prompt token usage.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { optimize } from "../src/pipeline/optimize.js";
import { TASKS } from "./tasks/manifest.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const API_BASE = "https://api.groq.com/openai/v1";
const PREFERRED_MODEL = "llama-3.1-8b-instant";

interface GroqUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface GroqResponse {
  id: string;
  model: string;
  choices: Array<{ message: { content: string | null } }>;
  usage: GroqUsage;
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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
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

async function request(path: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, init);
    if (response.ok) return response;
    const body = (await response.text()).slice(0, 500).replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
    if (attempt < 9 && (response.status === 429 || response.status >= 500)) {
      const headerSeconds = Number(response.headers.get("retry-after"));
      const messageWait = /try again in ([0-9.]+)(ms|s)/i.exec(body);
      const messageMs = messageWait
        ? Number(messageWait[1]) * (messageWait[2]?.toLowerCase() === "s" ? 1000 : 1)
        : 0;
      const waitMs = Math.min(30_000, Math.max(1000, headerSeconds * 1000 || 0, messageMs, 1000 * 2 ** Math.min(attempt, 4)));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    throw new Error(`Groq API ${response.status}: ${body}`);
  }
  throw new Error("Groq API retry limit reached");
}

async function activeModel(apiKey: string, requested: string | undefined): Promise<string> {
  const response = await request("/models", { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await response.json() as { data: Array<{ id: string; active?: boolean }> };
  const available = body.data.filter((model) => model.active !== false).map((model) => model.id);
  const selected = requested ?? (available.includes(PREFERRED_MODEL) ? PREFERRED_MODEL : undefined);
  if (!selected) throw new Error(`Preferred model is unavailable; select one with --model. Available: ${available.join(", ")}`);
  if (!available.includes(selected)) throw new Error(`Requested Groq model is unavailable: ${selected}`);
  return selected;
}

async function completion(apiKey: string, model: string, task: string, context: string): Promise<GroqResponse> {
  const response = await request("/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: 256,
      messages: [
        { role: "system", content: "Answer only from the supplied context. Be concise and quote exact technical evidence such as error codes, paths, test names, and summaries." },
        { role: "user", content: `Task: ${task}\n\nContext:\n${context}` },
      ],
    }),
  });
  return response.json() as Promise<GroqResponse>;
}

loadLocalEnv();
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) throw new Error("GROQ_API_KEY is missing; set it in .env.local or the process environment");
const trials = Number(argument("--trials") ?? "1");
if (!Number.isSafeInteger(trials) || trials < 1 || trials > 10) throw new Error("--trials must be an integer from 1 to 10");
const paceMs = Number(argument("--pace-ms") ?? "9000");
if (!Number.isSafeInteger(paceMs) || paceMs < 0 || paceMs > 60_000) throw new Error("--pace-ms must be an integer from 0 to 60000");
const model = await activeModel(apiKey, argument("--model") ?? process.env.GROQ_MODEL);

const runs: Array<Record<string, unknown>> = [];
const partialPath = join(ROOT, "results", "groq-live.partial.json");
mkdirSync(join(ROOT, "results"), { recursive: true });
for (let trial = 1; trial <= trials; trial += 1) {
  for (const task of TASKS) {
    const original = readFileSync(join(ROOT, "fixtures", task.fixture), "utf8");
    const optimized = optimize(original, { preset: "balanced" }).text;
    for (const [variant, context] of [["original", original], ["optimized", optimized]] as const) {
      const result = await completion(apiKey, model, task.description, context);
      const answer = result.choices[0]?.message.content ?? "";
      const missingFacts = task.verification.mustContain.filter((fact) => !answer.includes(fact));
      runs.push({
        trial, task: task.name, variant, requestId: result.id, model: result.model,
        promptTokens: result.usage.prompt_tokens,
        completionTokens: result.usage.completion_tokens,
        totalTokens: result.usage.total_tokens,
        success: missingFacts.length === 0,
        missingFacts,
        answerSha256: createHash("sha256").update(answer).digest("hex"),
      });
      writeFileSync(partialPath, JSON.stringify({ model, trials, runs }, null, 2), "utf8");
      process.stdout.write(`trial ${trial} ${task.name} ${variant}: ${result.usage.prompt_tokens} input tokens, ${missingFacts.length === 0 ? "pass" : "fail"}\n`);
      if (paceMs > 0) await new Promise((resolve) => setTimeout(resolve, paceMs));
    }
  }
}

function sum(variant: string, field: "promptTokens" | "completionTokens"): number {
  return runs.filter((run) => run.variant === variant).reduce((total, run) => total + Number(run[field]), 0);
}
function successes(variant: string): number {
  return runs.filter((run) => run.variant === variant && run.success === true).length;
}
const originalTokens = sum("original", "promptTokens");
const optimizedTokens = sum("optimized", "promptTokens");
const perVariant = TASKS.length * trials;
const summary = {
  provider: "groq", model, preset: "balanced", trials, requests: runs.length,
  originalPromptTokens: originalTokens,
  optimizedPromptTokens: optimizedTokens,
  promptTokensRemoved: originalTokens - optimizedTokens,
  promptTokenReductionPercentage: Math.round((1 - optimizedTokens / originalTokens) * 10000) / 100,
  originalSuccesses: successes("original"), optimizedSuccesses: successes("optimized"),
  originalSuccessRate: successes("original") / perVariant,
  optimizedSuccessRate: successes("optimized") / perVariant,
  measuredAt: new Date().toISOString(),
  source: "Groq API usage.prompt_tokens",
};
writeFileSync(join(ROOT, "results", "groq-live.json"), JSON.stringify({ summary, runs }, null, 2), "utf8");
writeFileSync(join(ROOT, "results", "GROQ.md"), [
  "# iritoken live Groq benchmark", "",
  `- Model: \`${model}\``, `- Preset: balanced`, `- Trials: ${trials}`,
  `- Requests: ${runs.length}`, `- Original input tokens: ${originalTokens.toLocaleString("en-US")}`,
  `- Optimized input tokens: ${optimizedTokens.toLocaleString("en-US")}`,
  `- API-reported input-token reduction: ${summary.promptTokenReductionPercentage}%`,
  `- Original task success: ${summary.originalSuccesses}/${perVariant}`,
  `- Optimized task success: ${summary.optimizedSuccesses}/${perVariant}`,
  "", "Token counts come from Groq `usage.prompt_tokens`, not a character heuristic.",
  "Answers are not stored; SHA-256 hashes and rubric failures are retained for auditability.", "",
].join("\n"), "utf8");
console.log("\nSummary", summary);
