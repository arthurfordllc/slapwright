/** Adapter interface for tree filtering — both CDP AXNode and Appium XML trees conform to this. */
export interface FilterableNode {
  identity: string | null;   // testID (e.g., "save-btn")
  isInteractive: boolean;
  renderedLine: string | null;
  children: FilterableNode[];
}

export interface TreeFilter {
  interactive?: boolean;  // Keep only interactive elements + ancestors
  section?: string;       // Keep only subtree under this testID
  around?: string;        // Target + parent + siblings + children
}

/** Apply filters to a tree of FilterableNodes. Returns a new (pruned) tree. */
export function filterTree(roots: FilterableNode[], filter: TreeFilter): FilterableNode[] {
  let result = roots;

  // Section filter — narrow to subtree under the matching testID
  if (filter.section) {
    const found = findNode(result, filter.section);
    result = found ? [found] : [];
  }

  // Around filter — target + parent with siblings + target's children
  if (filter.around) {
    result = findAround(result, filter.around);
  }

  // Interactive filter — keep only interactive nodes + their ancestors
  if (filter.interactive) {
    result = pruneNonInteractive(result);
  }

  return result;
}

/** Find a node by identity (DFS). */
function findNode(roots: FilterableNode[], identity: string): FilterableNode | null {
  for (const root of roots) {
    if (root.identity === identity) return root;
    const found = findNode(root.children, identity);
    if (found) return found;
  }
  return null;
}

/** Find the parent of a node by identity. Returns [parent, targetIndex] or null. */
function findParent(
  roots: FilterableNode[],
  identity: string,
): { parent: FilterableNode; index: number } | null {
  for (const root of roots) {
    for (let i = 0; i < root.children.length; i++) {
      if (root.children[i].identity === identity) {
        return { parent: root, index: i };
      }
    }
    const found = findParent(root.children, identity);
    if (found) return found;
  }
  return null;
}

/** Return target + parent (with all siblings) + target's children. */
function findAround(roots: FilterableNode[], identity: string): FilterableNode[] {
  // Check if target is at root level
  for (const root of roots) {
    if (root.identity === identity) return [root];
  }

  // Find parent
  const parentInfo = findParent(roots, identity);
  if (!parentInfo) return [];

  // Return parent with all its children (siblings of target preserved)
  return [{
    ...parentInfo.parent,
    children: parentInfo.parent.children,
  }];
}

/** Recursively prune non-interactive nodes. Keep interactive nodes and ancestors that lead to them. */
function pruneNonInteractive(roots: FilterableNode[]): FilterableNode[] {
  const result: FilterableNode[] = [];

  for (const root of roots) {
    if (root.isInteractive) {
      // Interactive — keep with all children
      result.push(root);
    } else {
      // Not interactive — keep only if descendants are interactive
      const filteredChildren = pruneNonInteractive(root.children);
      if (filteredChildren.length > 0) {
        result.push({ ...root, children: filteredChildren });
      }
    }
  }

  return result;
}
