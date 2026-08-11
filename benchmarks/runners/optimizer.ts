import { estimateTokens, optimizeContext } from "../../src/index.js";
import type {
  AblationDefinition,
  PreparedTurn,
  PublicContextBlock,
  PublicScenario,
} from "../types.js";

interface CoreContextUnit {
  id: string;
  content: string;
  kind: string;
  importance?: "MUST_KEEP" | "IMPORTANT" | "COMPRESSIBLE" | "OPTIONAL" | "REDUNDANT";
  role: string;
  path?: string;
  language?: string;
  dependencies?: readonly string[];
  required: boolean;
  referenced: boolean;
  ordinal: number;
  metadata: Record<string, unknown>;
}

interface CoreOptimizationResult {
  units: readonly CoreContextUnit[];
  omittedUnitIds: readonly string[];
  outputPolicy?: unknown;
  metrics: Omit<PreparedTurn["metrics"], "localEstimateOnly" | "requiredCoverage"> & {
    requiredCoverage: number | { total: number; retained: number; percentage: number };
  };
  ledger: readonly unknown[];
  stages: readonly unknown[];
}

interface CoreIritoken {
  optimize(input: { query: string; units: readonly CoreContextUnit[] }): CoreOptimizationResult | Promise<CoreOptimizationResult>;
}

interface CoreModule {
  createIritoken?(options: {
    tokenCounter: { count(text: string): number };
    targetReductionPercentage: number;
    normalization: boolean;
    deduplication: boolean;
    structuredCompaction: boolean;
    relevanceFiltering: boolean;
    historyCompression: boolean;
    dependencySelection: boolean;
    outputOptimization: boolean;
    preset: "safe" | "balanced" | "aggressive";
    minimumRelevanceScore: number;
    keepRecentHistory: number;
  }): CoreIritoken;
}

export interface PrepareTurnInput {
  scenario: PublicScenario;
  turnIndex: number;
  conversationHistory: readonly { role: "user" | "assistant" | "tool"; content: string }[];
  ablation: AblationDefinition;
  /** Live evidence must require the production core. Dry runs may exercise the safe fallback. */
  requireCore: boolean;
}

function blockContent(block: PublicContextBlock): string {
  const provenance = [block.id, block.path, block.command].filter(Boolean).join(" | ");
  return `[CONTEXT ${provenance}]\n${block.content}`;
}

function coreKind(block: PublicContextBlock): string {
  if (block.kind === "requirement") return "user-requirement";
  if (block.kind === "source") return "source-code";
  if (block.kind === "type-definition") return "type-definition";
  if (block.kind === "test") return "source-code";
  if (block.kind === "configuration") return "configuration";
  if (block.kind === "terminal-output") return "tool-output";
  if (block.kind === "history") return "conversation";
  if (block.kind === "documentation") return "documentation";
  return "repository-metadata";
}

function toUnits(input: PrepareTurnInput): CoreContextUnit[] {
  const turn = input.scenario.turns[input.turnIndex];
  if (!turn) throw new RangeError(`turn index ${input.turnIndex} is out of range for ${input.scenario.id}`);
  let ordinal = 0;
  const units: CoreContextUnit[] = [{
    id: `${input.scenario.id}:system`,
    content: input.scenario.systemInstruction,
    kind: "system-instruction",
    importance: "MUST_KEEP",
    role: "system",
    required: true,
    referenced: true,
    ordinal: ordinal++,
    metadata: { source: "system-instruction" },
  }];
  for (const block of input.scenario.context) {
    const actualRequirement = block.kind === "requirement";
    units.push({
      id: `${input.scenario.id}:context:${block.id}`,
      content: blockContent(block),
      kind: coreKind(block),
      importance: actualRequirement ? "MUST_KEEP" : undefined,
      role: "user",
      path: block.path,
      language: block.language,
      dependencies: block.dependencies?.map((id) => `${input.scenario.id}:context:${id}`),
      required: actualRequirement,
      referenced: actualRequirement,
      ordinal: ordinal++,
      metadata: block.command === undefined
        ? { blockId: block.id }
        : { blockId: block.id, command: block.command },
    });
  }
  for (const [index, message] of input.conversationHistory.entries()) {
    units.push({
      id: `${input.scenario.id}:history:${index}`,
      content: message.content,
      kind: "conversation",
      importance: index >= input.conversationHistory.length - 2 ? "IMPORTANT" : "COMPRESSIBLE",
      role: message.role,
      required: false,
      referenced: false,
      ordinal: ordinal++,
      metadata: { historyIndex: index },
    });
  }
  units.push({
    id: `${input.scenario.id}:turn:${turn.id}`,
    content: turn.instruction,
    kind: "query",
    importance: "MUST_KEEP",
    role: "user",
    required: true,
    referenced: true,
    ordinal,
    metadata: { turnId: turn.id },
  });
  return units;
}

