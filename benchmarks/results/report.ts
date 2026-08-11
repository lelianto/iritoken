import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ScenarioCategory } from "../types.js";
import { argument, atomicWriteJson, writeText } from "../runners/common.js";
import type { LiveCampaignArtifact } from "../runners/schema.js";
import {
  analyzeCampaign,
  type BenchmarkAnalysis,
  type DetailedPairedTargetSummary,
  type WorkloadFrontier,
} from "../stats/paired.js";

export interface RequiredQuestionAnswer {
  number: number;
  question: string;
  status: "supported" | "not-supported" | "inconclusive" | "unrun";
  answer: string;
}

export interface BenchmarkReportArtifact {
  schemaVersion: 1;
  artifactKind: "benchmark-report";
  campaignId: string;
  generatedAt: string;
  analysis: BenchmarkAnalysis;
  requiredQuestions: RequiredQuestionAnswer[];
}

function percent(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value) ? "unavailable" : `${(value * 100).toFixed(digits)}%`;
}

function points(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "unavailable" : `${(value * 100).toFixed(2)} pp`;
}

function interval(value: readonly [number, number] | null, format: "percent" | "points" = "percent"): string {
  if (!value) return "unavailable";
  return format === "percent"
    ? `[${percent(value[0])}, ${percent(value[1])}]`
    : `[${points(value[0])}, ${points(value[1])}]`;
}

function categoryName(category: ScenarioCategory | "overall"): string {
  return category === "overall" ? "overall" : category.replaceAll("-", " ");
}

function primaryOverall(analysis: BenchmarkAnalysis): DetailedPairedTargetSummary[] {
  return analysis.summaries
    .filter((summary) => summary.category === "overall" && summary.estimand === "primary-context-vs-raw")
    .sort((left, right) => left.target - right.target);
}

function thresholdEvidence(analysis: BenchmarkAnalysis, threshold: number): RequiredQuestionAnswer["status"] {
  const frontier = analysis.frontiers.find((item) => item.category === "overall");
  if (!frontier || frontier.classification === "unrun") return "unrun";
  if (frontier.classification !== "established" || !frontier.measuredTotalTokenReductionCi95) return "inconclusive";
  return frontier.measuredTotalTokenReductionCi95[0] >= threshold ? "supported" : "not-supported";
}

function thresholdAnswer(analysis: BenchmarkAnalysis, threshold: number): RequiredQuestionAnswer {
  const status = thresholdEvidence(analysis, threshold);
  const label = `${Math.round(threshold * 100)}%`;
  const question = `Can Iritoken realistically reduce total token usage by ${label} without measurable quality degradation?`;
  if (status === "unrun") return { number: 0, question, status, answer: "Unrun: no completed primary live pair is available." };
  if (status === "supported") {
    const frontier = analysis.frontiers.find((item) => item.category === "overall");
    return { number: 0, question, status, answer: `Yes on this fixed synthetic corpus: the monotonic noninferiority frontier measured ${percent(frontier?.measuredTotalTokenReduction ?? null)} total-token reduction with a 95% cluster-bootstrap interval of ${interval(frontier?.measuredTotalTokenReductionCi95 ?? null)}.` };
  }
  if (status === "not-supported") return { number: 0, question, status, answer: `No. The statistically established frontier does not reach ${label}.` };
  return { number: 0, question, status, answer: `Inconclusive. No primary target both passed the noninferiority/power guards and had a total-token reduction interval reaching ${label}.` };
}

