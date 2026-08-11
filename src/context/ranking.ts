export interface RankableContext<T = unknown> {
  id: string;
  text: string;
  priority?: number;
  timestamp?: number;
  value?: T;
}

export interface RankedContext<T = unknown> extends RankableContext<T> {
  score: number;
  signals: { lexical: number; priority: number; recency: number };
}

function terms(text: string): Set<string> {
  return new Set(text.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}_./:-]+/gu) ?? []);
}

/** Explainable lexical/priority/recency ranking with stable tie-breaking. */
export function rankContext<T>(
  query: string,
  candidates: readonly RankableContext<T>[],
  options: { now?: number; recencyHalfLifeMilliseconds?: number; maxCandidates?: number; maxTotalCharacters?: number } = {},
): RankedContext<T>[] {
  const maximumCandidates = options.maxCandidates ?? 10_000;
  const maximumCharacters = options.maxTotalCharacters ?? 16 * 1024 * 1024;
  if (!Number.isSafeInteger(maximumCandidates) || maximumCandidates < 1) throw new RangeError("maxCandidates must be a positive safe integer");
  if (!Number.isSafeInteger(maximumCharacters) || maximumCharacters < 0) throw new RangeError("maxTotalCharacters must be a non-negative safe integer");
  if (candidates.length > maximumCandidates) throw new RangeError(`candidate count exceeds maximum ${maximumCandidates}`);
  let characters = query.length;
  for (const candidate of candidates) {
    characters += candidate.text.length;
    if (!Number.isSafeInteger(characters) || characters > maximumCharacters) throw new RangeError(`ranking text exceeds maximum ${maximumCharacters} characters`);
  }
  const queryTerms = terms(query);
  const queryTermList = [...queryTerms];
  const now = options.now ?? Date.now();
  const halfLife = options.recencyHalfLifeMilliseconds ?? 60 * 60_000;
  if (!Number.isFinite(halfLife) || halfLife <= 0) throw new RangeError("recencyHalfLifeMilliseconds must be positive");
  return candidates.map((candidate, index) => {
    const candidateTerms = terms(candidate.text);
    const overlap = queryTermList.filter((term) => candidateTerms.has(term)).length;
    const lexical = queryTerms.size === 0 ? 0 : overlap / queryTerms.size;
    const priority = Math.max(0, Math.min(1, candidate.priority ?? 0));
    const age = candidate.timestamp === undefined ? Number.POSITIVE_INFINITY : Math.max(0, now - candidate.timestamp);
    const recency = Number.isFinite(age) ? 2 ** (-age / halfLife) : 0;
    return { ...candidate, score: lexical * 0.7 + priority * 0.2 + recency * 0.1, signals: { lexical, priority, recency }, index };
  }).sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ index: _index, ...candidate }) => candidate);
}
