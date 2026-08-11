import {
  classifyContextUnits,
  type ClassifiedContextUnit,
  type ContextImportance,
  type ContextUnit,
} from "../context/classification.js";
import { fitTokenBudget } from "../context/budget.js";
import { DEFAULT_MAX_INPUT_CHARACTERS, InputLimitError } from "../security.js";
import type { PresetName, TokenCounter } from "../types.js";
import { optimize } from "./optimize.js";
import { optimizeStructured } from "./structured.js";

export interface IritokenOutputPolicyOptions {
  verbosity?: "concise" | "standard";
  format?: "text" | "json";
  preferPatch?: boolean;
  suppressUnchanged?: boolean;
  maxTokens?: number;
}

export interface IritokenOutputPolicy {
  verbosity: "concise" | "standard";
  format: "text" | "json";
  preferPatch: boolean;
  suppressUnchanged: boolean;
  maxTokens?: number;
  /** Instruction for the caller to add explicitly to its provider request. */
  instruction: string;
}

export interface IritokenOptions {
  tokenCounter: TokenCounter;
  targetReductionPercentage?: number;
  normalization?: boolean;
  deduplication?: boolean;
  structuredCompaction?: boolean;
  relevanceFiltering?: boolean;
  historyCompression?: boolean;
  dependencySelection?: boolean;
  outputOptimization?: boolean | IritokenOutputPolicyOptions;
  preset?: PresetName;
  /** Minimum lexical query-term coverage required for removable context. */
  minimumRelevanceScore?: number;
  keepRecentHistory?: number;
  maxUnits?: number;
  maxTotalCharacters?: number;
}

export interface IritokenRequest {
  query: string;
  units: readonly ContextUnit[];
}

export type IritokenStageName =
  | "classification"
  | "normalization"
  | "deduplication"
  | "structured-compaction"
  | "relevance-filtering"
  | "history-compression"
  | "dependency-selection"
  | "target-reduction"
  | "output-optimization";

export type IritokenStageAction =
  | "classified"
  | "preserved"
  | "transformed"
  | "omitted"
  | "restored"
  | "promoted"
  | "policy-created";

export interface IritokenStageDecision {
  unitId?: string;
  action: IritokenStageAction;
  reason: string;
  tokensBefore: number;
  tokensAfter: number;
}

export interface IritokenStageReport {
  stage: IritokenStageName;
  enabled: boolean;
  beforeTokens: number;
  afterTokens: number;
  /** May be negative when a safety stage restores required context. */
  tokensRemoved: number;
  decisions: IritokenStageDecision[];
}

export interface IritokenLedgerEntry {
  id: string;
  importance: ContextImportance;
  included: boolean;
  originalTokens: number;
  candidateTokens: number;
  selectedTokens: number;
  /** Unique query-term coverage, not a semantic probability. */
  relevanceScore: number;
  reasons: string[];
  transformations: string[];
  representedBy?: string;
}

export interface IritokenMetrics {
  originalTokens: number;
  optimizedTokens: number;
  tokensRemoved: number;
  reductionPercentage: number;
  targetReductionPercentage: number;
  targetTokens: number;
  targetAchievable: boolean;
  requiredTokens: number;
  requiredCoverage: { total: number; retained: number; percentage: number };
  /** Tokens removed by deterministic transforms or exact duplicate identity. */
  verifiedRemovedTokens: number;
  verifiedRemovedTokenShare: number;
  /** Explicit warnings; these are not converted into a fabricated risk score. */
  riskReasons: string[];
}

export interface IritokenResult {
  units: ClassifiedContextUnit[];
  omittedUnitIds: string[];
  outputPolicy?: IritokenOutputPolicy;
  metrics: IritokenMetrics;
  ledger: IritokenLedgerEntry[];
  stages: IritokenStageReport[];
}

export interface Iritoken {
  optimize(request: IritokenRequest): IritokenResult;
}

