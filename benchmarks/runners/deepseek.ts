/** Live, paired, resumable DeepSeek Chat Completions benchmark. Synthetic scenarios only. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scoreTurnResponse } from "../evaluators/response.js";
import { SCENARIO_CORPUS_ID, toPublicScenario, validateScenarioManifest } from "../scenarios/manifest.js";
import type {
  AblationDefinition,
  BenchmarkScenario,
  ConversationMessage,
  DeepSeekConfigSnapshot,
  ProviderUsageRecord,
} from "../types.js";
import {
  BENCHMARK_ROOT,
  PROJECT_ROOT,
  argument,
  atomicWriteJson,
  buildPlan,
  corpusSha256,
  hasFlag,
  loadConfig,
  makeCampaignId,
  makeDesign,
  makeSelection,
  parseCsv,
  parseTargets,
  planKey,
  positiveInteger,
  positiveNumber,
  selectComparisons,
  selectScenarios,
  sha256,
  stableJson,
} from "./common.js";
import { prepareTurn } from "./optimizer.js";
import type {
  BenchmarkScenarioRunRecord,
  BenchmarkTurnRunRecord,
  LiveCampaignArtifact,
  PairArm,
  PlannedPair,
  ProviderAttemptRecord,
} from "./schema.js";

interface DeepSeekUsage {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
  prompt_cache_hit_tokens?: unknown;
  prompt_cache_miss_tokens?: unknown;
}

interface DeepSeekResponse {
  id?: unknown;
  model?: unknown;
  system_fingerprint?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: DeepSeekUsage;
}

interface CompletionResult {
  rawText: string;
  requestId: string | null;
  returnedModel: string | null;
  systemFingerprint: string | null;
  usage: ProviderUsageRecord | null;
  usageError: string | null;
}

class CostCapStop extends Error {
  constructor(readonly requiredChargeUsd: number, readonly remainingUsd: number) {
    super(`cost cap prevents request: conservative charge $${requiredChargeUsd.toFixed(8)} exceeds remaining $${remainingUsd.toFixed(8)}`);
  }
}

class ProviderFailure extends Error {}

function loadLocalEnv(): void {
  try {
    for (const rawLine of readFileSync(resolve(PROJECT_ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const name = line.slice(0, separator).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[name] ??= value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function emptyUsage(): ProviderUsageRecord {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0 };
}

function roundUsd(value: number): number {
  return Math.round(value * 1e10) / 1e10;
}

function usageCost(usage: ProviderUsageRecord, config: DeepSeekConfigSnapshot): number {
  return roundUsd((
    usage.cacheHitTokens * config.pricesUsdPerMillionTokens.inputCacheHit
    + usage.cacheMissTokens * config.pricesUsdPerMillionTokens.inputCacheMiss
    + usage.outputTokens * config.pricesUsdPerMillionTokens.output
  ) / 1_000_000);
}

function safeError(value: unknown): string {
  const text = value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  return text.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").slice(0, 1_000);
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function providerUsage(raw: DeepSeekUsage | undefined): { usage: ProviderUsageRecord | null; error: string | null } {
  if (!raw) return { usage: null, error: "provider response omitted usage" };
  const inputTokens = integer(raw.prompt_tokens);
  const outputTokens = integer(raw.completion_tokens);
  const totalTokens = integer(raw.total_tokens);
  const cacheHitTokens = integer(raw.prompt_cache_hit_tokens);
  const cacheMissTokens = integer(raw.prompt_cache_miss_tokens);
  if ([inputTokens, outputTokens, totalTokens, cacheHitTokens, cacheMissTokens].some((value) => value === null)) {
    return { usage: null, error: "usage must include non-negative integer prompt, completion, total, cache-hit, and cache-miss token counts" };
  }
  const usage: ProviderUsageRecord = {
    inputTokens: inputTokens as number,
    outputTokens: outputTokens as number,
    totalTokens: totalTokens as number,
    cacheHitTokens: cacheHitTokens as number,
    cacheMissTokens: cacheMissTokens as number,
  };
  if (usage.inputTokens + usage.outputTokens !== usage.totalTokens) {
    return { usage: null, error: "provider total_tokens does not equal prompt_tokens + completion_tokens" };
  }
  if (usage.cacheHitTokens + usage.cacheMissTokens !== usage.inputTokens) {
    return { usage: null, error: "provider cache-hit + cache-miss tokens do not equal prompt_tokens" };
  }
  return { usage, error: null };
}

function requestBody(
  messages: readonly { role: string; content: string }[],
  config: DeepSeekConfigSnapshot,
): Record<string, unknown> {
  return {
    model: config.requestedModel,
    thinking: { type: config.thinking ? "enabled" : "disabled" },
    temperature: config.temperature,
    max_tokens: config.maxOutputTokens,
    response_format: { type: config.responseFormat },
    stream: false,
    messages,
  };
}

function conservativeRequestCharge(body: string, config: DeepSeekConfigSnapshot): number {
  // DeepSeek tokenization is authoritative after the call. Before it, UTF-8
  // request bytes plus a 4k framing allowance are used as a conservative cap
  // bound; all input is priced as cache miss and output at max_tokens.
  const inputUpperBound = Buffer.byteLength(body, "utf8") + 4_096;
  return roundUsd((
    inputUpperBound * config.pricesUsdPerMillionTokens.inputCacheMiss
    + config.maxOutputTokens * config.pricesUsdPerMillionTokens.output
  ) / 1_000_000);
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  const seconds = header === null ? Number.NaN : Number(header);
  const requested = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : 0;
  return Math.min(30_000, Math.max(requested, 500 * 2 ** (attempt - 1)));
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMilliseconds: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`request timed out after ${timeoutMilliseconds}ms`)), timeoutMilliseconds);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function preflightModels(apiKey: string, config: DeepSeekConfigSnapshot, timeoutMilliseconds: number): Promise<LiveCampaignArtifact["preflight"]> {
  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/models`;
  let lastError = "model preflight failed";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchWithTimeout(endpoint, { headers: { Authorization: `Bearer ${apiKey}` } }, timeoutMilliseconds);
      if (!response.ok) {
        lastError = `model preflight HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`;
        if ((response.status === 429 || response.status >= 500) && attempt < 3) {
          await sleep(retryDelay(response, attempt));
          continue;
        }
        throw new ProviderFailure(safeError(lastError));
      }
      const raw = await response.json() as { data?: Array<{ id?: unknown }> };
      const availableModelIds = (raw.data ?? []).flatMap((item) => typeof item.id === "string" ? [item.id] : []);
      const requestedModelListed = availableModelIds.includes(config.requestedModel);
      if (!requestedModelListed) throw new ProviderFailure(`${config.requestedModel} is not listed for this account`);
      return { checkedAt: new Date().toISOString(), endpoint, requestedModelListed, availableModelIds };
    } catch (error) {
      lastError = safeError(error);
      if (attempt < 3 && !(error instanceof ProviderFailure)) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw new ProviderFailure(lastError);
    }
  }
  throw new ProviderFailure(lastError);
}

async function complete(input: {
  apiKey: string;
  config: DeepSeekConfigSnapshot;
  messages: readonly { role: string; content: string }[];
  campaign: LiveCampaignArtifact;
  maximumAttempts: number;
  timeoutMilliseconds: number;
  onAttempt: (attempt: ProviderAttemptRecord) => void;
}): Promise<CompletionResult> {
  const object = requestBody(input.messages, input.config);
  const body = JSON.stringify(object);
  const upperCharge = conservativeRequestCharge(body, input.config);
  const endpoint = `${input.config.baseUrl.replace(/\/$/, "")}${input.config.endpoint}`;
  let lastError = "provider request failed";
  for (let attemptNumber = 1; attemptNumber <= input.maximumAttempts; attemptNumber += 1) {
    const remaining = input.campaign.cost.hardCapUsd - input.campaign.cost.conservativeCapChargeUsd;
    if (upperCharge > remaining + 1e-12) throw new CostCapStop(upperCharge, Math.max(0, remaining));
    const startedAt = new Date().toISOString();
    let response: Response | null = null;
    try {
      response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
        body,
      }, input.timeoutMilliseconds);
      const completedAt = new Date().toISOString();
      if (!response.ok) {
        const error = `DeepSeek HTTP ${response.status}: ${(await response.text()).slice(0, 500).replace(/[\x00-\x1f\x7f-\x9f]/g, " ")}`;
        const retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
        const delay = retryable && attemptNumber < input.maximumAttempts ? retryDelay(response, attemptNumber) : null;
        input.campaign.cost.conservativeCapChargeUsd = roundUsd(input.campaign.cost.conservativeCapChargeUsd + upperCharge);
        input.onAttempt({
          attempt: attemptNumber, startedAt, completedAt, httpStatus: response.status, retryable,
          retryDelayMilliseconds: delay, requestId: response.headers.get("x-request-id"), returnedModel: null,
          systemFingerprint: null, usage: null, error: safeError(error), costCapChargeUsd: upperCharge,
        });
        lastError = error;
        if (delay !== null) { await sleep(delay); continue; }
        throw new ProviderFailure(error);
      }
      const raw = await response.json() as DeepSeekResponse;
      const text = raw.choices?.[0]?.message?.content;
      if (typeof text !== "string") {
        const error = "DeepSeek response omitted choices[0].message.content";
        input.campaign.cost.conservativeCapChargeUsd = roundUsd(input.campaign.cost.conservativeCapChargeUsd + upperCharge);
        input.onAttempt({
          attempt: attemptNumber, startedAt, completedAt, httpStatus: response.status, retryable: false,
          retryDelayMilliseconds: null, requestId: typeof raw.id === "string" ? raw.id : response.headers.get("x-request-id"),
          returnedModel: typeof raw.model === "string" ? raw.model : null,
          systemFingerprint: typeof raw.system_fingerprint === "string" ? raw.system_fingerprint : null,
          usage: null, error, costCapChargeUsd: upperCharge,
        });
        throw new ProviderFailure(error);
      }
      const validated = providerUsage(raw.usage);
      const requestId = typeof raw.id === "string" ? raw.id : response.headers.get("x-request-id");
      const returnedModel = typeof raw.model === "string" ? raw.model : null;
      const systemFingerprint = typeof raw.system_fingerprint === "string" ? raw.system_fingerprint : null;
      const charge = validated.usage ? usageCost(validated.usage, input.config) : upperCharge;
      input.campaign.cost.conservativeCapChargeUsd = roundUsd(input.campaign.cost.conservativeCapChargeUsd + charge);
      if (validated.usage) {
        input.campaign.cost.authoritativeUsageCostUsd = roundUsd(input.campaign.cost.authoritativeUsageCostUsd + charge);
      }
      input.onAttempt({
        attempt: attemptNumber, startedAt, completedAt, httpStatus: response.status, retryable: false,
        retryDelayMilliseconds: null, requestId, returnedModel, systemFingerprint, usage: validated.usage,
        error: validated.error, costCapChargeUsd: charge,
      });
      return { rawText: text, requestId, returnedModel, systemFingerprint, usage: validated.usage, usageError: validated.error };
    } catch (error) {
      if (error instanceof ProviderFailure && response !== null) throw error;
      const completedAt = new Date().toISOString();
      const retryable = attemptNumber < input.maximumAttempts;
      const delay = retryable ? Math.min(30_000, 500 * 2 ** (attemptNumber - 1)) : null;
      input.campaign.cost.conservativeCapChargeUsd = roundUsd(input.campaign.cost.conservativeCapChargeUsd + upperCharge);
      input.onAttempt({
        attempt: attemptNumber, startedAt, completedAt, httpStatus: response?.status ?? null, retryable,
        retryDelayMilliseconds: delay, requestId: response?.headers.get("x-request-id") ?? null,
        returnedModel: null, systemFingerprint: null, usage: null, error: safeError(error), costCapChargeUsd: upperCharge,
      });
      lastError = safeError(error);
      if (delay !== null) { await sleep(delay); continue; }
      throw new ProviderFailure(lastError);
    }
  }
  throw new ProviderFailure(lastError);
}

function requestParametersSha256(config: DeepSeekConfigSnapshot): string {
  return sha256(stableJson({
    model: config.requestedModel,
    thinking: config.thinking,
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
    responseFormat: config.responseFormat,
  }));
}

function calculateTotals(run: BenchmarkScenarioRunRecord, expectedTurns: number): void {
  const quality = run.turns.map((turn) => turn.quality);
  run.totals = {
    inputTokens: run.turns.reduce((total, turn) => total + turn.usage.inputTokens, 0),
    outputTokens: run.turns.reduce((total, turn) => total + turn.usage.outputTokens, 0),
    totalTokens: run.turns.reduce((total, turn) => total + turn.usage.totalTokens, 0),
    cacheHitTokens: run.turns.reduce((total, turn) => total + turn.usage.cacheHitTokens, 0),
    cacheMissTokens: run.turns.reduce((total, turn) => total + turn.usage.cacheMissTokens, 0),
    estimatedCostUsd: roundUsd(run.turns.reduce((total, turn) => total + turn.estimatedCostUsd, 0)),
    successfulTurns: quality.filter((score) => score?.taskSuccess).length,
    totalTurns: expectedTurns,
    taskSuccessRate: expectedTurns === 0 ? 0 : quality.filter((score) => score?.taskSuccess).length / expectedTurns,
    meanFactCoverage: expectedTurns === 0 ? 0 : quality.reduce((total, score) => total + (score?.factCoverage ?? 0), 0) / expectedTurns,
    meanAcceptanceCoverage: expectedTurns === 0 ? 0 : quality.reduce((total, score) => total + (score?.acceptanceCoverage ?? 0), 0) / expectedTurns,
  };
}

function blankScenarioRun(input: {
  campaign: LiveCampaignArtifact;
  pair: PlannedPair;
  arm: PairArm;
  ablation: AblationDefinition;
  orderPosition: number;
}): BenchmarkScenarioRunRecord {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    pairId: input.pair.pairId,
    planKey: planKey(input.pair, input.arm),
    experiment: input.pair.experiment,
    estimand: input.pair.estimand,
    arm: input.arm,
    pairOrder: input.pair.pairOrder,
    comparatorAblation: input.pair.comparatorAblation,
    comparisonAblation: input.pair.comparisonAblation,
    campaignId: input.campaign.campaignId,
    scenarioId: input.pair.scenarioId,
    clusterId: input.pair.clusterId,
    category: input.pair.category,
    replicate: input.pair.replicate,
    orderPosition: input.orderPosition,
    ablation: input.ablation,
    requestedModel: input.campaign.config.requestedModel,
    configSha256: input.campaign.configSha256,
    startedAt: now,
    completedAt: now,
    status: "cost-cap-not-run",
    turns: [],
    totals: { ...emptyUsage(), estimatedCostUsd: 0, successfulTurns: 0, totalTurns: 0, taskSuccessRate: 0, meanFactCoverage: 0, meanAcceptanceCoverage: 0 },
  };
}

function rebuildHistory(scenario: BenchmarkScenario, run: BenchmarkScenarioRunRecord): ConversationMessage[] {
  const history = scenario.seedHistory?.map((message) => ({ ...message })) ?? [];
  for (let index = 0; index < run.turns.length; index += 1) {
    const publicTurn = scenario.turns[index];
    const completedTurn = run.turns[index];
    if (!publicTurn || !completedTurn) break;
    history.push({ role: "user", content: publicTurn.instruction });
    // Output-policy isolation intentionally uses the same predeclared history
    // in both arms. Other experiments model normal session carry-over.
    if (run.experiment !== "output-policy" && completedTurn.rawArtifact !== null) {
      history.push({ role: "assistant", content: completedTurn.rawArtifact });
    }
  }
  return history;
}

function updateProgress(campaign: LiveCampaignArtifact): void {
  const terminal = campaign.runs.filter((run) => run.status !== "cost-cap-not-run");
  campaign.progress.recordedRequests = campaign.runs.length;
  campaign.progress.completedPairs = campaign.plan.filter((pair) => (
    terminal.some((run) => run.pairId === pair.pairId && run.arm === "control")
    && terminal.some((run) => run.pairId === pair.pairId && run.arm === "treatment")
  )).length;
  campaign.updatedAt = new Date().toISOString();
}

function resumeArgument(): string | null {
  const index = process.argv.indexOf("--resume");
  if (index < 0) return null;
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) return next;
  const output = argument("--out");
  if (!output) throw new Error("--resume requires a path, or --out must identify the checkpoint");
  return output;
}

function readCampaign(path: string): LiveCampaignArtifact {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as LiveCampaignArtifact;
  if (parsed.artifactKind !== "live-campaign" || parsed.schemaVersion !== 1) throw new Error("resume artifact is not a live campaign schema v1");
  return parsed;
}

async function runScenarioArm(input: {
  campaign: LiveCampaignArtifact;
  pair: PlannedPair;
  arm: PairArm;
  scenario: BenchmarkScenario;
  apiKey: string;
  outputPath: string;
  orderPosition: number;
  maximumAttempts: number;
  timeoutMilliseconds: number;
}): Promise<"terminal" | "cost-cap"> {
  const key = planKey(input.pair, input.arm);
  let run = input.campaign.runs.find((candidate) => candidate.planKey === key);
  if (run && run.status !== "cost-cap-not-run") return "terminal";
  const ablation = input.arm === "control" ? input.pair.comparatorAblation : input.pair.comparisonAblation;
  if (!run) {
    run = blankScenarioRun({ campaign: input.campaign, pair: input.pair, arm: input.arm, ablation, orderPosition: input.orderPosition });
    input.campaign.runs.push(run);
    updateProgress(input.campaign);
    atomicWriteJson(input.outputPath, input.campaign);
  }
  const publicScenario = toPublicScenario(input.scenario);
  const history = rebuildHistory(input.scenario, run);
  for (let turnIndex = run.turns.length; turnIndex < input.scenario.turns.length; turnIndex += 1) {
    const scenarioTurn = input.scenario.turns[turnIndex];
    if (!scenarioTurn) throw new Error(`turn ${turnIndex} is unavailable in ${input.scenario.id}`);
    const prepared = await prepareTurn({ scenario: publicScenario, turnIndex, conversationHistory: history, ablation, requireCore: true });
    if (prepared.adapter !== "iritoken-core" && ablation.kind !== "baseline") throw new Error("live treatment did not use iritoken-core");
    const systemMessage = prepared.messages.find((message) => message.role === "system");
    if (ablation.treatmentScope !== "full-stack" && systemMessage?.content !== input.scenario.systemInstruction) {
      throw new Error(`${key}/${scenarioTurn.id} changed the system instruction in a context-only comparison`);
    }
    const draft: BenchmarkTurnRunRecord = {
      turnId: scenarioTurn.id,
      status: "cost-cap-not-run",
      requestId: null,
      returnedModel: null,
      systemFingerprint: null,
      usage: emptyUsage(),
      estimatedCostUsd: 0,
      outputSha256: null,
      rawArtifact: null,
      error: null,
      parsed: null,
      quality: null,
      optimizer: prepared,
      attempts: [],
      retryCount: 0,
      requestParametersSha256: requestParametersSha256(input.campaign.config),
      outputPolicyApplied: ablation.enabledStages.includes("outputOptimization"),
    };
    let draftRecorded = false;
    const recordAttempt = (attempt: ProviderAttemptRecord): void => {
      if (!draftRecorded) { run?.turns.push(draft); draftRecorded = true; }
      draft.attempts.push(attempt);
      draft.retryCount = Math.max(0, draft.attempts.length - 1);
      calculateTotals(run as BenchmarkScenarioRunRecord, input.scenario.turns.length);
      updateProgress(input.campaign);
      atomicWriteJson(input.outputPath, input.campaign);
    };
    try {
      const result = await complete({
        apiKey: input.apiKey,
        config: input.campaign.config,
        messages: prepared.messages,
        campaign: input.campaign,
        maximumAttempts: input.maximumAttempts,
        timeoutMilliseconds: input.timeoutMilliseconds,
        onAttempt: recordAttempt,
      });
      if (!draftRecorded) { run.turns.push(draft); draftRecorded = true; }
      const scored = scoreTurnResponse(result.rawText, scenarioTurn.rubric);
      draft.status = result.usage ? "completed" : "invalid-usage";
      draft.requestId = result.requestId;
      draft.returnedModel = result.returnedModel;
      draft.systemFingerprint = result.systemFingerprint;
      draft.usage = result.usage ?? emptyUsage();
      draft.estimatedCostUsd = result.usage ? usageCost(result.usage, input.campaign.config) : 0;
      draft.outputSha256 = sha256(result.rawText);
      draft.rawArtifact = result.rawText;
      draft.error = result.usageError;
      draft.parsed = { validJson: scored.parsed.validJson, parseError: scored.parsed.parseError };
      draft.quality = scored.quality;
      history.push({ role: "user", content: scenarioTurn.instruction });
      if (input.pair.experiment !== "output-policy") history.push({ role: "assistant", content: result.rawText });
      calculateTotals(run, input.scenario.turns.length);
      updateProgress(input.campaign);
      atomicWriteJson(input.outputPath, input.campaign);
    } catch (error) {
      if (error instanceof CostCapStop) {
        run.status = "cost-cap-not-run";
        run.completedAt = new Date().toISOString();
        calculateTotals(run, input.scenario.turns.length);
        input.campaign.progress.state = "cost-cap-stopped";
        input.campaign.progress.costCapStoppedAtPlanKey = key;
        updateProgress(input.campaign);
        atomicWriteJson(input.outputPath, input.campaign);
        return "cost-cap";
      }
      if (!draftRecorded) { run.turns.push(draft); draftRecorded = true; }
      draft.status = "provider-error";
      draft.error = safeError(error);
      run.status = "provider-error";
      run.completedAt = new Date().toISOString();
      calculateTotals(run, input.scenario.turns.length);
      updateProgress(input.campaign);
      atomicWriteJson(input.outputPath, input.campaign);
      return "terminal";
    }
  }
  run.status = run.turns.some((turn) => turn.status === "invalid-usage") ? "invalid-usage" : "completed";
  run.completedAt = new Date().toISOString();
  calculateTotals(run, input.scenario.turns.length);
  updateProgress(input.campaign);
  atomicWriteJson(input.outputPath, input.campaign);
  return "terminal";
}

async function main(): Promise<void> {
  validateScenarioManifest();
  loadLocalEnv();
  const resumePath = resumeArgument();
  const loaded = loadConfig(argument("--config"));
  let campaign: LiveCampaignArtifact;
  let scenarios: BenchmarkScenario[];
  let outputPath: string;
  if (resumePath) {
    outputPath = resolve(resumePath);
    campaign = readCampaign(outputPath);
    if (campaign.configSha256 !== loaded.sha256 || campaign.config.requestedModel !== loaded.config.requestedModel) {
      throw new Error("resume config snapshot does not match the current config file");
    }
    scenarios = selectScenarios(campaign.selection.scenarioIds);
    if (campaign.corpusSha256 !== corpusSha256(scenarios)) throw new Error("resume corpus fingerprint mismatch");
    const suppliedCap = argument("--cost-cap-usd");
    const cap = suppliedCap === undefined ? campaign.cost.hardCapUsd : positiveNumber(suppliedCap, "--cost-cap-usd");
    if (cap + 1e-12 < campaign.cost.conservativeCapChargeUsd) throw new Error("new cost cap is below already accounted spend");
    campaign.cost.hardCapUsd = cap;
    campaign.progress.state = "running";
    campaign.progress.costCapStoppedAtPlanKey = null;
  } else {
    const preflightOnly = hasFlag("--preflight-only");
    const suppliedCap = argument("--cost-cap-usd");
    if (!preflightOnly && suppliedCap === undefined) throw new Error("live completions require an explicit --cost-cap-usd hard cap");
    const hardCapUsd = suppliedCap === undefined ? 0 : positiveNumber(suppliedCap, "--cost-cap-usd");
    const campaignId = argument("--campaign-id") ?? makeCampaignId();
    scenarios = selectScenarios(parseCsv(argument("--scenarios")));
    const options = {
      scenarioIds: scenarios.map((scenario) => scenario.id),
      replicates: positiveInteger(argument("--replicates"), 1, "--replicates", 1_000),
      targets: parseTargets(argument("--targets")),
      includeStageOnly: hasFlag("--stage-only") || hasFlag("--all-ablations"),
      includeLeaveOneOut: hasFlag("--leave-one-out") || hasFlag("--all-ablations"),
      includeOutputPolicyExperiment: hasFlag("--output-policy") || hasFlag("--all-ablations"),
    } as const;
    const comparisons = selectComparisons(options);
    const plan = buildPlan({ campaignId, scenarios, comparisons, replicates: options.replicates, includeOutputPolicyExperiment: options.includeOutputPolicyExperiment });
    const now = new Date().toISOString();
    campaign = {
      schemaVersion: 1,
      artifactKind: "live-campaign",
      campaignId,
      corpusId: SCENARIO_CORPUS_ID,
      corpusSha256: corpusSha256(scenarios),
      configSha256: loaded.sha256,
      createdAt: now,
      updatedAt: now,
      config: loaded.config,
      selection: makeSelection(scenarios, comparisons, options),
      design: makeDesign(campaignId),
      plan,
      progress: { state: "preflight", plannedPairs: plan.length, plannedRequests: plan.length * 2, recordedRequests: 0, completedPairs: 0, costCapStoppedAtPlanKey: null },
      cost: { hardCapUsd, authoritativeUsageCostUsd: 0, conservativeCapChargeUsd: 0, pricingSource: "config-snapshot" },
      preflight: null,
      runs: [],
      warnings: [
        "Only provider-reported usage is used for measured token and price-snapshot cost comparisons; optimizer counts are local diagnostics.",
        "Provider caching is natural/best-effort. Balanced paired order reduces order bias, while cache-hit and cache-miss tokens are reported separately; cost comparisons remain observational.",
        "Raw outputs are retained because every scenario is synthetic, enabling deterministic rescoring after evaluator changes.",
        "The runner sends no provider seed and makes no determinism claim.",
      ],
    };
    outputPath = resolve(argument("--out") ?? `${BENCHMARK_ROOT}/results/.partial/${campaignId}.json`);
    atomicWriteJson(outputPath, campaign);
  }
  const apiKeyName = argument("--api-key-env") ?? "DEEPSEEK_API_KEY";
  const apiKey = process.env[apiKeyName];
  if (!apiKey) throw new Error(`${apiKeyName} is missing from the process environment`);
  const timeoutMilliseconds = positiveInteger(argument("--timeout-ms"), 120_000, "--timeout-ms", 300_000);
  const maximumAttempts = positiveInteger(argument("--attempts"), 3, "--attempts", 10);
  if (!campaign.preflight || hasFlag("--refresh-preflight")) {
    campaign.preflight = await preflightModels(apiKey, campaign.config, timeoutMilliseconds);
    campaign.progress.state = "running";
    updateProgress(campaign);
    atomicWriteJson(outputPath, campaign);
  }
  if (hasFlag("--preflight-only")) {
    campaign.progress.state = "preflight";
    updateProgress(campaign);
    atomicWriteJson(outputPath, campaign);
    process.stdout.write(`Live model preflight passed for ${campaign.config.requestedModel}; no completion requests were made.\n`);
    return;
  }
  let orderPosition = 0;
  outer: for (const pair of campaign.plan) {
    const scenario = scenarios.find((candidate) => candidate.id === pair.scenarioId);
    if (!scenario) throw new Error(`planned scenario ${pair.scenarioId} is unavailable`);
    for (const arm of pair.armOrder) {
      orderPosition += 1;
      const result = await runScenarioArm({
        campaign, pair, arm, scenario, apiKey, outputPath, orderPosition, maximumAttempts, timeoutMilliseconds,
      });
      const run = campaign.runs.find((candidate) => candidate.planKey === planKey(pair, arm));
      process.stdout.write(`${orderPosition}/${campaign.progress.plannedRequests} ${pair.estimand} ${pair.scenarioId} r${pair.replicate} ${arm}: ${run?.status ?? "unrun"}\n`);
      if (result === "cost-cap") break outer;
    }
  }
  const unfinished = campaign.runs.some((run) => run.status === "cost-cap-not-run") || campaign.runs.length < campaign.progress.plannedRequests;
  campaign.progress.state = unfinished ? "cost-cap-stopped" : "completed";
  updateProgress(campaign);
  atomicWriteJson(outputPath, campaign);
  process.stdout.write(`Campaign ${campaign.progress.state}. Artifact: ${outputPath}. Authoritative usage cost: $${campaign.cost.authoritativeUsageCostUsd.toFixed(8)}; cap-accounted: $${campaign.cost.conservativeCapChargeUsd.toFixed(8)} / $${campaign.cost.hardCapUsd.toFixed(8)}.\n`);
}

await main();
