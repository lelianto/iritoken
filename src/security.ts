/** Default ceiling for untrusted text processed by the library (16 Mi chars). */
export const DEFAULT_MAX_INPUT_CHARACTERS = 16 * 1024 * 1024;

/** Default ceiling for files/stdin accepted by the CLI (16 MiB). */
export const DEFAULT_MAX_INPUT_BYTES = 16 * 1024 * 1024;

export class InputLimitError extends RangeError {
  readonly code = "ERR_IRITOKEN_INPUT_TOO_LARGE";

  constructor(actual: number, maximum: number, unit: "characters" | "bytes") {
    super(`input is too large (${actual} ${unit}); maximum is ${maximum} ${unit}`);
    this.name = "InputLimitError";
  }
}

export function assertInputWithinLimit(text: string, maximum: number): void {
  if (!Number.isSafeInteger(maximum) || maximum < 0) {
    throw new RangeError("maxInputCharacters must be a non-negative safe integer");
  }
  if (text.length > maximum) {
    throw new InputLimitError(text.length, maximum, "characters");
  }
}

/** Keep attacker-controlled terminal control bytes out of diagnostics. */
export function safeDiagnostic(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return message.replace(/[\x00-\x1f\x7f-\x9f]/g, "?");
}
