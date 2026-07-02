/**
 * Selector parser — converts human-friendly selectors to CDP-ready expressions.
 *
 * Syntax:
 *   @testid          → [data-testid="testid"]
 *   role:button "Save" → AX tree role=button, name="Save"
 *   label:Email      → aria-label or <label> match
 *   #id              → getElementById
 *   .class           → querySelector
 *   "text"           → text content match
 *   bare text        → text content match (fallback)
 *
 * Every literal is embedded via JSON.stringify so the generated expression is
 * always valid JavaScript regardless of quotes in values or role tag maps.
 * (A single-quote collision here once produced invalid JS for checkbox/radio/
 * textbox roles — see tests/selector.spec.ts "generated expressions".)
 */

export type Selector =
  | { type: "testid"; value: string }
  | { type: "role"; role: string; name?: string }
  | { type: "label"; value: string }
  | { type: "id"; value: string }
  | { type: "text"; value: string }
  | { type: "css"; value: string };

/** Embed a runtime string literal into generated JS safely. */
function js(value: string): string {
  return JSON.stringify(value);
}

/** Embed a CSS attribute value: [data-testid="..."] with inner quotes escaped. */
function cssAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function parseSelector(input: string): Selector {
  const trimmed = input.trim();

  // @testid
  if (trimmed.startsWith("@")) {
    return { type: "testid", value: trimmed.slice(1) };
  }

  // role:type "name" or role:type 'name' or role:type
  if (trimmed.startsWith("role:")) {
    const rest = trimmed.slice(5);
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
      return { type: "role", role: rest };
    }
    const role = rest.slice(0, spaceIdx);
    let name = rest.slice(spaceIdx + 1).trim();
    // Strip quotes
    if ((name.startsWith('"') && name.endsWith('"')) || (name.startsWith("'") && name.endsWith("'"))) {
      name = name.slice(1, -1);
    }
    return { type: "role", role, name };
  }

  // label:value
  if (trimmed.startsWith("label:")) {
    return { type: "label", value: trimmed.slice(6) };
  }

  // #id
  if (trimmed.startsWith("#")) {
    return { type: "id", value: trimmed.slice(1) };
  }

  // .class or CSS selector with brackets
  if (trimmed.startsWith(".") || trimmed.match(/^[a-z]+\[/)) {
    return { type: "css", value: trimmed };
  }

  // Quoted text → text selector
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return { type: "text", value: trimmed.slice(1, -1) };
  }

  // Bare text fallback
  return { type: "text", value: trimmed };
}

/**
 * Accessible-name helper injected into role/name matching. Mirrors the parts
 * of the accname algorithm that matter for app testing: aria-label, then
 * aria-labelledby, then associated <label> elements (form controls whose name
 * never appears in their own textContent — the checkbox case), then text.
 */
const ACC_NAME_FN =
  "(el) => { " +
  "const aria = el.getAttribute('aria-label'); if (aria) return aria; " +
  "const lb = el.getAttribute('aria-labelledby'); " +
  "if (lb) { const t = lb.split(/\\s+/).map((id) => { const n = document.getElementById(id); return n ? (n.textContent || '') : ''; }).join(' ').trim(); if (t) return t; } " +
  "if (el.labels && el.labels.length) { const t = Array.from(el.labels).map((l) => l.textContent || '').join(' ').trim(); if (t) return t; } " +
  "return (el.textContent || '').trim(); " +
  "}";

export function selectorToExpression(sel: Selector): string {
  switch (sel.type) {
    case "testid":
      return `document.querySelector(${js(`[data-testid="${cssAttr(sel.value)}"]`)})`;

    case "id":
      return `document.getElementById(${js(sel.value)})`;

    case "css":
      return `document.querySelector(${js(sel.value)})`;

    case "label":
      return `document.querySelector(${js(`[aria-label="${cssAttr(sel.value)}"]`)}) || ` +
        `(() => { const l = Array.from(document.querySelectorAll('label')).find(l => (l.textContent || '').trim() === ${js(sel.value)}); ` +
        `return l ? document.getElementById(l.htmlFor) || l.querySelector('input,select,textarea') : null; })()`;

    case "text":
      return `(() => { ` +
        `const needle = ${js(sel.value.toLowerCase())}; ` +
        `const all = document.querySelectorAll('button, a, [role="button"], [role="link"], input[type="submit"]'); ` +
        `for (const el of all) { if ((el.textContent || '').trim().toLowerCase().includes(needle)) return el; } ` +
        `const clickable = ['BUTTON','A','INPUT','SELECT','TEXTAREA']; ` +
        `for (const el of document.querySelectorAll('*')) { if (clickable.includes(el.tagName) && (el.textContent || '').trim().toLowerCase().includes(needle)) return el; } ` +
        `return null; })()`;

    case "role": {
      const combined = `[role="${cssAttr(sel.role)}"], ${roleToTags(sel.role)}`;
      if (sel.name) {
        return `(() => { ` +
          `const accName = ${ACC_NAME_FN}; ` +
          `const els = document.querySelectorAll(${js(combined)}); ` +
          `const name = ${js(sel.name.toLowerCase())}; ` +
          `for (const el of els) { ` +
          `if (accName(el).trim().toLowerCase().includes(name)) return el; } ` +
          `return null; })()`;
      }
      return `document.querySelector(${js(combined)})`;
    }
  }
}

function roleToTags(role: string): string {
  const map: Record<string, string> = {
    button: "button",
    link: "a",
    textbox: 'input:not([type]),input[type="text"],input[type="email"],input[type="password"],input[type="search"],input[type="tel"],input[type="url"],textarea',
    heading: "h1,h2,h3,h4,h5,h6",
    checkbox: 'input[type="checkbox"]',
    radio: 'input[type="radio"]',
    combobox: "select",
    tab: '[role="tab"]',
    menuitem: '[role="menuitem"]',
    img: "img",
    list: "ul,ol",
    listitem: "li",
    navigation: "nav",
    main: "main",
    banner: "header",
    contentinfo: "footer",
    region: "section[aria-label],section[aria-labelledby]",
  };
  return map[role] ?? `[role="${cssAttr(role)}"]`;
}
