import { describe, it, expect } from "vitest";
import { diffLines, formatDiff, type DiffLine } from "../src/diff.js";

describe("diffLines", () => {
  it("returns empty array for identical inputs", () => {
    const lines = ["@save-btn button", "@cancel-btn button"];
    expect(diffLines(lines, lines)).toEqual([]);
  });

  it("detects added lines", () => {
    const before = ["@save-btn button"];
    const after = ["@save-btn button", "@toast \"Saved!\""];
    const result = diffLines(before, after);
    expect(result).toContainEqual({ type: "added", line: "@toast \"Saved!\"" });
  });

  it("detects removed lines", () => {
    const before = ["@spinner loading", "@save-btn button"];
    const after = ["@save-btn button"];
    const result = diffLines(before, after);
    expect(result).toContainEqual({ type: "removed", line: "@spinner loading" });
  });

  it("detects changed lines", () => {
    const before = ["@save-btn button"];
    const after = ["@save-btn button (disabled)"];
    const result = diffLines(before, after);
    expect(result).toContainEqual({
      type: "changed",
      line: "@save-btn button (disabled)",
      oldLine: "@save-btn button",
    });
  });

  it("handles both additions and removals", () => {
    const before = ["@loading spinner", "@form"];
    const after = ["@form", "@success-toast \"Done!\""];
    const result = diffLines(before, after);
    const types = result.map((d) => d.type);
    expect(types).toContain("added");
    expect(types).toContain("removed");
  });

  it("handles empty before (all added)", () => {
    const result = diffLines([], ["@save-btn button", "@cancel-btn button"]);
    expect(result.length).toBe(2);
    expect(result.every((d) => d.type === "added")).toBe(true);
  });

  it("handles empty after (all removed)", () => {
    const result = diffLines(["@save-btn button", "@cancel-btn button"], []);
    expect(result.length).toBe(2);
    expect(result.every((d) => d.type === "removed")).toBe(true);
  });

  it("handles both empty (no diff)", () => {
    expect(diffLines([], [])).toEqual([]);
  });
});

describe("formatDiff", () => {
  it("formats added lines with + prefix", () => {
    const diffs: DiffLine[] = [{ type: "added", line: "@toast \"Saved!\"" }];
    const result = formatDiff(diffs);
    expect(result).toContain("+ @toast \"Saved!\"");
  });

  it("formats removed lines with - prefix", () => {
    const diffs: DiffLine[] = [{ type: "removed", line: "@spinner loading" }];
    const result = formatDiff(diffs);
    expect(result).toContain("- @spinner loading");
  });

  it("formats changed lines with ~ prefix and shows old value", () => {
    const diffs: DiffLine[] = [{
      type: "changed",
      line: "@save-btn button (disabled)",
      oldLine: "@save-btn button",
    }];
    const result = formatDiff(diffs);
    expect(result).toContain("~ @save-btn button (disabled)");
    expect(result).toContain("was: @save-btn button");
  });

  it("returns 'no changes' for empty diff", () => {
    const result = formatDiff([]);
    expect(result).toContain("no changes");
  });

  it("formats multiple diff lines", () => {
    const diffs: DiffLine[] = [
      { type: "removed", line: "@loading spinner" },
      { type: "added", line: "@success-toast \"Done!\"" },
      { type: "changed", line: "@save-btn button (disabled)", oldLine: "@save-btn button" },
    ];
    const result = formatDiff(diffs);
    expect(result).toContain("- @loading spinner");
    expect(result).toContain("+ @success-toast \"Done!\"");
    expect(result).toContain("~ @save-btn button (disabled)");
  });
});
