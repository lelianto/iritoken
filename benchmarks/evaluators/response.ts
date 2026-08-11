import type {
  AcceptanceCheckResult,
  HiddenFact,
  HiddenRubric,
  ParsedModelResponse,
  TurnQualityScore,
} from "../types.js";
import ts from "typescript";

export interface FactCoverageResult {
  found: number;
  required: number;
  coverage: number;
  foundIds: string[];
  missingIds: string[];
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function includesAlternative(haystack: string, alternative: string): boolean {
  const normalizedNeedle = normalized(alternative);
  if (normalizedNeedle === "") return false;
  return ` ${haystack} `.includes(` ${normalizedNeedle} `);
}

export function scoreFactCoverage(text: string, facts: readonly HiddenFact[]): FactCoverageResult {
  const haystack = normalized(text);
  const foundIds: string[] = [];
  const missingIds: string[] = [];
  for (const fact of facts) {
    if (fact.alternatives.some((alternative) => includesAlternative(haystack, alternative))) foundIds.push(fact.id);
    else missingIds.push(fact.id);
  }
  return {
    found: foundIds.length,
    required: facts.length,
    coverage: facts.length === 0 ? 1 : foundIds.length / facts.length,
    foundIds,
    missingIds,
  };
}

function candidateJson(raw: string): { value: unknown; direct: boolean; error?: string } {
  try {
    return { value: JSON.parse(raw), direct: true };
  } catch (directError) {
    const trimmed = raw.trim();
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)?.[1];
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    const extracted = fenced ?? (firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : null);
    if (extracted !== null) {
      try {
        return { value: JSON.parse(extracted), direct: false, error: "Response contained recoverable text outside the JSON object." };
      } catch {
        // Return the original parse error below without executing or evaluating the text.
      }
    }
    return { value: null, direct: false, error: directError instanceof Error ? directError.message : String(directError) };
  }
}

/** Parse data only. This function never executes, imports, compiles, or evaluates model output. */
export function parseModelResponse(raw: string): ParsedModelResponse {
  const candidate = candidateJson(raw);
  if (!candidate.value || typeof candidate.value !== "object" || Array.isArray(candidate.value)) {
    return { validJson: false, answer: "", patch: "", evidence: [], parseError: candidate.error ?? "Response is not a JSON object." };
  }
  const record = candidate.value as Record<string, unknown>;
  const answer = typeof record.answer === "string" ? record.answer : "";
  const patch = typeof record.patch === "string" ? record.patch : "";
  const evidence = Array.isArray(record.evidence) && record.evidence.every((item) => typeof item === "string")
    ? record.evidence as string[]
    : [];
  const keys = Object.keys(record).sort();
  const exactKeys = keys.length === 3 && keys[0] === "answer" && keys[1] === "evidence" && keys[2] === "patch";
  const schemaValid = typeof record.answer === "string" && typeof record.patch === "string"
    && Array.isArray(record.evidence) && record.evidence.every((item) => typeof item === "string")
    && exactKeys;
  const validJson = candidate.direct && schemaValid;
  const parseError = validJson
    ? undefined
    : candidate.error ?? "JSON object does not match the exact answer/patch/evidence schema.";
  return { validJson, answer, patch, evidence, parseError };
}

function targetText(parsed: ParsedModelResponse, target: "answer" | "patch" | "evidence" | "combined"): string {
  if (target === "answer") return parsed.answer;
  if (target === "patch") return parsed.patch;
  if (target === "evidence") return parsed.evidence.join("\n");
  return [parsed.answer, parsed.patch, ...parsed.evidence].join("\n");
}

function safeRegex(pattern: string, flags = ""): RegExp | null {
  try {
    return new RegExp(pattern, flags.replace(/[gy]/g, ""));
  } catch {
    return null;
  }
}

function scoreAcceptance(parsed: ParsedModelResponse, rubric: HiddenRubric): AcceptanceCheckResult[] {
  return rubric.acceptance.map((check) => {
    const text = targetText(parsed, check.target);
    const expression = check.kind === "regex" ? safeRegex(check.value, check.flags) : null;
    const passed = check.kind === "contains"
      ? includesAlternative(normalized(text), check.value)
      : expression?.test(text) ?? false;
    return {
      id: check.id,
      passed,
      critical: check.critical ?? false,
      description: check.description,
    };
  });
}

