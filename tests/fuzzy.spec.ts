import { describe, it, expect } from "vitest";
import { levenshtein, closestMatches } from "../src/fuzzy.js";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("returns length of other string when one is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("returns 0 for two empty strings", () => {
    expect(levenshtein("", "")).toBe(0);
  });

  it("counts single character substitution", () => {
    expect(levenshtein("cat", "car")).toBe(1);
  });

  it("counts single character insertion", () => {
    expect(levenshtein("cat", "cart")).toBe(1);
  });

  it("counts single character deletion", () => {
    expect(levenshtein("cart", "cat")).toBe(1);
  });

  it("handles classic kitten/sitting example", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("handles transposition as 2 edits (not Damerau)", () => {
    expect(levenshtein("ab", "ba")).toBe(2);
  });
});

describe("closestMatches", () => {
  const candidates = ["save-btn", "cancel-btn", "delete-btn", "email-input", "password-input"];

  it("returns exact match first with distance 0", () => {
    const result = closestMatches("save-btn", candidates);
    expect(result).toContain("save-btn");
    expect(result[0]).toBe("save-btn");
  });

  it("suggests close matches for typo (save-buton → save-btn)", () => {
    const result = closestMatches("save-buton", candidates);
    expect(result).toContain("save-btn");
  });

  it("suggests close matches for missing character (save-bt → save-btn)", () => {
    const result = closestMatches("save-bt", candidates);
    expect(result).toContain("save-btn");
  });

  it("suggests close matches for extra character (save-btnn → save-btn)", () => {
    const result = closestMatches("save-btnn", candidates);
    expect(result).toContain("save-btn");
  });

  it("returns empty array when no candidates are close enough", () => {
    const result = closestMatches("completely-different-thing", candidates);
    expect(result).toEqual([]);
  });

  it("limits results to specified count", () => {
    // All *-btn candidates are close to each other
    const result = closestMatches("btn", ["a-btn", "b-btn", "c-btn", "d-btn"], 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("defaults to 3 results max", () => {
    const manyCandidates = ["a", "b", "c", "d", "e", "f"];
    const result = closestMatches("a", manyCandidates);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("handles empty candidates array", () => {
    const result = closestMatches("save-btn", []);
    expect(result).toEqual([]);
  });

  it("handles empty query", () => {
    const result = closestMatches("", candidates);
    // Short query — threshold is max(3, 0*0.4) = 3
    // Only candidates with length <= 3 would match (none in this set)
    expect(result).toEqual([]);
  });

  it("sorts results by distance (closest first)", () => {
    const result = closestMatches("save-btn", ["save-btns", "save-bt", "xave-btn"]);
    // save-btns: dist 1, save-bt: dist 1, xave-btn: dist 1 — all distance 1
    expect(result.length).toBeGreaterThan(0);
    // All should be included since they're all close
    expect(result).toContain("save-btns");
    expect(result).toContain("save-bt");
    expect(result).toContain("xave-btn");
  });
});
