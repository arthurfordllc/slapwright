/** Format milliseconds to "X.Ys" with one decimal place */
export function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Success output: ✓ message (duration) */
export function ok(message: string, durationMs?: number): string {
  if (durationMs !== undefined) {
    return `✓ ${message} (${formatDuration(durationMs)})`;
  }
  return `✓ ${message}`;
}

/** Failure output: ✗ message, with optional indented context lines */
export function fail(message: string, context?: string[]): string {
  let out = `✗ ${message}`;
  if (context) {
    for (const line of context) {
      out += `\n  ${line}`;
    }
  }
  return out;
}

/** Info output: ℹ message */
export function info(message: string): string {
  return `ℹ ${message}`;
}