function messagesFromUnits(units: readonly CoreContextUnit[], outputPolicy?: unknown): Array<{ role: string; content: string }> {
  const ordered = [...units].sort((left, right) => left.ordinal - right.ordinal);
  const messages = ordered.map((unit) => ({ role: unit.role, content: unit.content }));
  let policyInstruction: string | null = null;
  if (typeof outputPolicy === "string" && outputPolicy.trim() !== "") {
    policyInstruction = outputPolicy;
  } else if (outputPolicy && typeof outputPolicy === "object") {
    const instruction = Reflect.get(outputPolicy, "instruction");
    if (typeof instruction === "string" && instruction.trim() !== "") {
      policyInstruction = instruction;
    }
  }
  if (policyInstruction !== null) {
    const system = messages.find((message) => message.role === "system");
    if (system) system.content = `${system.content}\nIRITOKEN OUTPUT POLICY: ${policyInstruction}`;
    else messages.unshift({ role: "system", content: `IRITOKEN OUTPUT POLICY: ${policyInstruction}` });
  }
  return messages;
}

function totalEstimatedTokens(units: readonly CoreContextUnit[]): number {
  return units.reduce((total, unit) => total + estimateTokens(unit.content), 0);
}

function baselineResult(units: readonly CoreContextUnit[]): PreparedTurn {
  const originalTokens = totalEstimatedTokens(units);
  return {
    messages: messagesFromUnits(units),
    omittedUnitIds: [],
    metrics: {
      originalTokens,
      optimizedTokens: originalTokens,
      tokensRemoved: 0,
      reductionPercentage: 0,
      targetReductionPercentage: 0,
      targetTokens: originalTokens,
      targetAchievable: true,
      requiredTokens: units.filter((unit) => unit.required).reduce((total, unit) => total + estimateTokens(unit.content), 0),
      requiredCoverage: 1,
      verifiedRemovedTokens: 0,
      verifiedRemovedTokenShare: 0,
      riskReasons: [],
      localEstimateOnly: true,
    },
    ledger: [],
    stages: [],
    adapter: "baseline",
  };
}

function fallbackResult(units: readonly CoreContextUnit[], input: PrepareTurnInput): PreparedTurn {
  const enabled = new Set(input.ablation.enabledStages);
  const effectiveTarget = enabled.has("targetReduction") ? input.ablation.target : 0;
  const optimizedUnits = units.map((unit) => {
    if (unit.role === "system" || unit.required) return unit;
    const command = typeof unit.metadata.command === "string" ? unit.metadata.command : undefined;
    const result = optimizeContext(unit.content, {
      preset: input.ablation.target >= 70 ? "aggressive" : input.ablation.target >= 50 ? "balanced" : "safe",
      command,
      structured: enabled.has("structuredCompaction"),
      cleaners: {
        ansi: enabled.has("normalization"),
        whitespace: enabled.has("normalization"),
        duplicateLines: enabled.has("deduplication"),
        repeatedBlocks: enabled.has("deduplication"),
        stackTrace: enabled.has("structuredCompaction"),
        testOutput: enabled.has("structuredCompaction"),
      },
    });
    return { ...unit, content: result.text };
  });
  const originalTokens = totalEstimatedTokens(units);
  const optimizedTokens = totalEstimatedTokens(optimizedUnits);
  const removed = Math.max(0, originalTokens - optimizedTokens);
  const reduction = originalTokens === 0 ? 0 : (removed / originalTokens) * 100;
  const requiredTokens = units.filter((unit) => unit.required).reduce((total, unit) => total + estimateTokens(unit.content), 0);
  return {
    messages: messagesFromUnits(optimizedUnits),
    omittedUnitIds: [],
    metrics: {
      originalTokens,
      optimizedTokens,
      tokensRemoved: removed,
      reductionPercentage: reduction,
      targetReductionPercentage: effectiveTarget,
      targetTokens: Math.ceil(originalTokens * (1 - effectiveTarget / 100)),
      targetAchievable: reduction + 1e-9 >= effectiveTarget,
      requiredTokens,
      requiredCoverage: 1,
      verifiedRemovedTokens: removed,
      verifiedRemovedTokenShare: removed === 0 ? 0 : 100,
      riskReasons: ["production-core-unavailable"],
      localEstimateOnly: true,
    },
    ledger: [{
      warning: "Production createIritoken was unavailable; only deterministic content cleaners ran.",
      unsupportedStages: input.ablation.enabledStages.filter((stage) => ["relevanceFiltering", "historyCompression", "dependencySelection", "outputOptimization"].includes(stage)),
    }],
    stages: [{ id: "safe-fallback", originalTokens, optimizedTokens }],
    adapter: "safe-fallback",
  };
}

