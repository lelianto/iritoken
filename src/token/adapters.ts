import type { TokenCounter } from "../types.js";

/** Structural type supported by tokenizers such as tiktoken-compatible encoders. */
export interface EncoderLike {
  encode(text: string): ArrayLike<unknown>;
}

/** Structural type supported by tokenizers exposing a tokenize method. */
export interface TokenizerLike {
  tokenize(text: string): ArrayLike<unknown>;
}

export function fromEncoder(encoder: EncoderLike): TokenCounter {
  return { count: (text) => encoder.encode(text).length };
}

export function fromTokenizer(tokenizer: TokenizerLike): TokenCounter {
  return { count: (text) => tokenizer.tokenize(text).length };
}
