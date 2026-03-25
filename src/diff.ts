/** Represents a single line difference between two tree snapshots. */
export interface DiffLine {
  type: "added" | "removed" | "changed";
  line: string;
  oldLine?: string;
}

/** Compare two sets of rendered tree lines and return the differences.
 *  Uses a simple set-based approach: lines are trimmed and compared by content.
 *  "Changed" is detected when lines share a common testID prefix but differ in details. */
export function diffLines(before: string[], after: string[]): DiffLine[] {
  const diffs: DiffLine[] = [];
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  // Build a map of testID → line for before, to detect changes
  const beforeByKey = new Map<string, string>();
  for (const line of before) {
    const key = extractKey(line);
    if (key) beforeByKey.set(key, line);
  }

  const afterByKey = new Map<string, string>();
  for (const line of after) {
    const key = extractKey(line);
    if (key) afterByKey.set(key, line);
  }

  // Removed: in before but not in after
  for (const line of before) {
    if (!afterSet.has(line)) {
      const key = extractKey(line);
      if (key && afterByKey.has(key)) {
        // Changed — same key, different content
        continue; // handled below
      }
      diffs.push({ type: "removed", line });
    }
  }

  // Added or changed: in after but not in before
  for (const line of after) {
    if (!beforeSet.has(line)) {
      const key = extractKey(line);
      if (key && beforeByKey.has(key)) {
        // Changed — same key, different content
        diffs.push({ type: "changed", line, oldLine: beforeByKey.get(key)! });
      } else {
        diffs.push({ type: "added", line });
      }
    }
  }

  return diffs;
}

/** Extract a stable key from a tree line for change detection.
 *  Uses the testID (@foo) or the first significant token. */
function extractKey(line: string): string | null {
  const trimmed = line.trim();
  // @testid lines — use the testid as key
  const match = trimmed.match(/^@([\w-]+)/);
  if (match) return `@${match[1]}`;
  return null;
}

/** Format diff lines into a human-readable string. */
export function formatDiff(diffs: DiffLine[]): string {
  if (diffs.length === 0) return "(no changes)";

  const lines: string[] = [];
  for (const diff of diffs) {
    switch (diff.type) {
      case "added":
        lines.push(`+ ${diff.line}`);
        break;
      case "removed":
        lines.push(`- ${diff.line}`);
        break;
      case "changed":
        lines.push(`~ ${diff.line}`);
        if (diff.oldLine) lines.push(`  was: ${diff.oldLine}`);
        break;
    }
  }
  return lines.join("\n");
}
