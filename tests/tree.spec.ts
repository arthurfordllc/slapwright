import { describe, it, expect } from "vitest";
import { buildTree, type AXNode } from "../src/tree";

// Helper to create AXNode fixtures
function axNode(overrides: Partial<AXNode>): AXNode {
  return {
    nodeId: "1",
    role: { type: "role", value: "generic" },
    name: { type: "computedString", value: "" },
    properties: [],
    childIds: [],
    ...overrides,
  };
}

describe("tree parser", () => {
  describe("buildTree", () => {
    it("returns empty string for empty input", () => {
      expect(buildTree([])).toBe("");
    });

    it("renders a single button", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          name: { type: "computedString", value: "" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "Save" },
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('button "Save"');
    });

    it("renders headings with level", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "heading" },
          name: { type: "computedString", value: "Dashboard" },
          properties: [{ name: "level", value: { type: "integer", value: 1 } }],
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('heading(1) "Dashboard"');
    });

    it("renders links with name", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "link" },
          name: { type: "computedString", value: "Sign in" },
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('link "Sign in"');
    });

    it("renders textbox with value and placeholder", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "textbox" },
          name: { type: "computedString", value: "Email" },
          value: { type: "string", value: "jane@test.com" },
          properties: [
            { name: "placeholder", value: { type: "string", value: "Enter email" } },
          ],
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('textbox "Email"');
      expect(result).toContain("jane@test.com");
      expect(result).toContain("Enter email");
    });

    it("renders checkbox with checked state", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "checkbox" },
          name: { type: "computedString", value: "Remember me" },
          properties: [
            { name: "checked", value: { type: "tristate", value: "true" } },
          ],
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('checkbox "Remember me"');
      expect(result).toContain("[checked]");
    });

    it("renders disabled state", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "Submit" },
          properties: [
            { name: "disabled", value: { type: "boolean", value: true } },
          ],
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('button "Submit"');
      expect(result).toContain("[disabled]");
    });

    it("collapses generic containers — promotes children", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "generic" },
          name: { type: "computedString", value: "" },
          childIds: ["3"],
        }),
        axNode({
          nodeId: "3",
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "Click me" },
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('button "Click me"');
      expect(result).not.toContain("generic");
    });

    it("collapses none roles", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "none" },
          childIds: ["3"],
        }),
        axNode({
          nodeId: "3",
          role: { type: "role", value: "link" },
          name: { type: "computedString", value: "Home" },
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('link "Home"');
      expect(result).not.toContain("none");
    });

    it("collapses presentation roles", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "presentation" },
          childIds: ["3"],
        }),
        axNode({
          nodeId: "3",
          role: { type: "role", value: "heading" },
          name: { type: "computedString", value: "Title" },
          properties: [{ name: "level", value: { type: "integer", value: 2 } }],
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('heading(2) "Title"');
      expect(result).not.toContain("presentation");
    });

    it("renders landmarks with brackets", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2", "3", "4"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "navigation" },
          childIds: ["5"],
        }),
        axNode({
          nodeId: "5",
          role: { type: "role", value: "link" },
          name: { type: "computedString", value: "Home" },
          childIds: [],
        }),
        axNode({
          nodeId: "3",
          role: { type: "role", value: "main" },
          childIds: ["6"],
        }),
        axNode({
          nodeId: "6",
          role: { type: "role", value: "heading" },
          name: { type: "computedString", value: "Dashboard" },
          properties: [{ name: "level", value: { type: "integer", value: 1 } }],
          childIds: [],
        }),
        axNode({
          nodeId: "4",
          role: { type: "role", value: "contentinfo" },
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain("[nav]");
      expect(result).toContain("[main]");
      expect(result).toContain("[footer]");
    });

    it("shows data-testid as @testid prefix", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "Save" },
          properties: [
            { name: "data-testid", value: { type: "string", value: "save-btn" } },
          ],
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('@save-btn button "Save"');
    });

    it("renders nested structure with indentation", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "navigation" },
          childIds: ["3", "4"],
        }),
        axNode({
          nodeId: "3",
          role: { type: "role", value: "link" },
          name: { type: "computedString", value: "Home" },
          childIds: [],
        }),
        axNode({
          nodeId: "4",
          role: { type: "role", value: "link" },
          name: { type: "computedString", value: "About" },
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      const lines = result.split("\n").filter(Boolean);
      // Navigation should be at top level, links indented under it
      const navLine = lines.find(l => l.includes("[nav]"));
      const homeLine = lines.find(l => l.includes("Home"));
      expect(navLine).toBeDefined();
      expect(homeLine).toBeDefined();
      // Home link should be more indented than nav
      const navIndent = navLine!.search(/\S/);
      const homeIndent = homeLine!.search(/\S/);
      expect(homeIndent).toBeGreaterThan(navIndent);
    });

    it("renders text nodes with quoted content", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "paragraph" },
          childIds: ["3"],
        }),
        axNode({
          nodeId: "3",
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "Welcome to the app" },
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('"Welcome to the app"');
    });

    it("renders combobox with value", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "combobox" },
          name: { type: "computedString", value: "Country" },
          value: { type: "string", value: "United States" },
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('combobox "Country"');
      expect(result).toContain("United States");
    });

    it("renders expanded/collapsed state", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "Menu" },
          properties: [
            { name: "expanded", value: { type: "boolean", value: false } },
          ],
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain("[collapsed]");
    });

    it("renders a region with aria-label", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "region" },
          name: { type: "computedString", value: "Needs Attention" },
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('region "Needs Attention"');
    });

    it("renders tab with name", () => {
      const nodes: AXNode[] = [
        axNode({
          nodeId: "1",
          role: { type: "role", value: "WebArea" },
          childIds: ["2"],
        }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "tab" },
          name: { type: "computedString", value: "Settings" },
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('tab "Settings"');
    });

    it("renders full page tree matching plan output format", () => {
      // Simulates a simplified dashboard page
      const nodes: AXNode[] = [
        axNode({ nodeId: "1", role: { type: "role", value: "WebArea" }, childIds: ["2", "3"] }),
        // Navigation
        axNode({ nodeId: "2", role: { type: "role", value: "navigation" }, childIds: ["4", "5"] }),
        axNode({ nodeId: "4", role: { type: "role", value: "link" }, name: { type: "computedString", value: "CareCoordinate" }, childIds: [] }),
        axNode({
          nodeId: "5",
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "Sign out" },
          properties: [{ name: "data-testid", value: { type: "string", value: "sign-out" } }],
          childIds: [],
        }),
        // Main
        axNode({ nodeId: "3", role: { type: "role", value: "main" }, childIds: ["6", "7"] }),
        axNode({
          nodeId: "6",
          role: { type: "role", value: "heading" },
          name: { type: "computedString", value: "Good morning, Jane" },
          properties: [{ name: "level", value: { type: "integer", value: 1 } }],
          childIds: [],
        }),
        axNode({
          nodeId: "7",
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "AI Assistant" },
          properties: [{ name: "data-testid", value: { type: "string", value: "ai-fab" } }],
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      // Check structure
      expect(result).toContain("[nav]");
      expect(result).toContain('link "CareCoordinate"');
      expect(result).toContain('@sign-out button "Sign out"');
      expect(result).toContain("[main]");
      expect(result).toContain('heading(1) "Good morning, Jane"');
      expect(result).toContain('@ai-fab button "AI Assistant"');
    });

    it("skips nodes with ignored roles", () => {
      const nodes: AXNode[] = [
        axNode({ nodeId: "1", role: { type: "role", value: "WebArea" }, childIds: ["2"] }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "generic" },
          childIds: ["3", "4"],
        }),
        axNode({
          nodeId: "3",
          role: { type: "role", value: "LineBreak" },
          childIds: [],
        }),
        axNode({
          nodeId: "4",
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "OK" },
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('button "OK"');
      expect(result).not.toContain("LineBreak");
    });

    it("handles group role with name", () => {
      const nodes: AXNode[] = [
        axNode({ nodeId: "1", role: { type: "role", value: "WebArea" }, childIds: ["2"] }),
        axNode({
          nodeId: "2",
          role: { type: "role", value: "group" },
          name: { type: "computedString", value: "Mom's Care Wheel" },
          properties: [{ name: "data-testid", value: { type: "string", value: "care-wheel" } }],
          childIds: ["3"],
        }),
        axNode({
          nodeId: "3",
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "Guidance" },
          childIds: [],
        }),
      ];
      const result = buildTree(nodes);
      expect(result).toContain('@care-wheel group "Mom\'s Care Wheel"');
      expect(result).toContain('button "Guidance"');
    });
  });
});