export function answerRequiredQuestions(campaign: LiveCampaignArtifact, analysis: BenchmarkAnalysis): RequiredQuestionAnswer[] {
  const fifty = thresholdAnswer(analysis, 0.5);
  const seventy = thresholdAnswer(analysis, 0.7);
  const ninety = thresholdAnswer(analysis, 0.9);
  const workloadFrontiers = analysis.frontiers.filter((frontier) => frontier.category !== "overall");
  const establishedWorkloads = workloadFrontiers.filter((frontier) => frontier.classification === "established");
  const anyRun = campaign.runs.length > 0;
  const harmful = analysis.summaries
    .filter((summary) => summary.estimand === "primary-context-vs-raw" && summary.classification === "red-material-harm")
    .sort((left, right) => left.target - right.target)[0];
  const stageOnly = analysis.summaries
    .filter((summary) => summary.category === "overall" && summary.estimand === "stage-only-vs-raw" && summary.totalTokenReduction !== null)
    .sort((left, right) => (right.totalTokenReduction ?? -Infinity) - (left.totalTokenReduction ?? -Infinity));
  const establishedStage = stageOnly.find((summary) => summary.classification === "green-noninferior");
  const descriptiveStage = stageOnly[0];
  const primary = primaryOverall(analysis);
  const observed50 = primary.find((summary) => summary.target === 50) ?? primary[0];
  const repeated = analysis.summaries.find((summary) => summary.category === "repeated-agent-session" && summary.estimand === "primary-context-vs-raw" && summary.target === 50)
    ?? analysis.summaries.find((summary) => summary.category === "repeated-agent-session" && summary.estimand === "primary-context-vs-raw");
  const overallFrontier = analysis.frontiers.find((frontier) => frontier.category === "overall");
  const questions: RequiredQuestionAnswer[] = [
    { ...fifty, number: 1 },
    {
      number: 2,
      question: "Under what workloads?",
      status: !anyRun ? "unrun" : establishedWorkloads.length > 0 ? "supported" : "inconclusive",
      answer: !anyRun
        ? "Unrun."
        : establishedWorkloads.length > 0
          ? `Supported only for these synthetic workload strata: ${establishedWorkloads.map((item) => `${categoryName(item.category)} (${percent(item.measuredTotalTokenReduction)})`).join(", ")}.`
          : "Inconclusive by workload: each category lacks enough independent scenario clusters to pass the pre-specified guard.",
    },
    { ...seventy, number: 3 },
    { ...ninety, number: 4 },
    {
      number: 5,
      question: "Under what circumstances does aggressive optimization begin hurting quality?",
      status: !anyRun ? "unrun" : harmful ? "supported" : "inconclusive",
      answer: !anyRun
        ? "Unrun."
        : harmful
          ? `Material harm is first established at requested target ${harmful.target}% for ${categoryName(harmful.category)}; paired quality difference ${points(harmful.qualityDifference.mean)} with 95% CI ${interval(harmful.qualityDifference.ci95, "points")}.`
          : "Inconclusive: no primary target met the statistical criteria for a material-harm classification. Descriptive failures must not be promoted to a degradation threshold.",
    },
    {
      number: 6,
      question: "Which optimization technique contributes the largest real-world savings?",
      status: !anyRun ? "unrun" : establishedStage ? "supported" : "inconclusive",
      answer: !anyRun
        ? "Unrun."
        : establishedStage
          ? `${establishedStage.ablationId} has the largest statistically quality-preserving stage-only measured reduction (${percent(establishedStage.totalTokenReduction)}).`
          : descriptiveStage
            ? `Inconclusive. Descriptively, ${descriptiveStage.ablationId} had the largest stage-only ratio-of-sums reduction (${percent(descriptiveStage.totalTokenReduction)}), but it did not pass the noninferiority/power guards.`
            : "Inconclusive because stage-only arms were not run.",
    },
    {
      number: 7,
      question: "Does optimization work better for input tokens, output tokens, or repeated context?",
      status: !anyRun ? "unrun" : observed50 ? "inconclusive" : "unrun",
      answer: !anyRun || !observed50
        ? "Unrun."
        : `Inconclusive as a quality-preserving claim. At requested ${observed50.target}%, the descriptive overall input/output reductions were ${percent(observed50.inputReduction)} / ${percent(observed50.outputReduction)}; the repeated-session descriptive total reduction was ${percent(repeated?.totalTokenReduction ?? null)}. Output-policy effects are reported in a separate estimand.`,
    },
    {
      number: 8,
      question: "What is the measured cost reduction when using DeepSeek V4 Flash?",
      status: !anyRun ? "unrun" : observed50?.costReduction === null || observed50 === undefined ? "inconclusive" : observed50.classification === "green-noninferior" ? "supported" : "inconclusive",
      answer: !anyRun || !observed50
        ? "Unrun."
        : `For the requested ${observed50.target}% primary arm, the price-snapshot ratio-of-sums cost reduction was ${percent(observed50.costReduction)} (95% cluster-bootstrap CI ${interval(observed50.costReductionCi95)}). ${observed50.classification === "green-noninferior" ? "This arm passed noninferiority." : "Quality preservation remains inconclusive."} Cache conditions were natural/best-effort, so this cost comparison is observational.`,
    },
    {
      number: 9,
      question: "What is the quality-preserving compression frontier?",
      status: !anyRun ? "unrun" : overallFrontier?.classification === "established" ? "supported" : "inconclusive",
      answer: !anyRun
        ? "Unrun."
        : overallFrontier?.classification === "established"
          ? `Overall frontier: requested ${overallFrontier.requestedTarget}%, measured ${percent(overallFrontier.measuredTotalTokenReduction)} total-token reduction (95% CI ${interval(overallFrontier.measuredTotalTokenReductionCi95)}). Every less-aggressive requested level also passed.`
          : "Inconclusive: no monotonic sequence of primary targets passed the noninferiority and independent-cluster power guards.",
    },
    {
      number: 10,
      question: "What claim can Iritoken honestly put in its README based solely on this benchmark evidence?",
      status: !anyRun ? "unrun" : overallFrontier?.classification === "established" ? "supported" : "not-supported",
      answer: !anyRun
        ? "No quantitative claim; the live campaign is unrun."
        : overallFrontier?.classification === "established"
          ? `On the fixed synthetic DeepSeek V4 Flash corpus, Iritoken reduced total API-reported tokens by ${percent(overallFrontier.measuredTotalTokenReduction)} at the established monotonic quality frontier (95% CI ${interval(overallFrontier.measuredTotalTokenReductionCi95)}); results do not automatically generalize beyond these workloads.`
          : "No quantitative 'without quality loss' claim is supported. The honest wording is: 'A reproducible synthetic DeepSeek V4 Flash pilot reports descriptive token and rubric outcomes; quality noninferiority is not yet established.'",
    },
  ];
  return questions;
}

