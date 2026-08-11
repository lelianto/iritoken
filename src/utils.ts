/** Percentage rounded to one decimal place. Returns 0 when total is 0. */
export function percentage(reduced: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((reduced / total) * 1000) / 10;
}

/** Namespace for operation ids shared between the pipeline and the CLI report. */
export const OPERATIONS = {
  ansi: "ansi",
  whitespace: "whitespace",
  duplicateLines: "duplicate-lines",
  stackTrace: "stack-trace",
  testOutput: "test-output",
} as const;

export type OperationId = (typeof OPERATIONS)[keyof typeof OPERATIONS];