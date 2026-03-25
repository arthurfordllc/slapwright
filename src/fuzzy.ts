/** Classic Levenshtein distance — minimum edits (insert, delete, substitute) to transform a into b. */
export function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use single-row DP for O(min(m,n)) space
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

/** Return up to `limit` candidates within threshold distance of query, sorted by distance. */
export function closestMatches(
  query: string,
  candidates: string[],
  limit = 3,
): string[] {
  if (candidates.length === 0 || query.length === 0) return [];

  const threshold = Math.max(3, Math.floor(query.length * 0.4));

  const scored = candidates
    .map((c) => ({ candidate: c, dist: levenshtein(query, c) }))
    .filter((s) => s.dist <= threshold)
    .sort((a, b) => a.dist - b.dist);

  return scored.slice(0, limit).map((s) => s.candidate);
}
