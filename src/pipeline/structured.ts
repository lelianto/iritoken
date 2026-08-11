import { classifyStructured, type StructuredContentType } from "../detectors/structured-content.js";

export interface StructuredOptimizeResult {
  text: string;
  type: StructuredContentType;
  changed: boolean;
  originalCharacters: number;
  optimizedCharacters: number;
  charactersRemoved: number;
  /** True means every non-whitespace source byte remains in the same order. */
  lexicallyLossless: boolean;
}

/**
 * Remove insignificant JSON whitespace without parsing and re-serializing.
 * This preserves duplicate keys, number spellings, key order, and string bytes.
 */
function compactJsonLexically(input: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (const character of input) {
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') {
      inString = true;
      output += character;
    } else if (!/\s/u.test(character)) {
      output += character;
    }
  }
  return output;
}

export function optimizeStructured(input: string): StructuredOptimizeResult {
  const detection = classifyStructured(input);
  let text = input;
  if (detection.type === "json") {
    text = compactJsonLexically(input.trim());
  } else if (detection.type === "jsonl") {
    const trailingNewline = input.endsWith("\n");
    text = input.split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => compactJsonLexically(line.trim()))
      .join("\n") + (trailingNewline ? "\n" : "");
  }
  if (text.length > input.length) text = input;
  return {
    text,
    type: detection.type,
    changed: text !== input,
    originalCharacters: input.length,
    optimizedCharacters: text.length,
    charactersRemoved: input.length - text.length,
    lexicallyLossless: detection.type === "json" || detection.type === "jsonl",
  };
}

