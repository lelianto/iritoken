import type { Cleaner, CleanerResult, ContentDetection } from "../types.js";

const MAX_BLOCK_LINES = 8;

/** Aggressive-only compaction for immediately repeated, identical multiline blocks. */
export class RepeatedBlocksCleaner implements Cleaner {
  readonly id = "repeated-blocks";
  readonly description = "Collapse consecutive identical multiline blocks";

  clean(text: string, detection: ContentDetection): CleanerResult {
    if (detection.type !== "generic-terminal-output") {
      return { text, changes: [], confidence: "low" };
    }
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const trailingNewline = text.endsWith(eol);
    const lines = text.split(eol);
    if (trailingNewline) lines.pop();
    const output: string[] = [];
    let groups = 0;

    for (let index = 0; index < lines.length;) {
      let match: { size: number; repeats: number } | undefined;
      const maxSize = Math.min(MAX_BLOCK_LINES, Math.floor((lines.length - index) / 3));
      for (let size = maxSize; size >= 2; size--) {
        const block = lines.slice(index, index + size);
        if (block.some((line) => line.trim() === "" || /\[(?:block )?repeated \d+ times\]/.test(line))) continue;
        let repeats = 1;
        while (
          index + (repeats + 1) * size <= lines.length &&
          block.every((line, offset) => line === lines[index + repeats * size + offset])
        ) repeats += 1;
        if (repeats >= 3) {
          match = { size, repeats };
          break;
        }
      }
      if (!match) {
        output.push(lines[index] ?? "");
        index += 1;
        continue;
      }
      const block = lines.slice(index, index + match.size);
      const candidate = [...block, `[block repeated ${match.repeats} times]`];
      const originalSegment = lines.slice(index, index + match.size * match.repeats).join(eol);
      if (candidate.join(eol).length >= originalSegment.length) {
        output.push(...lines.slice(index, index + match.size * match.repeats));
      } else {
        output.push(...candidate);
        groups += 1;
      }
      index += match.size * match.repeats;
    }

    const optimized = output.join(eol) + (trailingNewline ? eol : "");
    return {
      text: optimized,
      changes: groups === 0 ? [] : [{ name: this.id, count: groups, description: this.description }],
      confidence: groups === 0 ? "low" : "medium",
    };
  }
}
