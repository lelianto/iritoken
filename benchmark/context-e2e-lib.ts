import { createHash } from "node:crypto";
import {
  SemanticCache, SemanticIndex, compactConversation, optimizeContext,
  prepareCacheAwarePrompt, rankContext, routeModel,
} from "../src/index.js";
import type { ContextMessage } from "../src/integrations/messages.js";
import type { ContextCampaignTask } from "./tasks/context-v4-manifest.js";

export interface StageTrace { stage: string; messages: number; characters: number; estimatedTokens: number; sha256: string; details: Record<string, unknown> }
export interface PreparedCampaignVariant { messages: ContextMessage[]; traces: StageTrace[]; retrievedIds: string[]; cacheProbe: { similarHit: boolean; dissimilarMiss: boolean } }
export const campaignCounter = { count: (text: string): number => text.trim() === "" ? 0 : text.trim().split(/\s+/).length };

function trace(stage: string, messages: readonly ContextMessage[], details: Record<string, unknown> = {}): StageTrace {
  const serialized = messages.map((message) => `${message.role}\0${message.content}`).join("\0");
  return { stage, messages: messages.length, characters: serialized.length, estimatedTokens: campaignCounter.count(serialized), sha256: createHash("sha256").update(serialized).digest("hex"), details };
}

export function scoreFacts(text: string, facts: readonly (readonly string[])[]): { found: number; required: number; recall: number; missing: string[] } {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}:.-]+/gu, " ");
  const missing = facts.filter((alternatives) => !alternatives.some((fact) => normalized.includes(fact.normalize("NFKC").toLocaleLowerCase("en-US")))).map((alternatives) => alternatives.join("|"));
  return { found: facts.length - missing.length, required: facts.length, recall: facts.length === 0 ? 1 : (facts.length - missing.length) / facts.length, missing };
}

export function prepareCampaignVariant(task: ContextCampaignTask, variant: "original" | "optimized"): PreparedCampaignVariant {
  const traces: StageTrace[] = []; let messages = task.messages.map((message) => ({ ...message }));
  traces.push(trace("01-raw-context", messages, { difficulty: task.difficulty }));
  const retrievedIds: string[] = [];
  if (variant === "optimized") {
    messages = messages.map((message, index) => index === 0 ? message : ({ ...message, content: optimizeContext(message.content, { preset: "balanced", command: task.command }).text }));
  }
  traces.push(trace("02-content-routing-and-optimization", messages, { variant, command: task.command ?? null }));
  if (task.documents) {
    const documents = variant === "original" ? [...task.documents] : (() => {
      const index = new SemanticIndex(); for (const document of task.documents) index.upsert(document);
      const matches = index.search(task.queryEmbedding ?? [], { limit: task.expectedRetrievedIds?.length ?? 1, minimumSimilarity: 0.5 });
      retrievedIds.push(...matches.map((match) => match.id)); return matches;
    })();
    messages.splice(messages.length - 1, 0, ...documents.map((document) => ({ role: "user", content: document.text })));
  }
  traces.push(trace("03-semantic-retrieval", messages, { retrievedIds, expectedRetrievedIds: task.expectedRetrievedIds ?? [] }));
  const ranked = rankContext(task.query, messages.slice(1).map((message, index) => ({ id: String(index + 1), text: message.content })));
  traces.push(trace("04-context-ranking", messages, { topRankedIndices: ranked.slice(0, 3).map((item) => item.id), topScores: ranked.slice(0, 3).map((item) => Math.round(item.score * 10_000) / 10_000) }));
  if (variant === "optimized") {
    const compacted = compactConversation(messages, { tokenCounter: campaignCounter, budgetTokens: task.budgetTokens, query: task.query, keepRecent: task.documents ? 2 : task.difficulty === "hard" ? 3 : 2, preset: "balanced" });
    messages = compacted.messages;
    traces.push(trace("05-token-budget-and-conversation-compaction", messages, { budgetTokens: task.budgetTokens, usedTokens: compacted.compactedTokens, omittedIndices: compacted.omittedIndices }));
  } else traces.push(trace("05-token-budget-and-conversation-compaction", messages, { bypassed: true }));
  const decision = routeModel([{ id: "deepseek-v4-flash", provider: "deepseek", model: "deepseek-v4-flash", maxContextTokens: 1_000_000, inputCostPerMillion: 0.14, capabilities: ["json"], priority: 1 }], { inputTokens: campaignCounter.count(messages.map((message) => message.content).join("\n")), requiredCapabilities: ["json"], prefer: "cost" });
  traces.push(trace("06-model-routing", messages, { route: decision.route.id, reason: decision.reason }));
  const stable = messages.filter((message) => message.role === "system"); const dynamic = messages.filter((message) => message.role !== "system");
  const prompt = prepareCacheAwarePrompt(stable, dynamic); messages = prompt.messages;
  traces.push(trace("07-cache-aware-prompt", messages, { stablePrefixMessages: prompt.stablePrefixMessages, prefixSha256: prompt.prefixSha256 }));
  const cache = new SemanticCache<string>({ similarityThreshold: 0.95 }); const basis = task.queryEmbedding ?? [1, 0];
  cache.set(task.name, basis, "synthetic-answer-placeholder");
  const similar = basis.map((value, index) => value + (index === 0 ? 0.0001 : 0)); const dissimilar = basis.map((_value, index) => index === basis.length - 1 ? 1 : 0);
  const cacheProbe = { similarHit: Boolean(cache.get(`${task.name}-paraphrase`, similar)), dissimilarMiss: !cache.get(`${task.name}-different`, dissimilar) };
  traces.push(trace("08-semantic-cache-probe", messages, cacheProbe));
  return { messages, traces, retrievedIds, cacheProbe };
}
