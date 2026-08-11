import { performance } from "node:perf_hooks";
import { optimize } from "../pipeline/optimize.js";
import type { OptimizeOptions } from "../types.js";

export interface QualityCase<T> {
  id: string;
  context: string;
  run(context: string): T | Promise<T>;
  score(result: T): number;
}

export interface QualityGateOptions {
  optimize?: OptimizeOptions;
  minimumReductionPercentage?: number;
  maximumMeanQualityRegression?: number;
  maximumCaseQualityRegression?: number;
}

export interface QualityCaseResult {
  id: string;
  originalScore: number;
  optimizedScore: number;
  qualityDelta: number;
  reductionPercentage: number;
}

export interface QualityGateResult {
  passed: boolean;
  failures: string[];
  cases: QualityCaseResult[];
  meanOriginalScore: number;
  meanOptimizedScore: number;
  meanQualityDelta: number;
  aggregateReductionPercentage: number;
  elapsedMilliseconds: number;
}

/** Replay paired original/optimized cases. Runners are deliberately provider-agnostic. */
export async function evaluateQualityGate<T>(
  cases: readonly QualityCase<T>[],
  options: QualityGateOptions = {},
): Promise<QualityGateResult> {
  if (cases.length === 0) throw new RangeError("quality gate requires at least one case");
  const minimumReduction = options.minimumReductionPercentage ?? 0;
  const maximumMeanRegression = options.maximumMeanQualityRegression ?? 0;
  const maximumCaseRegression = options.maximumCaseQualityRegression ?? maximumMeanRegression;
  if (!Number.isFinite(minimumReduction) || minimumReduction < 0 || minimumReduction > 100) {
    throw new RangeError("minimumReductionPercentage must be between 0 and 100");
  }
  if (!Number.isFinite(maximumMeanRegression) || maximumMeanRegression < 0) {
    throw new RangeError("maximumMeanQualityRegression must be non-negative");
  }
  if (!Number.isFinite(maximumCaseRegression) || maximumCaseRegression < 0) {
    throw new RangeError("maximumCaseQualityRegression must be non-negative");
  }
  const started = performance.now();
  const results: QualityCaseResult[] = [];
  let originalCharacters = 0;
  let optimizedCharacters = 0;

  for (const testCase of cases) {
    const candidate = optimize(testCase.context, options.optimize);
    const originalScore = testCase.score(await testCase.run(testCase.context));
    const optimizedScore = testCase.score(await testCase.run(candidate.text));
    if (!Number.isFinite(originalScore) || !Number.isFinite(optimizedScore)) {
      throw new TypeError(`quality case ${testCase.id} returned a non-finite score`);
    }
    originalCharacters += testCase.context.length;
    optimizedCharacters += candidate.text.length;
    results.push({
      id: testCase.id,
      originalScore,
      optimizedScore,
      qualityDelta: optimizedScore - originalScore,
      reductionPercentage: candidate.stats.reductionPercentage,
    });
  }

  const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
  const meanOriginalScore = mean(results.map((result) => result.originalScore));
  const meanOptimizedScore = mean(results.map((result) => result.optimizedScore));
  const meanQualityDelta = meanOptimizedScore - meanOriginalScore;
  const aggregateReductionPercentage = originalCharacters === 0 ? 0
    : ((originalCharacters - optimizedCharacters) / originalCharacters) * 100;
  const failures: string[] = [];
  if (aggregateReductionPercentage < minimumReduction) {
    failures.push(`reduction ${aggregateReductionPercentage.toFixed(2)}% is below ${minimumReduction}%`);
  }
  if (meanQualityDelta < -maximumMeanRegression) {
    failures.push(`mean quality delta ${meanQualityDelta.toFixed(4)} exceeds allowed regression ${maximumMeanRegression}`);
  }
  for (const result of results) {
    if (result.qualityDelta < -maximumCaseRegression) {
      failures.push(`case ${result.id} quality delta ${result.qualityDelta.toFixed(4)} exceeds allowed regression ${maximumCaseRegression}`);
    }
  }
  return {
    passed: failures.length === 0,
    failures,
    cases: results,
    meanOriginalScore,
    meanOptimizedScore,
    meanQualityDelta,
    aggregateReductionPercentage,
    elapsedMilliseconds: performance.now() - started,
  };
}