function normalizedMetrics(result: CoreOptimizationResult, originalUnits: readonly CoreContextUnit[]): PreparedTurn["metrics"] {
  const originalTokens = Number.isFinite(result.metrics.originalTokens) ? result.metrics.originalTokens : totalEstimatedTokens(originalUnits);
  const optimizedTokens = Number.isFinite(result.metrics.optimizedTokens) ? result.metrics.optimizedTokens : totalEstimatedTokens(result.units);
  const removed = Math.max(0, originalTokens - optimizedTokens);
  return {
    originalTokens,
    optimizedTokens,
    tokensRemoved: Number.isFinite(result.metrics.tokensRemoved) ? result.metrics.tokensRemoved : removed,
    reductionPercentage: Number.isFinite(result.metrics.reductionPercentage)
      ? result.metrics.reductionPercentage
      : originalTokens === 0 ? 0 : (removed / originalTokens) * 100,
    targetReductionPercentage: result.metrics.targetReductionPercentage,
    targetTokens: result.metrics.targetTokens,
    targetAchievable: result.metrics.targetAchievable,
    requiredTokens: result.metrics.requiredTokens,
    requiredCoverage: typeof result.metrics.requiredCoverage === "number"
      ? result.metrics.requiredCoverage
      : result.metrics.requiredCoverage.percentage / 100,
    verifiedRemovedTokens: result.metrics.verifiedRemovedTokens,
    verifiedRemovedTokenShare: result.metrics.verifiedRemovedTokenShare,
    riskReasons: [...result.metrics.riskReasons],
    localEstimateOnly: true,
  };
}

export async function prepareTurn(input: PrepareTurnInput): Promise<PreparedTurn> {
  const units = toUnits(input);
  if (input.ablation.target === 0 || input.ablation.kind === "baseline") return baselineResult(units);
  const module = await import("../../src/index.js") as unknown as CoreModule;
  if (typeof module.createIritoken !== "function") {
    if (input.requireCore) throw new Error("createIritoken is unavailable; live evidence refuses to use the fallback adapter");
    return fallbackResult(units, input);
  }
  const enabled = new Set(input.ablation.enabledStages);
  const effectiveTarget = enabled.has("targetReduction") ? input.ablation.target : 0;
  const engine = module.createIritoken({
    tokenCounter: { count: estimateTokens },
    targetReductionPercentage: effectiveTarget,
    normalization: enabled.has("normalization"),
    deduplication: enabled.has("deduplication"),
    structuredCompaction: enabled.has("structuredCompaction"),
    relevanceFiltering: enabled.has("relevanceFiltering"),
    historyCompression: enabled.has("historyCompression"),
    dependencySelection: enabled.has("dependencySelection"),
    outputOptimization: enabled.has("outputOptimization"),
    preset: input.ablation.target >= 80 ? "aggressive" : input.ablation.target >= 50 ? "balanced" : "safe",
    minimumRelevanceScore: 0.08 + input.ablation.target / 500,
    keepRecentHistory: input.ablation.target >= 70 ? 1 : 2,
  });
  const turn = input.scenario.turns[input.turnIndex];
  if (!turn) throw new RangeError(`turn index ${input.turnIndex} is out of range`);
  const result = await engine.optimize({ query: turn.instruction, units });
  return {
    messages: messagesFromUnits(result.units, result.outputPolicy),
    omittedUnitIds: [...result.omittedUnitIds],
    metrics: normalizedMetrics(result, units),
    ledger: [...result.ledger],
    stages: [...result.stages],
    adapter: "iritoken-core",
  };
}