function summaryRows(analysis: BenchmarkAnalysis): string[] {
  return analysis.summaries.map((summary) => `| ${summary.estimand} | ${categoryName(summary.category)} | ${summary.ablationId} | ${summary.target}% | ${summary.pairedRuns} | ${summary.independentClusters} | ${percent(summary.totalTokenReduction)} | ${interval(summary.totalTokenReductionCi95)} | ${percent(summary.inputReduction)} | ${percent(summary.outputReduction)} | ${percent(summary.costReduction)} | ${points(summary.qualityDifference.mean)} | ${interval(summary.qualityDifference.ci95, "points")} | ${summary.classification} |`);
}

function frontierRows(frontiers: readonly WorkloadFrontier[]): string[] {
  return frontiers.map((frontier) => `| ${categoryName(frontier.category)} | ${frontier.classification} | ${frontier.requestedTarget === null ? "—" : `${frontier.requestedTarget}%`} | ${percent(frontier.measuredTotalTokenReduction)} | ${interval(frontier.measuredTotalTokenReductionCi95)} | ${frontier.reason} |`);
}

export function renderMarkdown(campaign: LiveCampaignArtifact, report: BenchmarkReportArtifact): string {
  const attempts = campaign.runs.flatMap((run) => run.turns.flatMap((turn) => turn.attempts));
  const returnedModels = [...new Set(campaign.runs.flatMap((run) => run.turns.flatMap((turn) => turn.returnedModel ? [turn.returnedModel] : [])))];
  const fingerprints = [...new Set(campaign.runs.flatMap((run) => run.turns.flatMap((turn) => turn.systemFingerprint ? [turn.systemFingerprint] : [])))];
  const usage = campaign.runs.flatMap((run) => run.turns).reduce((total, turn) => ({
    input: total.input + turn.usage.inputTokens,
    output: total.output + turn.usage.outputTokens,
    cacheHit: total.cacheHit + turn.usage.cacheHitTokens,
    cacheMiss: total.cacheMiss + turn.usage.cacheMissTokens,
  }), { input: 0, output: 0, cacheHit: 0, cacheMiss: 0 });
  return [
    "# Iritoken DeepSeek V4 Flash evidence report",
    "",
    `- Campaign: \`${campaign.campaignId}\``,
    `- Corpus: \`${campaign.corpusId}\` (SHA-256 \`${campaign.corpusSha256}\`)`,
    `- Requested model: \`${campaign.config.requestedModel}\`; returned model(s): ${returnedModels.length ? returnedModels.map((item) => `\`${item}\``).join(", ") : "unrun"}`,
    `- Returned system fingerprint(s): ${fingerprints.length ? fingerprints.map((item) => `\`${item}\``).join(", ") : "not returned / unrun"}`,
    `- Campaign state: **${campaign.progress.state}**; completed pairs: ${campaign.progress.completedPairs}/${campaign.progress.plannedPairs}`,
    `- API-reported input / output tokens: ${usage.input} / ${usage.output}`,
    `- API-reported cache hit / miss input tokens: ${usage.cacheHit} / ${usage.cacheMiss}`,
    `- Price snapshot as of ${campaign.config.asOf}: hit input $${campaign.config.pricesUsdPerMillionTokens.inputCacheHit}/M, miss input $${campaign.config.pricesUsdPerMillionTokens.inputCacheMiss}/M, output $${campaign.config.pricesUsdPerMillionTokens.output}/M`,
    `- Authoritative-usage priced cost / conservative cap accounting / hard cap: $${campaign.cost.authoritativeUsageCostUsd.toFixed(8)} / $${campaign.cost.conservativeCapChargeUsd.toFixed(8)} / $${campaign.cost.hardCapUsd.toFixed(8)}`,
    `- Provider attempts / retries / errors: ${attempts.length} / ${campaign.runs.flatMap((run) => run.turns).reduce((total, turn) => total + turn.retryCount, 0)} / ${attempts.filter((attempt) => attempt.error !== null).length}`,
    `- Raw synthetic outputs retained for rescoring: ${campaign.runs.flatMap((run) => run.turns).filter((turn) => turn.rawArtifact !== null).length}`,
    "",
    "Quality here means deterministic JSON/schema parsing, TypeScript static syntax checks when applicable, hidden fact coverage, static acceptance patterns, and code-shape rules. The runner does not execute model patches, compile a generated repository, or run generated unit/integration tests; this is not full functional-correctness proof.",
    "",
    `The analysis uses ${report.analysis.bootstrap.iterations.toLocaleString("en-US")} deterministic cluster-bootstrap resamples. The key is analysis-only; the runner sends no provider seed and makes no provider determinism claim. Turns are summed within a scenario session and scenario clusters—not turns or replicates—are the independent resampling unit.`,
    "",
    "## Paired target and ablation results",
    "",
    "Ratio-of-sums reductions are primary. The machine artifact also records per-pair mean, median, standard deviation, and confidence intervals. Requested optimizer reduction and actual local optimizer reduction are separate fields; only API usage supports measured token claims.",
    "",
    "| Estimand | Workload | Treatment | Requested | Pairs | Clusters | Total reduction | Total 95% CI | Input | Output | Cost | Quality Δ | Quality Δ 95% CI | Classification |",
    "|---|---|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|---|",
    ...summaryRows(report.analysis),
    ...(report.analysis.summaries.length === 0 ? ["| unrun | overall | — | — | 0 | 0 | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unrun |"] : []),
    "",
    "## Per-workload monotonic frontier",
    "",
    "A target is frontier-eligible only if it and every less-aggressive requested primary target pass all quality and power guards.",
    "",
    "| Workload | Status | Requested target | Measured total reduction | 95% CI | Reason |",
    "|---|---|---:|---:|---|---|",
    ...frontierRows(report.analysis.frontiers),
    "",
    "## Required questions",
    "",
    ...report.requiredQuestions.map((item) => `${item.number}. **${item.question}** [${item.status}] ${item.answer}`),
    "",
    "## Limitations",
    "",
    ...report.analysis.limitations.map((item) => `- ${item}`),
    "- Natural provider caching is order-sensitive. Pair order is balanced and cache-hit/miss usage is explicit, but price-snapshot cost reductions remain observational.",
    "- Model aliases may move. Requested model, returned model, system fingerprint, config hash, errors, retries, and raw synthetic outputs are retained for audit and rescoring.",
    "",
    "## Configuration sources retained in the snapshot",
    "",
    ...campaign.config.sources.map((source) => `- [${source.kind}](${source.url}): ${source.supports.join(", ")}`),
    "",
  ].join("\n");
}

export function buildReport(campaign: LiveCampaignArtifact): BenchmarkReportArtifact {
  const analysis = analyzeCampaign(campaign);
  return {
    schemaVersion: 1,
    artifactKind: "benchmark-report",
    campaignId: campaign.campaignId,
    generatedAt: new Date().toISOString(),
    analysis,
    requiredQuestions: answerRequiredQuestions(campaign, analysis),
  };
}

function main(): void {
  const inputPath = argument("--input");
  if (!inputPath) throw new Error("--input must identify a live campaign JSON artifact");
  const absoluteInput = resolve(inputPath);
  const campaign = JSON.parse(readFileSync(absoluteInput, "utf8")) as LiveCampaignArtifact;
  if (campaign.artifactKind !== "live-campaign") throw new Error("--input is not a live campaign artifact");
  const report = buildReport(campaign);
  const defaultStem = absoluteInput.replace(/\.json$/i, "");
  const jsonPath = resolve(argument("--json-out") ?? `${defaultStem}.analysis.json`);
  const markdownPath = resolve(argument("--markdown-out") ?? `${defaultStem}.report.md`);
  atomicWriteJson(jsonPath, report);
  writeText(markdownPath, renderMarkdown(campaign, report));
  process.stdout.write(`Report wrote ${jsonPath} and ${markdownPath}.\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) main();