function scoreCodeShape(patch: string, rubric: HiddenRubric): { passed: boolean; failures: string[] } {
  const shape = rubric.codeShape;
  if (!shape) return { passed: true, failures: [] };
  const failures: string[] = [];
  for (const pattern of shape.requiredPatterns ?? []) {
    const expression = safeRegex(pattern, "i");
    if (!expression?.test(patch)) failures.push(`missing required patch pattern: ${pattern}`);
  }
  for (const pattern of shape.forbiddenPatterns ?? []) {
    const expression = safeRegex(pattern, "i");
    if (!expression || expression.test(patch)) failures.push(`matched forbidden patch pattern: ${pattern}`);
  }
  const lines = patch === "" ? 0 : patch.split(/\r?\n/).length;
  if (shape.minimumPatchLines !== undefined && lines < shape.minimumPatchLines) {
    failures.push(`patch has ${lines} lines; minimum is ${shape.minimumPatchLines}`);
  }
  if (shape.maximumPatchLines !== undefined && lines > shape.maximumPatchLines) {
    failures.push(`patch has ${lines} lines; maximum is ${shape.maximumPatchLines}`);
  }
  return { passed: failures.length === 0, failures };
}

function typescriptSyntax(patch: string): { checked: boolean; valid: boolean; diagnostics: string[] } {
  const marker = /^\/\/ FILE:\s*(\S+)\s*$/gm;
  const matches = [...patch.matchAll(marker)];
  const files: Array<{ path: string; source: string }> = [];
  if (matches.length === 0) files.push({ path: "response.ts", source: patch });
  else {
    for (const [index, match] of matches.entries()) {
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[index + 1]?.index ?? patch.length;
      files.push({ path: match[1] ?? `response-${index}.ts`, source: patch.slice(start, end) });
    }
  }
  const diagnostics: string[] = [];
  for (const file of files) {
    const result = ts.transpileModule(file.source, {
      fileName: file.path,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    });
    for (const diagnostic of result.diagnostics ?? []) {
      if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
      diagnostics.push(`${file.path}: TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
    }
  }
  return { checked: true, valid: diagnostics.length === 0, diagnostics };
}

export function scoreTurnResponse(raw: string, rubric: HiddenRubric): {
  parsed: ParsedModelResponse;
  quality: TurnQualityScore;
} {
  const parsed = parseModelResponse(raw);
  const combined = [parsed.answer, parsed.patch, ...parsed.evidence].join("\n");
  const facts = scoreFactCoverage(combined, rubric.facts);
  const criticalFacts = scoreFactCoverage(combined, rubric.facts.filter((fact) => fact.critical));
  const forbiddenFacts = scoreFactCoverage(combined, rubric.forbiddenFacts ?? []);
  const checks = scoreAcceptance(parsed, rubric);
  const acceptancePassed = checks.filter((check) => check.passed).length;
  const codeShape = scoreCodeShape(parsed.patch, rubric);
  const syntax = rubric.codeShape ? typescriptSyntax(parsed.patch) : { checked: false, valid: true, diagnostics: [] };
  const quality: TurnQualityScore = {
    validJson: parsed.validJson,
    factsFound: facts.found,
    factsRequired: facts.required,
    factCoverage: facts.coverage,
    criticalFactsFound: criticalFacts.found,
    criticalFactsRequired: criticalFacts.required,
    criticalCoverage: criticalFacts.coverage,
    forbiddenFactsFound: forbiddenFacts.foundIds,
    acceptancePassed,
    acceptanceRequired: checks.length,
    acceptanceCoverage: checks.length === 0 ? 1 : acceptancePassed / checks.length,
    codeShapePassed: codeShape.passed,
    syntaxChecked: syntax.checked,
    syntaxValid: syntax.valid,
    syntaxDiagnostics: syntax.diagnostics,
    taskSuccess: parsed.validJson
      && facts.coverage === 1
      && criticalFacts.coverage === 1
      && forbiddenFacts.found === 0
      && acceptancePassed === checks.length
      && codeShape.passed
      && syntax.valid,
    checks,
    codeShapeFailures: codeShape.failures,
  };
  return { parsed, quality };
}