interface WorkingUnit {
  unit: ClassifiedContextUnit;
  content: string;
  included: boolean;
  originalTokens: number;
  candidateTokens: number;
  relevanceScore: number;
  reasons: string[];
  transformations: string[];
  representedBy?: string;
  verifiedRemovedTokens: number;
  index: number;
}

const IMPORTANCE_WEIGHT: Record<ContextImportance, number> = {
  MUST_KEEP: 1,
  IMPORTANT: 0.8,
  COMPRESSIBLE: 0.5,
  OPTIONAL: 0.2,
  REDUNDANT: 0,
};

function roundPercentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function textTerms(text: string): Set<string> {
  return new Set(
    text.normalize("NFKC").toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{N}_./:-]+/gu) ?? [],
  );
}

function lexicalCoverage(queryTerms: ReadonlySet<string>, text: string): number {
  if (queryTerms.size === 0) return 1;
  const candidateTerms = textTerms(text);
  let overlap = 0;
  for (const term of queryTerms) if (candidateTerms.has(term)) overlap += 1;
  return overlap / queryTerms.size;
}

function validateCount(counter: TokenCounter, text: string): number {
  const count = counter.count(text);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("token counter must return non-negative safe integers");
  }
  return count;
}

function sumIncluded(units: readonly WorkingUnit[]): number {
  const total = units.reduce(
    (sum, item) => sum + (item.included ? item.candidateTokens : 0),
    0,
  );
  if (!Number.isSafeInteger(total)) throw new RangeError("token total exceeds the safe integer range");
  return total;
}

function stageReport(
  stage: IritokenStageName,
  enabled: boolean,
  beforeTokens: number,
  afterTokens: number,
  decisions: IritokenStageDecision[],
): IritokenStageReport {
  return {
    stage,
    enabled,
    beforeTokens,
    afterTokens,
    tokensRemoved: beforeTokens - afterTokens,
    decisions,
  };
}

function importanceAtLeast(
  current: ContextImportance,
  desired: ContextImportance,
): ContextImportance {
  const order: ContextImportance[] = [
    "REDUNDANT", "OPTIONAL", "COMPRESSIBLE", "IMPORTANT", "MUST_KEEP",
  ];
  return order.indexOf(current) >= order.indexOf(desired) ? current : desired;
}

function duplicateIdentity(item: WorkingUnit): string {
  return [
    item.unit.kind ?? "unknown",
    item.unit.role ?? "",
    item.unit.path ?? "",
    item.unit.language ?? "",
    [...(item.unit.dependencies ?? [])].sort().join(","),
    item.content,
  ].join("\0");
}

function buildOutputPolicy(
  value: boolean | IritokenOutputPolicyOptions,
): IritokenOutputPolicy | undefined {
  if (value === false) return undefined;
  const supplied = value === true ? {} : value;
  const verbosity = supplied.verbosity ?? "concise";
  const format = supplied.format ?? "text";
  const preferPatch = supplied.preferPatch ?? true;
  const suppressUnchanged = supplied.suppressUnchanged ?? true;
  if (
    supplied.maxTokens !== undefined
    && (!Number.isSafeInteger(supplied.maxTokens) || supplied.maxTokens < 1)
  ) {
    throw new RangeError("output maxTokens must be a positive safe integer");
  }
  const instructions: string[] = [];
  if (verbosity === "concise") instructions.push("Respond concisely.");
  if (format === "json") instructions.push("Return valid JSON.");
  if (preferPatch) {
    instructions.push("For code changes, prefer a patch or diff over complete files.");
  }
  if (suppressUnchanged) {
    instructions.push("Do not repeat unchanged code or duplicate explanations.");
  }
  return {
    verbosity,
    format,
    preferPatch,
    suppressUnchanged,
    maxTokens: supplied.maxTokens,
    instruction: instructions.join(" "),
  };
}

