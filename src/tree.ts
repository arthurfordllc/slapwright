/**
 * Accessibility tree parser — CDP AXNode[] → beautiful collapsed element tree.
 *
 * Collapsing rules:
 *   - Skip generic/none/presentation/LineBreak roles (promote children)
 *   - Skip WebArea (root container — promote children)
 *   - Always show interactive elements: button, link, textbox, combobox, checkbox, radio, etc.
 *   - Show headings with level: heading(2) "Title"
 *   - Show landmarks with brackets: [nav], [main], [footer]
 *   - Show data-testid as @testid prefix
 *   - Show form state: value, placeholder, checked, disabled, expanded/collapsed
 *   - Show text nodes in quotes
 */

export interface AXValue {
  type: string;
  value: string | number | boolean;
}

export interface AXProperty {
  name: string;
  value: AXValue;
}

export interface AXNode {
  nodeId: string;
  role: AXValue;
  name?: AXValue;
  value?: AXValue;
  properties?: AXProperty[];
  childIds?: string[];
}

interface TreeNode {
  node: AXNode;
  children: TreeNode[];
}

// Roles that get collapsed — their children are promoted to the parent
const COLLAPSE_ROLES = new Set([
  "generic",
  "none",
  "presentation",
  "WebArea",
  "RootWebArea",
  "LineBreak",
  "InlineTextBox",
  "paragraph",
]);

// Roles that always render
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "combobox",
  "checkbox",
  "radio",
  "slider",
  "switch",
  "tab",
  "menuitem",
  "menu",
  "tablist",
  "toolbar",
  "dialog",
  "alertdialog",
  "img",
]);

// Landmarks render with bracket notation
const LANDMARK_MAP: Record<string, string> = {
  navigation: "nav",
  main: "main",
  banner: "header",
  contentinfo: "footer",
  complementary: "aside",
  search: "search",
  form: "form",
};

// Roles that show with their role name and name in quotes
const NAMED_ROLES = new Set([
  "heading",
  "region",
  "group",
  "list",
  "listitem",
  "table",
  "row",
  "cell",
  "article",
  "figure",
  "separator",
]);

function getProperty(node: AXNode, propName: string): AXValue | undefined {
  return node.properties?.find((p) => p.name === propName)?.value;
}

function getTestId(node: AXNode): string | undefined {
  const prop = getProperty(node, "data-testid");
  return prop ? String(prop.value) : undefined;
}

function shouldCollapse(node: AXNode): boolean {
  const role = String(node.role?.value ?? "");
  if (!COLLAPSE_ROLES.has(role)) return false;
  // Don't collapse if it has a name (meaningful container)
  const name = String(node.name?.value ?? "").trim();
  if (name && role !== "WebArea" && role !== "RootWebArea" && role !== "LineBreak" && role !== "InlineTextBox" && role !== "paragraph") {
    return false;
  }
  // Don't collapse if it has a data-testid
  if (getTestId(node)) return false;
  return true;
}

function shouldSkip(node: AXNode): boolean {
  const role = String(node.role?.value ?? "");
  return role === "LineBreak" || role === "InlineTextBox";
}

function renderNode(node: AXNode): string | null {
  const role = String(node.role?.value ?? "");
  const name = String(node.name?.value ?? "").trim();
  const testId = getTestId(node);
  const prefix = testId ? `@${testId} ` : "";

  // Static text — just show quoted text
  if (role === "StaticText" || role === "text") {
    if (!name) return null;
    return `${prefix}"${name}"`;
  }

  // Landmark
  if (LANDMARK_MAP[role]) {
    const label = LANDMARK_MAP[role];
    if (name) {
      return `${prefix}[${label}] "${name}"`;
    }
    return `${prefix}[${label}]`;
  }

  // Interactive roles
  if (INTERACTIVE_ROLES.has(role)) {
    let line = `${prefix}${role}`;
    if (name) line += ` "${name}"`;
    line += renderState(node);
    return line;
  }

  // Heading — special format with level
  if (role === "heading") {
    const level = getProperty(node, "level");
    const lvl = level ? `(${level.value})` : "";
    let line = `${prefix}heading${lvl}`;
    if (name) line += ` "${name}"`;
    return line;
  }

  // Named roles (region, group, etc.)
  if (NAMED_ROLES.has(role)) {
    let line = `${prefix}${role}`;
    if (name) line += ` "${name}"`;
    line += renderState(node);
    return line;
  }

  // If it has a testid, render as quoted name or role
  if (testId) {
    if (name) return `@${testId} "${name}"`;
    return `@${testId} ${role}`;
  }

  // Named generic containers that weren't collapsed
  if (name) {
    return `${prefix}"${name}"`;
  }

  return null;
}

