import { describe, it, expect } from "vitest";
import { parseSelector, selectorToExpression } from "../src/selector";

describe("selector parser", () => {
  describe("parseSelector", () => {
    it("parses @testid syntax", () => {
      const sel = parseSelector("@save-btn");
      expect(sel).toEqual({ type: "testid", value: "save-btn" });
    });

    it("parses @testid with dots and hyphens", () => {
      const sel = parseSelector("@section-touch-guidance");
      expect(sel).toEqual({ type: "testid", value: "section-touch-guidance" });
    });

    it("parses role:type with name", () => {
      const sel = parseSelector('role:button "Save"');
      expect(sel).toEqual({ type: "role", role: "button", name: "Save" });
    });

    it("parses role:type without name", () => {
      const sel = parseSelector("role:heading");
      expect(sel).toEqual({ type: "role", role: "heading" });
    });

    it("parses role:type with single-quoted name", () => {
      const sel = parseSelector("role:link 'Sign in'");
      expect(sel).toEqual({ type: "role", role: "link", name: "Sign in" });
    });

    it("parses label: selector", () => {
      const sel = parseSelector("label:Email");
      expect(sel).toEqual({ type: "label", value: "Email" });
    });

    it("parses label: with spaces in value", () => {
      const sel = parseSelector("label:First Name");
      expect(sel).toEqual({ type: "label", value: "First Name" });
    });

    it("parses #id selector", () => {
      const sel = parseSelector("#password");
      expect(sel).toEqual({ type: "id", value: "password" });
    });

    it("parses CSS selector starting with .", () => {
      const sel = parseSelector(".btn-primary");
      expect(sel).toEqual({ type: "css", value: ".btn-primary" });
    });

    it("parses quoted text as text selector", () => {
      const sel = parseSelector('"Add Medication"');
      expect(sel).toEqual({ type: "text", value: "Add Medication" });
    });

    it("parses single-quoted text as text selector", () => {
      const sel = parseSelector("'Sign out'");
      expect(sel).toEqual({ type: "text", value: "Sign out" });
    });

    it("parses bare text as text selector", () => {
      const sel = parseSelector("Save");
      expect(sel).toEqual({ type: "text", value: "Save" });
    });

    it("parses CSS selector with brackets", () => {
      const sel = parseSelector('input[inputmode="numeric"]');
      expect(sel).toEqual({ type: "css", value: 'input[inputmode="numeric"]' });
    });
  });

  describe("selectorToExpression", () => {
    it("generates expression for testid", () => {
      const expr = selectorToExpression({ type: "testid", value: "save-btn" });
      expect(expr).toContain("data-testid");
      expect(expr).toContain("save-btn");
    });

    it("generates expression for id", () => {
      const expr = selectorToExpression({ type: "id", value: "email" });
      expect(expr).toContain("getElementById");
      expect(expr).toContain("email");
    });

    it("generates expression for css", () => {
      const expr = selectorToExpression({ type: "css", value: ".btn" });
      expect(expr).toContain("querySelector");
      expect(expr).toContain(".btn");
    });

    it("generates expression for label", () => {
      const expr = selectorToExpression({ type: "label", value: "Email" });
      expect(expr).toContain("aria-label");
      expect(expr).toContain("Email");
    });

    it("generates expression for text", () => {
      const expr = selectorToExpression({ type: "text", value: "Save" });
      // Text matching is case-insensitive, so the expression lowercases
      expect(expr).toContain("save");
    });

    it("generates expression for role with name", () => {
      const expr = selectorToExpression({ type: "role", role: "button", name: "Save" });
      expect(expr).toContain("button");
      // Matching is case-insensitive; the name is embedded pre-lowered.
      expect(expr.toLowerCase()).toContain("save");
    });

    it("generates expression for role without name", () => {
      const expr = selectorToExpression({ type: "role", role: "heading" });
      expect(expr).toContain("heading");
    });

    it("escapes special characters in values", () => {
      const expr = selectorToExpression({ type: "testid", value: "it's-a-test" });
      // The value must survive into the expression exactly once, JS-safely.
      expect(() => new Function(`return (${expr});`)).not.toThrow();
      expect(expr).toContain("it");
    });
  });

  /*
   * Regression: roleToTags entries like input[type='checkbox'] used to embed
   * single quotes inside a single-quoted string, producing syntactically
   * invalid JS. findElement then mistook the resulting exception object for a
   * found element and click() reported success against it — phantom taps.
   * Every selector form must compile.
   */
  describe("generated expressions are valid JavaScript", () => {
    const cases = [
      '@save-btn',
      '@it\'s-odd',
      'role:button "Save"',
      'role:checkbox "Brown Sugar"',
      'role:checkbox',
      'role:radio "Choice A"',
      'role:textbox "Email"',
      'role:combobox',
      'role:heading "Good morning"',
      'label:Email',
      "label:What's your name",
      '#main-content',
      '.some-class',
      '"visible text"',
      'bare text fallback',
      '"text with \'quotes\' inside"',
    ];
    for (const c of cases) {
      it(`compiles: ${c}`, () => {
        const expr = selectorToExpression(parseSelector(c));
        expect(() => new Function(`return (${expr});`)).not.toThrow();
      });
    }
  });
});
