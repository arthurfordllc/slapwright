import { describe, it, expect } from "vitest";
import { filterTree, type FilterableNode } from "../src/tree-filter.js";

// Helper to build test trees
function node(
  identity: string | null,
  opts: { interactive?: boolean; rendered?: string; children?: FilterableNode[] } = {},
): FilterableNode {
  return {
    identity,
    isInteractive: opts.interactive ?? false,
    renderedLine: opts.rendered ?? (identity ? `@${identity}` : null),
    children: opts.children ?? [],
  };
}

describe("filterTree", () => {
  describe("no filter (passthrough)", () => {
    it("returns all nodes when no filter is applied", () => {
      const tree = [
        node("nav", {
          rendered: "[nav]",
          children: [
            node("save-btn", { interactive: true, rendered: "@save-btn button" }),
            node(null, { rendered: '"Some text"' }),
          ],
        }),
      ];

      const result = filterTree(tree, {});
      expect(result).toEqual(tree);
    });
  });

  describe("--interactive filter", () => {
    it("keeps only interactive nodes and their ancestors", () => {
      const tree = [
        node("nav", {
          rendered: "[nav]",
          children: [
            node("save-btn", { interactive: true, rendered: "@save-btn button" }),
            node(null, { rendered: '"Some text"' }),
            node("cancel-btn", { interactive: true, rendered: "@cancel-btn button" }),
          ],
        }),
      ];

      const result = filterTree(tree, { interactive: true });
      // Should keep nav (ancestor) and both buttons, but drop the text node
      expect(result.length).toBe(1);
      expect(result[0].identity).toBe("nav");
      expect(result[0].children.length).toBe(2);
      expect(result[0].children[0].identity).toBe("save-btn");
      expect(result[0].children[1].identity).toBe("cancel-btn");
    });

    it("drops entire branch if no interactive descendants", () => {
      const tree = [
        node("header", {
          rendered: "[header]",
          children: [
            node(null, { rendered: '"Just text"' }),
          ],
        }),
        node("form", {
          rendered: "[form]",
          children: [
            node("email", { interactive: true, rendered: "@email textbox" }),
          ],
        }),
      ];

      const result = filterTree(tree, { interactive: true });
      // Header branch has no interactive elements — should be dropped
      expect(result.length).toBe(1);
      expect(result[0].identity).toBe("form");
    });

    it("returns empty array when no interactive nodes exist", () => {
      const tree = [
        node(null, { rendered: '"Hello"' }),
        node(null, { rendered: '"World"' }),
      ];

      const result = filterTree(tree, { interactive: true });
      expect(result).toEqual([]);
    });
  });

  describe("--section filter", () => {
    it("returns only the subtree under the matching testID", () => {
      const tree = [
        node("header", {
          rendered: "[header]",
          children: [node("logo", { rendered: "@logo img" })],
        }),
        node("main", {
          rendered: "[main]",
          children: [
            node("form", {
              rendered: "@form",
              children: [
                node("email", { interactive: true, rendered: "@email textbox" }),
                node("submit", { interactive: true, rendered: "@submit button" }),
              ],
            }),
          ],
        }),
      ];

      const result = filterTree(tree, { section: "form" });
      // Should return only the form subtree
      expect(result.length).toBe(1);
      expect(result[0].identity).toBe("form");
      expect(result[0].children.length).toBe(2);
    });

    it("returns empty array when section testID not found", () => {
      const tree = [node("save-btn", { interactive: true })];
      const result = filterTree(tree, { section: "nonexistent" });
      expect(result).toEqual([]);
    });

    it("finds section in deeply nested tree", () => {
      const tree = [
        node("root", {
          children: [
            node("level1", {
              children: [
                node("target", {
                  children: [
                    node("deep-child", { interactive: true, rendered: "@deep-child button" }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ];

      const result = filterTree(tree, { section: "target" });
      expect(result.length).toBe(1);
      expect(result[0].identity).toBe("target");
      expect(result[0].children[0].identity).toBe("deep-child");
    });
  });

  describe("--around filter", () => {
    it("returns target node with its parent and siblings", () => {
      const tree = [
        node("form", {
          rendered: "@form",
          children: [
            node("email", { interactive: true, rendered: "@email textbox" }),
            node("password", { interactive: true, rendered: "@password textbox" }),
            node("submit", { interactive: true, rendered: "@submit button" }),
          ],
        }),
      ];

      const result = filterTree(tree, { around: "password" });
      // Should include the parent (form) with all siblings
      expect(result.length).toBe(1);
      expect(result[0].identity).toBe("form");
      expect(result[0].children.length).toBe(3);
    });

    it("returns just the target when it is a root node", () => {
      const tree = [
        node("standalone", { interactive: true, rendered: "@standalone button" }),
        node("other", { rendered: "@other" }),
      ];

      const result = filterTree(tree, { around: "standalone" });
      // Target is at root level — return just it (+ its children)
      expect(result.length).toBe(1);
      expect(result[0].identity).toBe("standalone");
    });

    it("includes target's children", () => {
      const tree = [
        node("wrapper", {
          children: [
            node("card", {
              rendered: "@card",
              children: [
                node("title", { rendered: "@title heading" }),
                node("body", { rendered: "@body" }),
              ],
            }),
            node("other-card", { rendered: "@other-card" }),
          ],
        }),
      ];

      const result = filterTree(tree, { around: "card" });
      expect(result.length).toBe(1);
      expect(result[0].identity).toBe("wrapper");
      // Parent should contain both children (siblings)
      const children = result[0].children;
      expect(children.length).toBe(2);
      // The card should still have its children
      const card = children.find((c) => c.identity === "card");
      expect(card).toBeDefined();
      expect(card!.children.length).toBe(2);
    });

    it("returns empty array when target not found", () => {
      const tree = [node("save-btn", { interactive: true })];
      const result = filterTree(tree, { around: "nonexistent" });
      expect(result).toEqual([]);
    });
  });

  describe("combined filters", () => {
    it("applies section then interactive", () => {
      const tree = [
        node("main", {
          rendered: "[main]",
          children: [
            node("form", {
              rendered: "@form",
              children: [
                node("email", { interactive: true, rendered: "@email textbox" }),
                node(null, { rendered: '"Help text"' }),
                node("submit", { interactive: true, rendered: "@submit button" }),
              ],
            }),
            node("sidebar", { rendered: "@sidebar" }),
          ],
        }),
      ];

      const result = filterTree(tree, { section: "form", interactive: true });
      // Section narrows to form, then interactive filters out text
      expect(result.length).toBe(1);
      expect(result[0].identity).toBe("form");
      expect(result[0].children.length).toBe(2);
      expect(result[0].children[0].identity).toBe("email");
      expect(result[0].children[1].identity).toBe("submit");
    });
  });

  describe("edge cases", () => {
    it("handles empty tree", () => {
      expect(filterTree([], {})).toEqual([]);
      expect(filterTree([], { interactive: true })).toEqual([]);
      expect(filterTree([], { section: "foo" })).toEqual([]);
      expect(filterTree([], { around: "foo" })).toEqual([]);
    });

    it("handles flat tree (no nesting)", () => {
      const tree = [
        node("a", { interactive: true, rendered: "@a button" }),
        node("b", { rendered: "@b" }),
        node("c", { interactive: true, rendered: "@c link" }),
      ];

      const result = filterTree(tree, { interactive: true });
      expect(result.length).toBe(2);
      expect(result[0].identity).toBe("a");
      expect(result[1].identity).toBe("c");
    });
  });
});