function renderState(node: AXNode): string {
  const parts: string[] = [];

  // Value
  const val = node.value;
  if (val && String(val.value).trim()) {
    parts.push(`val="${val.value}"`);
  }

  // Placeholder
  const placeholder = getProperty(node, "placeholder");
  if (placeholder && String(placeholder.value).trim()) {
    parts.push(`placeholder="${placeholder.value}"`);
  }

  // Checked
  const checked = getProperty(node, "checked");
  if (checked && (checked.value === "true" || checked.value === true)) {
    parts.push("[checked]");
  }

  // Disabled
  const disabled = getProperty(node, "disabled");
  if (disabled && (disabled.value === "true" || disabled.value === true)) {
    parts.push("[disabled]");
  }

  // Expanded/collapsed
  const expanded = getProperty(node, "expanded");
  if (expanded !== undefined) {
    if (expanded.value === true || expanded.value === "true") {
      parts.push("[expanded]");
    } else {
      parts.push("[collapsed]");
    }
  }

  return parts.length > 0 ? " " + parts.join(" ") : "";
}

function buildNodeMap(nodes: AXNode[]): Map<string, AXNode> {
  const map = new Map<string, AXNode>();
  for (const node of nodes) {
    map.set(node.nodeId, node);
  }
  return map;
}

function buildTreeStructure(
  nodeId: string,
  nodeMap: Map<string, AXNode>,
): TreeNode | null {
  const node = nodeMap.get(nodeId);
  if (!node) return null;

  const children: TreeNode[] = [];
  for (const childId of node.childIds ?? []) {
    const child = buildTreeStructure(childId, nodeMap);
    if (child) children.push(child);
  }

  return { node, children };
}

function flattenTree(treeNode: TreeNode, depth: number, lines: string[]): void {
  const { node, children } = treeNode;

  // Skip entirely
  if (shouldSkip(node)) return;

  // Collapse — promote children to this level
  if (shouldCollapse(node)) {
    for (const child of children) {
      flattenTree(child, depth, lines);
    }
    return;
  }

  // Render this node
  const rendered = renderNode(node);
  if (rendered !== null) {
    const indent = "  ".repeat(depth);
    lines.push(`${indent}${rendered}`);
  }

  // Render children (indent if we rendered this node)
  const childDepth = rendered !== null ? depth + 1 : depth;
  for (const child of children) {
    flattenTree(child, childDepth, lines);
  }
}

export function buildTree(nodes: AXNode[]): string {
  if (nodes.length === 0) return "";

  const nodeMap = buildNodeMap(nodes);

  // Find root (first node, typically WebArea)
  const root = buildTreeStructure(nodes[0].nodeId, nodeMap);
  if (!root) return "";

  const lines: string[] = [];
  flattenTree(root, 0, lines);

  return lines.join("\n");
}

// ── FilterableNode adapter ──

import type { FilterableNode } from "./tree-filter.js";

/** Convert CDP AXNode[] into FilterableNode[] for use with filterTree. */
export function toFilterable(nodes: AXNode[]): FilterableNode[] {
  if (nodes.length === 0) return [];

  const nodeMap = buildNodeMap(nodes);
  const root = buildTreeStructure(nodes[0].nodeId, nodeMap);
  if (!root) return [];

  return convertTreeNode(root);
}

/** Recursively convert TreeNode → FilterableNode[], collapsing generic wrappers. */
function convertTreeNode(treeNode: TreeNode): FilterableNode[] {
  const { node, children } = treeNode;

  // Skip entirely (LineBreak, InlineTextBox)
  if (shouldSkip(node)) return [];

  // Collapse generic wrappers — promote children
  if (shouldCollapse(node)) {
    const result: FilterableNode[] = [];
    for (const child of children) {
      result.push(...convertTreeNode(child));
    }
    return result;
  }

  const role = String(node.role?.value ?? "");
  const testId = getTestId(node);
  const rendered = renderNode(node);

  const filterable: FilterableNode = {
    identity: testId ?? null,
    isInteractive: INTERACTIVE_ROLES.has(role),
    renderedLine: rendered,
    children: children.flatMap((c) => convertTreeNode(c)),
  };

  return [filterable];
}
