export type StructuredContentType = "json" | "jsonl" | "text";

export interface StructuredDetection {
  type: StructuredContentType;
  confidence: "high" | "low";
}

function isJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/** Detect formats for which iritoken can make byte-preserving structural edits. */
export function classifyStructured(input: string): StructuredDetection {
  const trimmed = input.trim();
  if (trimmed && (trimmed.startsWith("{") || trimmed.startsWith("[")) && isJson(trimmed)) {
    return { type: "json", confidence: "high" };
  }

  const lines = input.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length >= 2 && lines.every((line) => isJson(line))) {
    return { type: "jsonl", confidence: "high" };
  }
  return { type: "text", confidence: "low" };
}

