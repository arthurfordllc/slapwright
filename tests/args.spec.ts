import { describe, it, expect } from "vitest";
import { parseTextAndTimeout, parseFlags } from "../src/args.js";

describe("parseTextAndTimeout", () => {
  it("returns single word as text with no timeout", () => {
    expect(parseTextAndTimeout(["Save"])).toEqual({ text: "Save" });
  });

  it("joins multi-word args as text with no timeout", () => {
    expect(parseTextAndTimeout(["Log", "In"])).toEqual({ text: "Log In" });
  });

  it("extracts trailing integer as timeout from multi-word args", () => {
    expect(parseTextAndTimeout(["Log", "In", "5000"])).toEqual({
      text: "Log In",
      timeout: 5000,
    });
  });

  it("extracts trailing integer as timeout from single-word + timeout", () => {
    expect(parseTextAndTimeout(["Save", "3000"])).toEqual({
      text: "Save",
      timeout: 3000,
    });
  });

  it("treats a single numeric arg as text, not timeout", () => {
    // Edge case: user searches for a number
    expect(parseTextAndTimeout(["12345"])).toEqual({ text: "12345" });
  });

  it("does not treat non-integer trailing arg as timeout", () => {
    expect(parseTextAndTimeout(["Hello", "World"])).toEqual({ text: "Hello World" });
  });

  it("does not treat float as timeout", () => {
    expect(parseTextAndTimeout(["Save", "3.5"])).toEqual({ text: "Save 3.5" });
  });

  it("returns empty text for empty args", () => {
    expect(parseTextAndTimeout([])).toEqual({ text: "" });
  });
});

describe("parseFlags", () => {
  it("extracts boolean flags", () => {
    const result = parseFlags(["--interactive", "save-btn"], ["interactive", "diff"]);
    expect(result.flags).toEqual({ interactive: true });
    expect(result.positional).toEqual(["save-btn"]);
  });

  it("extracts flags with values (next arg)", () => {
    const result = parseFlags(["--section", "main", "save-btn"], ["section", "around"]);
    expect(result.flags).toEqual({ section: "main" });
    expect(result.positional).toEqual(["save-btn"]);
  });

  it("handles multiple flags", () => {
    const result = parseFlags(
      ["--interactive", "--section", "nav"],
      ["interactive", "section", "diff"],
    );
    expect(result.flags).toEqual({ interactive: true, section: "nav" });
    expect(result.positional).toEqual([]);
  });

  it("ignores unknown flags and keeps them as positional", () => {
    const result = parseFlags(["--unknown", "value"], ["interactive"]);
    expect(result.flags).toEqual({});
    expect(result.positional).toEqual(["--unknown", "value"]);
  });

  it("returns all positional when no flags present", () => {
    const result = parseFlags(["save-btn", "other"], ["interactive"]);
    expect(result.flags).toEqual({});
    expect(result.positional).toEqual(["save-btn", "other"]);
  });

  it("handles empty args", () => {
    const result = parseFlags([], ["interactive"]);
    expect(result.flags).toEqual({});
    expect(result.positional).toEqual([]);
  });

  it("handles flag at end with no value (boolean)", () => {
    const result = parseFlags(["save-btn", "--diff"], ["diff", "section"]);
    expect(result.flags).toEqual({ diff: true });
    expect(result.positional).toEqual(["save-btn"]);
  });

  it("handles value flag at end with no value following — treats as boolean", () => {
    const result = parseFlags(["--section"], ["section"]);
    expect(result.flags).toEqual({ section: true });
    expect(result.positional).toEqual([]);
  });
});
