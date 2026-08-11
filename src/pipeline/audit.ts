import { createHash } from "node:crypto";
import { optimize } from "./optimize.js";
import type { OptimizeOptions, OptimizeResult } from "../types.js";

export interface OptimizationEvidence {
  schemaVersion: 1;
  mode: "apply" | "shadow";
  changed: boolean;
  originalSha256: string;
  candidateSha256: string;
  deliveredSha256: string;
  originalCharacters: number;
  candidateCharacters: number;
  deliveredCharacters: number;
  reductionPercentage: number;
}

export interface AuditedOptimizeResult extends OptimizeResult {
  candidateText: string;
  evidence: OptimizationEvidence;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Shadow mode measures a candidate but delivers the original byte-for-byte. */
export function optimizeAudited(
  input: string,
  options: OptimizeOptions & { mode?: "apply" | "shadow" } = {},
): AuditedOptimizeResult {
  const { mode = "apply", ...optimizeOptions } = options;
  const candidate = optimize(input, optimizeOptions);
  const delivered = mode === "shadow" ? input : candidate.text;
  return {
    text: delivered,
    candidateText: candidate.text,
    stats: candidate.stats,
    evidence: {
      schemaVersion: 1,
      mode,
      changed: candidate.text !== input,
      originalSha256: sha256(input),
      candidateSha256: sha256(candidate.text),
      deliveredSha256: sha256(delivered),
      originalCharacters: input.length,
      candidateCharacters: candidate.text.length,
      deliveredCharacters: delivered.length,
      reductionPercentage: candidate.stats.reductionPercentage,
    },
  };
}