/** Create a deterministic, inspectable context-optimization middleware. */
export function createIritoken(options: IritokenOptions): Iritoken {
  const targetReductionPercentage = options.targetReductionPercentage ?? 0;
  const minimumRelevanceScore = options.minimumRelevanceScore ?? 0.01;
  const keepRecentHistory = options.keepRecentHistory ?? 2;
  const maximumUnits = options.maxUnits ?? 10_000;
  const maximumCharacters = options.maxTotalCharacters ?? DEFAULT_MAX_INPUT_CHARACTERS;
  const preset = options.preset ?? "safe";
  if (
    !Number.isFinite(targetReductionPercentage)
    || targetReductionPercentage < 0
    || targetReductionPercentage > 100
  ) {
    throw new RangeError("targetReductionPercentage must be between 0 and 100");
  }
  if (
    !Number.isFinite(minimumRelevanceScore)
    || minimumRelevanceScore < 0
    || minimumRelevanceScore > 1
  ) {
    throw new RangeError("minimumRelevanceScore must be between 0 and 1");
  }
  if (!Number.isSafeInteger(keepRecentHistory) || keepRecentHistory < 0) {
    throw new RangeError("keepRecentHistory must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(maximumUnits) || maximumUnits < 1) {
    throw new RangeError("maxUnits must be a positive safe integer");
  }
  if (!Number.isSafeInteger(maximumCharacters) || maximumCharacters < 0) {
    throw new RangeError("maxTotalCharacters must be a non-negative safe integer");
  }

  const normalization = options.normalization ?? true;
  const deduplication = options.deduplication ?? true;
  const structuredCompaction = options.structuredCompaction ?? true;
  // Context omission is opt-in. Deterministic non-lossy transforms remain on
  // by default, while relevance/history policy requires an explicit choice.
  const relevanceFiltering = options.relevanceFiltering ?? false;
  const historyCompression = options.historyCompression ?? false;
  const dependencySelection = options.dependencySelection ?? true;
  const outputOptimization = options.outputOptimization ?? false;

  return {
    optimize(request: IritokenRequest): IritokenResult {
      if (request.units.length > maximumUnits) {
        throw new RangeError(`context unit count exceeds maximum ${maximumUnits}`);
      }
      const ids = new Set<string>();
      let totalCharacters = request.query.length;
      for (const unit of request.units) {
        if (unit.id.length === 0) throw new RangeError("context unit id must not be empty");
        if (ids.has(unit.id)) throw new RangeError("duplicate context unit id");
        if (unit.ordinal !== undefined && !Number.isFinite(unit.ordinal)) {
          throw new RangeError("context unit ordinals must be finite");
        }
        ids.add(unit.id);
        totalCharacters += unit.content.length;
        if (!Number.isSafeInteger(totalCharacters) || totalCharacters > maximumCharacters) {
          throw new InputLimitError(totalCharacters, maximumCharacters, "characters");
        }
      }

      const queryTerms = textTerms(request.query);
      const classified = classifyContextUnits(request.units);
      const working: WorkingUnit[] = classified.map((unit, index) => {
        const tokens = validateCount(options.tokenCounter, unit.content);
        return {
          unit,
          content: unit.content,
          included: unit.importance !== "REDUNDANT",
          originalTokens: tokens,
          candidateTokens: tokens,
          relevanceScore: lexicalCoverage(queryTerms, unit.content),
          reasons: [...unit.classificationReasons],
          transformations: [],
          verifiedRemovedTokens: 0,
          index,
        };
      });
      const originalTokens = working.reduce((sum, item) => sum + item.originalTokens, 0);
      if (!Number.isSafeInteger(originalTokens)) {
        throw new RangeError("original token total exceeds the safe integer range");
      }
      const stages: IritokenStageReport[] = [];
      const classificationDecisions = working.map<IritokenStageDecision>((item) => ({
        unitId: item.unit.id,
        action: "classified",
        reason: item.unit.classificationReasons.join(","),
        tokensBefore: item.originalTokens,
        tokensAfter: item.included ? item.candidateTokens : 0,
      }));
      stages.push(stageReport(
        "classification",
        true,
        originalTokens,
        sumIncluded(working),
        classificationDecisions,
      ));

      let before = sumIncluded(working);
      const normalizationDecisions: IritokenStageDecision[] = [];
      if (normalization) {
        for (const item of working) {
          if (!item.included) continue;
          const previousTokens = item.candidateTokens;
          const result = optimize(item.content, {
            preset,
            cleaners: {
              ansi: true,
              whitespace: true,
              duplicateLines: false,
              stackTrace: false,
              testOutput: false,
              repeatedBlocks: false,
            },
            maxInputCharacters: maximumCharacters,
          });
          item.content = result.text;
          item.candidateTokens = validateCount(options.tokenCounter, item.content);
          const removed = Math.max(0, previousTokens - item.candidateTokens);
          item.verifiedRemovedTokens += removed;
          const names = Object.keys(result.stats.transformations);
          item.transformations.push(...names);
          if (item.content !== item.unit.content) item.reasons.push("deterministic-normalization");
          if (removed > 0 || names.length > 0) {
            normalizationDecisions.push({
              unitId: item.unit.id,
              action: "transformed",
              reason: names.join(",") || "tokenizer-visible-normalization",
              tokensBefore: previousTokens,
              tokensAfter: item.candidateTokens,
            });
          }
        }
      }
      stages.push(stageReport(
        "normalization", normalization, before, sumIncluded(working), normalizationDecisions,
      ));

      before = sumIncluded(working);
      const deduplicationDecisions: IritokenStageDecision[] = [];
      const aliases = new Map<string, string>();
      if (deduplication) {
        const seen = new Map<string, WorkingUnit>();
        for (const item of working) {
          if (!item.included) continue;
          const previousTokens = item.candidateTokens;
          const result = optimize(item.content, {
            preset,
            cleaners: {
              ansi: false,
              whitespace: false,
              duplicateLines: true,
              stackTrace: preset !== "safe",
              testOutput: preset !== "safe",
              repeatedBlocks: preset === "aggressive",
            },
            maxInputCharacters: maximumCharacters,
          });
          item.content = result.text;
          item.candidateTokens = validateCount(options.tokenCounter, item.content);
          const removed = Math.max(0, previousTokens - item.candidateTokens);
          item.verifiedRemovedTokens += removed;
          const names = Object.keys(result.stats.transformations);
          item.transformations.push(...names);
          if (removed > 0 || names.length > 0) {
            item.reasons.push("deterministic-content-deduplication");
            deduplicationDecisions.push({
              unitId: item.unit.id,
              action: "transformed",
              reason: names.join(",") || "tokenizer-visible-deduplication",
              tokensBefore: previousTokens,
              tokensAfter: item.candidateTokens,
            });
          }
          const identity = duplicateIdentity(item);
          const canonical = seen.get(identity);
          if (!canonical) {
            seen.set(identity, item);
            continue;
          }
          if (item.unit.importance === "MUST_KEEP") {
            item.reasons.push(`exact-duplicate-preserved:${canonical.unit.id}`);
            continue;
          }
          const canonicalImportance = importanceAtLeast(
            canonical.unit.importance,
            item.unit.importance,
          );
          if (canonicalImportance !== canonical.unit.importance) {
            canonical.unit.importance = canonicalImportance;
            canonical.unit.classificationReasons.push(
              `represents-${item.unit.importance.toLowerCase()}:${item.unit.id}`,
            );
            canonical.reasons.push(`represents:${item.unit.id}`);
          }
          item.included = false;
          item.representedBy = canonical.unit.id;
          item.unit.importance = "REDUNDANT";
          item.unit.classificationReasons.push(`exact-duplicate-of:${canonical.unit.id}`);
          item.reasons.push(`exact-duplicate-of:${canonical.unit.id}`);
          item.verifiedRemovedTokens += item.candidateTokens;
          aliases.set(item.unit.id, canonical.unit.id);
          deduplicationDecisions.push({
            unitId: item.unit.id,
            action: "omitted",
            reason: `exact-duplicate-of:${canonical.unit.id}`,
            tokensBefore: item.candidateTokens,
            tokensAfter: 0,
          });
        }
      }
      stages.push(stageReport(
        "deduplication", deduplication, before, sumIncluded(working), deduplicationDecisions,
      ));

      before = sumIncluded(working);
      const structuredDecisions: IritokenStageDecision[] = [];
      if (structuredCompaction) {
        for (const item of working) {
          if (!item.included) continue;
          const previousTokens = item.candidateTokens;
          const result = optimizeStructured(item.content);
          if (!result.changed) continue;
          item.content = result.text;
          item.candidateTokens = validateCount(options.tokenCounter, item.content);
          item.verifiedRemovedTokens += Math.max(0, previousTokens - item.candidateTokens);
          item.transformations.push(`structured-${result.type}`);
          item.reasons.push(`lexically-lossless-${result.type}-compaction`);
          structuredDecisions.push({
            unitId: item.unit.id,
            action: "transformed",
            reason: `lexically-lossless-${result.type}`,
            tokensBefore: previousTokens,
            tokensAfter: item.candidateTokens,
          });
        }
      }
      stages.push(stageReport(
        "structured-compaction", structuredCompaction, before,
        sumIncluded(working), structuredDecisions,
      ));

      for (const item of working) {
        item.relevanceScore = lexicalCoverage(queryTerms, item.content);
      }
      const orderedHistory = working
        .filter((item) => item.unit.kind === "conversation")
        .sort((left, right) =>
          (left.unit.ordinal ?? left.index) - (right.unit.ordinal ?? right.index)
          || left.index - right.index);
      const recentHistoryIds = new Set(
        orderedHistory.slice(Math.max(0, orderedHistory.length - keepRecentHistory))
          .map((item) => item.unit.id),
      );
      before = sumIncluded(working);
      const relevanceDecisions: IritokenStageDecision[] = [];
      if (relevanceFiltering && queryTerms.size > 0) {
        for (const item of working) {
          if (!item.included) continue;
          if (recentHistoryIds.has(item.unit.id)) continue;
          if (item.unit.importance === "MUST_KEEP" || item.unit.importance === "IMPORTANT") {
            continue;
          }
          if (item.relevanceScore >= minimumRelevanceScore) continue;
          item.included = false;
          item.reasons.push(`below-lexical-relevance:${minimumRelevanceScore}`);
          relevanceDecisions.push({
            unitId: item.unit.id,
            action: "omitted",
            reason: `lexical-coverage:${item.relevanceScore.toFixed(4)}`,
            tokensBefore: item.candidateTokens,
            tokensAfter: 0,
          });
        }
      }
      stages.push(stageReport(
        "relevance-filtering", relevanceFiltering, before,
        sumIncluded(working), relevanceDecisions,
      ));

      before = sumIncluded(working);
      const historyDecisions: IritokenStageDecision[] = [];
      if (historyCompression) {
        for (const item of orderedHistory) {
          if (!item.included) continue;
          if (recentHistoryIds.has(item.unit.id)) {
            if (item.unit.importance !== "MUST_KEEP") {
              item.unit.importance = "MUST_KEEP";
              item.unit.classificationReasons.push("recent-history-window");
              item.reasons.push("recent-history-window");
              historyDecisions.push({
                unitId: item.unit.id,
                action: "promoted",
                reason: `inside-last-${keepRecentHistory}-history-units`,
                tokensBefore: item.candidateTokens,
                tokensAfter: item.candidateTokens,
              });
            }
            continue;
          }
          if (item.unit.importance === "MUST_KEEP" || item.unit.importance === "IMPORTANT") {
            continue;
          }
          if (queryTerms.size > 0 && item.relevanceScore >= minimumRelevanceScore) continue;
          item.included = false;
          item.reasons.push("history-outside-recent-window");
          historyDecisions.push({
            unitId: item.unit.id,
            action: "omitted",
            reason: `outside-last-${keepRecentHistory}-history-units`,
            tokensBefore: item.candidateTokens,
            tokensAfter: 0,
          });
        }
      }
      stages.push(stageReport(
        "history-compression", historyCompression, before,
        sumIncluded(working), historyDecisions,
      ));

      const byId = new Map(working.map((item) => [item.unit.id, item]));
      const resolveAlias = (id: string): string => {
        const visited = new Set<string>();
        let current = id;
        while (aliases.has(current) && !visited.has(current)) {
          visited.add(current);
          current = aliases.get(current) ?? current;
        }
        return current;
      };
      const riskReasons: string[] = [];
      before = sumIncluded(working);
      const dependencyDecisions: IritokenStageDecision[] = [];
      if (dependencySelection) {
        const queue = working.filter((item) =>
          item.included
          && (item.unit.importance === "MUST_KEEP" || item.unit.importance === "IMPORTANT"));
        const visited = new Set<string>();
        while (queue.length > 0) {
          const source = queue.shift();
          if (!source || visited.has(source.unit.id)) continue;
          visited.add(source.unit.id);
          for (const dependencyId of source.unit.dependencies ?? []) {
            const resolvedId = resolveAlias(dependencyId);
            const dependency = byId.get(resolvedId);
            if (!dependency) {
              const reason = `unresolved-dependency:${source.unit.id}->${dependencyId}`;
              riskReasons.push(reason);
              source.reasons.push(reason);
              continue;
            }
            const desired = source.unit.importance === "MUST_KEEP"
              ? "MUST_KEEP"
              : "IMPORTANT";
            const promoted = importanceAtLeast(dependency.unit.importance, desired);
            if (promoted !== dependency.unit.importance) {
              dependency.unit.importance = promoted;
              dependency.unit.classificationReasons.push(
                `dependency-of:${source.unit.id}`,
              );
              dependency.reasons.push(`dependency-of:${source.unit.id}`);
              dependencyDecisions.push({
                unitId: dependency.unit.id,
                action: "promoted",
                reason: `${promoted.toLowerCase()}-dependency-of:${source.unit.id}`,
                tokensBefore: dependency.included ? dependency.candidateTokens : 0,
                tokensAfter: dependency.candidateTokens,
              });
            }
            if (!dependency.included) {
              dependency.included = true;
              dependency.reasons.push(`restored-dependency-of:${source.unit.id}`);
              dependencyDecisions.push({
                unitId: dependency.unit.id,
                action: "restored",
                reason: `dependency-of:${source.unit.id}`,
                tokensBefore: 0,
                tokensAfter: dependency.candidateTokens,
              });
            }
            queue.push(dependency);
          }
        }
      }
      stages.push(stageReport(
        "dependency-selection", dependencySelection, before,
        sumIncluded(working), dependencyDecisions,
      ));

      before = sumIncluded(working);
      const targetTokens = Math.ceil(
        originalTokens * (1 - targetReductionPercentage / 100),
      );
      const budgetItems = working.filter((item) => item.included).map((item) => ({
        id: item.unit.id,
        text: item.content,
        score: (IMPORTANCE_WEIGHT[item.unit.importance] + item.relevanceScore * 0.01)
          * Math.max(1, item.candidateTokens),
        required: item.unit.importance === "MUST_KEEP",
      }));
      const fitted = fitTokenBudget(
        budgetItems, targetTokens, options.tokenCounter, { maxItems: maximumUnits },
      );
      const selectedIds = new Set(fitted.selected.map((item) => item.id));
      const targetDecisions: IritokenStageDecision[] = [];
      for (const item of working) {
        if (!item.included || selectedIds.has(item.unit.id)) continue;
        item.included = false;
        item.reasons.push("omitted-to-meet-target");
        targetDecisions.push({
          unitId: item.unit.id,
          action: "omitted",
          reason: `target-budget:${targetTokens}`,
          tokensBefore: item.candidateTokens,
          tokensAfter: 0,
        });
      }
      if (dependencySelection) {
        let changed = true;
        while (changed) {
          changed = false;
          for (const item of working) {
            if (!item.included || item.unit.importance === "MUST_KEEP") continue;
            const missingSelectedDependency = (item.unit.dependencies ?? []).find((dependencyId) => {
              const dependency = byId.get(resolveAlias(dependencyId));
              return dependency !== undefined && !dependency.included;
            });
            if (!missingSelectedDependency) continue;
            item.included = false;
            item.reasons.push(`dependency-not-selected:${missingSelectedDependency}`);
            targetDecisions.push({
              unitId: item.unit.id,
              action: "omitted",
              reason: `dependency-not-selected:${missingSelectedDependency}`,
              tokensBefore: item.candidateTokens,
              tokensAfter: 0,
            });
            changed = true;
          }
        }
      }
      const optimizedTokens = sumIncluded(working);
      const targetAchievable = fitted.targetAchievable && optimizedTokens <= targetTokens;
      if (!targetAchievable) {
        riskReasons.push(
          `target-unachievable:required-or-dependent-context-exceeds-${targetTokens}-tokens`,
        );
      }
      stages.push(stageReport(
        "target-reduction", true, before, optimizedTokens, targetDecisions,
      ));

      const outputBefore = optimizedTokens;
      const outputPolicy = outputOptimization
        ? buildOutputPolicy(outputOptimization)
        : undefined;
      stages.push(stageReport(
        "output-optimization",
        Boolean(outputOptimization),
        outputBefore,
        outputBefore,
        outputPolicy ? [{
          action: "policy-created",
          reason: "explicit-provider-output-policy;no-output-savings-claimed",
          tokensBefore: outputBefore,
          tokensAfter: outputBefore,
        }] : [],
      ));

      const required = working.filter((item) => item.unit.importance === "MUST_KEEP");
      const retainedRequired = required.filter((item) => item.included);
      const requiredTokens = required.reduce((sum, item) => sum + item.candidateTokens, 0);
      if (!Number.isSafeInteger(requiredTokens)) {
        throw new RangeError("required token total exceeds the safe integer range");
      }
      const tokensRemoved = originalTokens - optimizedTokens;
      const measuredVerifiedRemovedTokens = working.reduce(
        (sum, item) => sum + item.verifiedRemovedTokens,
        0,
      );
      const verifiedRemovedTokens = Math.min(
        Math.max(0, tokensRemoved),
        measuredVerifiedRemovedTokens,
      );
      const units = working.filter((item) => item.included)
        .sort((left, right) => left.index - right.index)
        .map((item) => ({
          ...item.unit,
          content: item.content,
          dependencies: item.unit.dependencies ? [...item.unit.dependencies] : undefined,
          metadata: item.unit.metadata ? { ...item.unit.metadata } : undefined,
          classificationReasons: [...item.unit.classificationReasons],
        }));
      const ledger = working.sort((left, right) => left.index - right.index)
        .map<IritokenLedgerEntry>((item) => ({
          id: item.unit.id,
          importance: item.unit.importance,
          included: item.included,
          originalTokens: item.originalTokens,
          candidateTokens: item.candidateTokens,
          selectedTokens: item.included ? item.candidateTokens : 0,
          relevanceScore: Math.round(item.relevanceScore * 10_000) / 10_000,
          reasons: [...new Set(item.reasons)],
          transformations: [...new Set(item.transformations)],
          representedBy: item.representedBy,
        }));

      return {
        units,
        omittedUnitIds: ledger.filter((item) => !item.included).map((item) => item.id),
        outputPolicy,
        metrics: {
          originalTokens,
          optimizedTokens,
          tokensRemoved,
          reductionPercentage: roundPercentage(tokensRemoved, originalTokens),
          targetReductionPercentage,
          targetTokens,
          targetAchievable,
          requiredTokens,
          requiredCoverage: {
            total: required.length,
            retained: retainedRequired.length,
            percentage: required.length === 0
              ? 100
              : roundPercentage(retainedRequired.length, required.length),
          },
          verifiedRemovedTokens,
          verifiedRemovedTokenShare: Math.min(
            100,
            roundPercentage(verifiedRemovedTokens, Math.max(0, tokensRemoved)),
          ),
          riskReasons: [...new Set(riskReasons)],
        },
        ledger,
        stages,
      };
    },
  };
}
