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
 */

export type Selector =
  | { type: "testid"; value: string }
  | { type: "role"; role: string; name?: string }
  | { type: "label"; value: string }
  | { type: "id"; value: string }
  | { type: "text"; value: string }
  | { type: "css"; value: string };

function escapeForJS(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
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

export function selectorToExpression(sel: Selector): string {
  const esc = (s: string) => escapeForJS(s);

  switch (sel.type) {
    case "testid":
      return `document.querySelector('[data-testid="${esc(sel.value)}"]')`;

    case "id":
      return `document.getElementById('${esc(sel.value)}')`;

    case "css":
      return `document.querySelector('${esc(sel.value)}')`;

    case "label":
      return `document.querySelector('[aria-label="${esc(sel.value)}"]') || ` +
        `(() => { const l = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === '${esc(sel.value)}'); ` +
        `return l ? document.getElementById(l.htmlFor) || l.querySelector('input,select,textarea') : null; })()`;

    case "text":
      return `(() => { ` +
        `const clickable = ['BUTTON','A','INPUT','SELECT','TEXTAREA']; ` +
        `const all = document.querySelectorAll('button, a, [role="button"], [role="link"], input[type="submit"]'); ` +
        `for (const el of all) { if (el.textContent?.trim().toLowerCase().includes('${esc(sel.value.toLowerCase())}')) return el; } ` +
        `const spans = document.querySelectorAll('*'); ` +
        `for (const el of spans) { if (clickable.includes(el.tagName) && el.textContent?.trim().toLowerCase().includes('${esc(sel.value.toLowerCase())}')) return el; } ` +
        `return null; })()`;

    case "role": {
      if (sel.name) {
        return `(() => { ` +
          `const els = document.querySelectorAll('[role="${esc(sel.role)}"], ${roleToTags(sel.role)}'); ` +
          `const name = '${esc(sel.name)}'.toLowerCase(); ` +
          `for (const el of els) { ` +
          `const label = (el.getAttribute('aria-label') || el.textContent || '').trim().toLowerCase(); ` +
          `if (label.includes(name)) return el; } ` +
          `return null; })()`;
      }
      return `document.querySelector('[role="${esc(sel.role)}"], ${roleToTags(sel.role)}')`;
    }
  }
}

function roleToTags(role: string): string {
  const map: Record<string, string> = {
    button: "button",
    link: "a",
    textbox: "input:not([type]),input[type='text'],input[type='email'],input[type='password'],input[type='search'],input[type='tel'],input[type='url'],textarea",
    heading: "h1,h2,h3,h4,h5,h6",
    checkbox: "input[type='checkbox']",
    radio: "input[type='radio']",
    combobox: "select",
    tab: "[role='tab']",
    menuitem: "[role='menuitem']",
    img: "img",
    list: "ul,ol",
    listitem: "li",
    navigation: "nav",
    main: "main",
    banner: "header",
    contentinfo: "footer",
    region: "section[aria-label],section[aria-labelledby]",
  };
  return map[role] ?? `[role="${role}"]`;
}
