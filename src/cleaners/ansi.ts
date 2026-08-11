import type { Cleaner, CleanerResult, ContentDetection } from "../types.js";

/**
 * Removes ANSI escape sequences used for terminal formatting (colors,
 * bold, cursor positioning, OSC title sequences, etc.) without altering
 * the underlying text characters.
 *
 * Rules:
 * - Strip CSI, OSC, DCS, SOS, PM, APC, C1, and other ESC sequences.
 * - Never reorder or modify characters outside control sequences.
 * - Consume incomplete sequences through end-of-input so they cannot be
 *   completed by subsequently concatenated terminal output.
 */

const ESC = 0x1b;
const BEL = 0x07;
const ST = 0x9c;
const CSI = 0x9b;
const DCS = 0x90;
const SOS = 0x98;
const OSC = 0x9d;
const PM = 0x9e;
const APC = 0x9f;

function consumeCsi(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    index += 1;
    if (code >= 0x40 && code <= 0x7e) break;
  }
  return index;
}

function consumeEscape(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    index += 1;
    if (code >= 0x30 && code <= 0x7e) break;
    if (code < 0x20 || code > 0x2f) break;
  }
  return index;
}

function consumeControlString(text: string, start: number, bellTerminates: boolean): number {
  let index = start;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if ((bellTerminates && code === BEL) || code === ST) return index + 1;
    if (code === ESC && text.charCodeAt(index + 1) === 0x5c) return index + 2;
    index += 1;
  }
  return index;
}

export function stripAnsi(text: string): { text: string; count: number } {
  const parts: string[] = [];
  let count = 0;
  let plainStart = 0;
  let index = 0;

  while (index < text.length) {
    const code = text.charCodeAt(index);
    let end = index;

    if (code === ESC) {
      const next = text.charCodeAt(index + 1);
      if (next === 0x5b) end = consumeCsi(text, index + 2);
      else if (next === 0x5d) end = consumeControlString(text, index + 2, true);
      else if (next === 0x50 || next === 0x58 || next === 0x5e || next === 0x5f) {
        end = consumeControlString(text, index + 2, false);
      } else {
        end = consumeEscape(text, index + 1);
      }
    } else if (code === CSI) {
      end = consumeCsi(text, index + 1);
    } else if (code === OSC) {
      end = consumeControlString(text, index + 1, true);
    } else if (code === DCS || code === SOS || code === PM || code === APC) {
      end = consumeControlString(text, index + 1, false);
    } else if (code >= 0x80 && code <= 0x9f) {
      end = index + 1;
    }

    if (end === index) {
      index += 1;
      continue;
    }
    if (plainStart < index) parts.push(text.slice(plainStart, index));
    count += 1;
    index = end;
    plainStart = end;
  }

  if (plainStart < text.length) parts.push(text.slice(plainStart));
  return { text: count === 0 ? text : parts.join(""), count };
}

export class AnsiCleaner implements Cleaner {
  readonly id = "ansi";
  readonly description = "Remove ANSI escape sequences";

  clean(text: string, _detection: ContentDetection): CleanerResult {
    const { text: out, count } = stripAnsi(text);
    return {
      text: out,
      changes:
        count > 0
          ? [{ name: this.id, count, description: this.description }]
          : [],
      confidence: count > 0 ? "high" : "high",
    };
  }
}
