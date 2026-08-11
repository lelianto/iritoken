/** Importance is an ordering policy, not a probability of semantic relevance. */
export type ContextImportance =
  | "MUST_KEEP"
  | "IMPORTANT"
  | "COMPRESSIBLE"
  | "OPTIONAL"
  | "REDUNDANT";

export type ContextUnitKind =
  | "system-instruction"
  | "user-requirement"
  | "acceptance-criteria"
  | "security-requirement"
  | "query"
  | "error"
  | "function-signature"
  | "type-definition"
  | "referenced-code"
  | "source-code"
  | "configuration"
  | "tool-output"
  | "conversation"
  | "documentation"
  | "repository-metadata"
  | "unknown";

export type ContextMetadataValue = string | number | boolean;

/** A caller-provided, independently selectable piece of model context. */
export interface ContextUnit {
  id: string;
  content: string;
  kind?: ContextUnitKind;
  importance?: ContextImportance;
  role?: string;
  path?: string;
  language?: string;
  dependencies?: readonly string[];
  /** Explicit retention requirement. This always overrides lower importance. */
  required?: boolean;
  /** Directly referenced by the current request. This always implies MUST_KEEP. */
  referenced?: boolean;
  /** Ordinal sequence position, normally used for conversation history. */
  ordinal?: number;
  metadata?: Readonly<Record<string, ContextMetadataValue>>;
}

export interface ClassifiedContextUnit extends ContextUnit {
  importance: ContextImportance;
  classificationReasons: string[];
}

const MUST_KEEP_KINDS = new Set<ContextUnitKind>([
  "system-instruction",
  "user-requirement",
  "acceptance-criteria",
  "security-requirement",
  "query",
  "error",
  "function-signature",
  "referenced-code",
]);

const IMPORTANT_KINDS = new Set<ContextUnitKind>([
  "type-definition",
  "source-code",
  "configuration",
]);

const COMPRESSIBLE_KINDS = new Set<ContextUnitKind>([
  "tool-output",
  "conversation",
  "documentation",
]);

/**
 * Classify one unit using declared provenance and conservative deterministic
 * rules. No score returned by this function is presented as semantic certainty.
 */
export function classifyContextUnit(unit: ContextUnit): ClassifiedContextUnit {
  const reasons: string[] = [];
  let importance: ContextImportance;

  if (unit.required) {
    importance = "MUST_KEEP";
    reasons.push("explicitly-required");
  } else if (unit.referenced) {
    importance = "MUST_KEEP";
    reasons.push("directly-referenced");
  } else if (unit.role === "system") {
    importance = "MUST_KEEP";
    reasons.push("system-role");
  } else if (unit.kind && MUST_KEEP_KINDS.has(unit.kind)) {
    importance = "MUST_KEEP";
    reasons.push(`critical-kind:${unit.kind}`);
  } else if (unit.importance !== undefined) {
    importance = unit.importance;
    reasons.push(`caller-importance:${unit.importance}`);
  } else if (unit.content.length === 0) {
    importance = "REDUNDANT";
    reasons.push("empty-content");
  } else if (unit.kind && IMPORTANT_KINDS.has(unit.kind)) {
    importance = "IMPORTANT";
    reasons.push(`important-kind:${unit.kind}`);
  } else if (unit.kind && COMPRESSIBLE_KINDS.has(unit.kind)) {
    importance = "COMPRESSIBLE";
    reasons.push(`compressible-kind:${unit.kind}`);
  } else if (unit.kind === "repository-metadata") {
    importance = "OPTIONAL";
    reasons.push("optional-repository-metadata");
  } else {
    importance = "IMPORTANT";
    reasons.push("conservative-unknown");
  }

  return {
    ...unit,
    dependencies: unit.dependencies ? [...unit.dependencies] : undefined,
    metadata: unit.metadata ? { ...unit.metadata } : undefined,
    importance,
    classificationReasons: reasons,
  };
}

export function classifyContextUnits(
  units: readonly ContextUnit[],
): ClassifiedContextUnit[] {
  return units.map((unit) => classifyContextUnit(unit));
}
