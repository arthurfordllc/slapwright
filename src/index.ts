/**
 * Slapwright CLI — Lightning-fast web testing for AI agents.
 *
 * Usage: slapwright <command> [args...]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import WebSocket from "ws";
import { createCDP, ElementNotFoundError, type SessionStore, type SessionData, type WSLike } from "./cdp.js";
import { buildTree, toFilterable } from "./tree.js";
import { ok, fail, info, formatDuration } from "./fmt.js";
import { parseFlags } from "./args.js";
import { filterTree, type TreeFilter, type FilterableNode } from "./tree-filter.js";
import { diffLines, formatDiff } from "./diff.js";

// ── Config Loading ──

interface SlapwrightConfig {
  chromePort: number;
  baseUrl: string;
  defaults: {
    timeout: number;
    pollInterval: number;
    screenshotDir: string;
    waitForNetworkIdle: boolean;
  };
  login: {
    url: string;
    email: string;
    password: string;
    otp: string;
    selectors: {
      email: string;
      password: string;
      submit: string;
      otpInputs: string;
      dashboard: string;
    };
  };
}

function loadConfig(): SlapwrightConfig {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const paths = [
    resolve(scriptDir, "..", "slapwright.config.json"),
    resolve(scriptDir, "slapwright.config.json"),
    resolve(process.cwd(), "slapwright.config.json"),
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, "utf-8")) as SlapwrightConfig;
    }
  }

  throw new Error("slapwright.config.json not found");
}

// ── Session File Store ──

const SESSION_FILE = "/tmp/slapwright-session.json";

function createFileSessionStore(): SessionStore {
  return {
    read: async () => {
      try {
        return JSON.parse(readFileSync(SESSION_FILE, "utf-8")) as SessionData;
      } catch {
        return null;
      }
    },
    write: async (session: SessionData) => {
      writeFileSync(SESSION_FILE, JSON.stringify(session));
    },
    clear: async () => {
      try {
        writeFileSync(SESSION_FILE, "");
      } catch {
        // ignore
      }
    },
  };
}

// ── WebSocket Factory ──

function createWSFactory(): (url: string) => WSLike {
  return (url: string) => new WebSocket(url) as unknown as WSLike;
}

// ── Command Implementations ──

type CDP = ReturnType<typeof createCDP>;

async function cmdSession(cdp: CDP): Promise<void> {
  const start = Date.now();
  await cdp.connect();
  console.log(ok("connected to Chrome", Date.now() - start));
}

async function cmdStatus(cdp: CDP): Promise<void> {
  try {
    await cdp.connect();
    const url = await cdp.getCurrentUrl();
    console.log(ok(`connected — ${url}`));
  } catch {
    console.log(fail("not connected"));
    process.exitCode = 1;
  }
}

async function cmdNavigate(cdp: CDP, url: string, config: SlapwrightConfig): Promise<void> {
  const start = Date.now();
  // Prepend baseUrl if relative
  const fullUrl = url.startsWith("http") ? url : `${config.baseUrl}${url}`;
  await cdp.navigate(fullUrl);
  console.log(ok(`navigated to ${fullUrl}`, Date.now() - start));
}

async function cmdTap(cdp: CDP, selector: string, config: SlapwrightConfig): Promise<void> {
  const start = Date.now();
  await cdp.click(selector, {
    timeout: config.defaults.timeout,
    pollInterval: config.defaults.pollInterval,
  });
  console.log(ok(`tapped ${selector}`, Date.now() - start));
}

async function cmdType(
  cdp: CDP,
  selector: string,
  text: string,
  config: SlapwrightConfig
): Promise<void> {
  const start = Date.now();
  await cdp.type(selector, text, {
    timeout: config.defaults.timeout,
    pollInterval: config.defaults.pollInterval,
  });
  console.log(ok(`typed "${text}" into ${selector}`, Date.now() - start));
}

async function cmdSelect(
  cdp: CDP,
  selector: string,
  value: string,
  config: SlapwrightConfig
): Promise<void> {
  const start = Date.now();
  const el = await cdp.findElement(selector, {
    timeout: config.defaults.timeout,
    pollInterval: config.defaults.pollInterval,
  });
  await cdp.send("Runtime.callFunctionOn", {
    objectId: el.objectId,
    functionDeclaration: `function(val) {
      this.value = val;
      this.dispatchEvent(new Event('change', { bubbles: true }));
    }`,
    arguments: [{ value }],
    returnByValue: true,
  });
  console.log(ok(`selected "${value}" in ${selector}`, Date.now() - start));
}

async function cmdCheck(cdp: CDP, selector: string, config: SlapwrightConfig): Promise<void> {
  const start = Date.now();
  const el = await cdp.findElement(selector, {
    timeout: config.defaults.timeout,
    pollInterval: config.defaults.pollInterval,
  });
  await cdp.send("Runtime.callFunctionOn", {
    objectId: el.objectId,
    functionDeclaration: `function() {
      if (!this.checked) { this.click(); }
    }`,
    returnByValue: true,
  });
  console.log(ok(`checked ${selector}`, Date.now() - start));
}

async function cmdUncheck(cdp: CDP, selector: string, config: SlapwrightConfig): Promise<void> {
  const start = Date.now();
  const el = await cdp.findElement(selector, {
    timeout: config.defaults.timeout,
    pollInterval: config.defaults.pollInterval,
  });
  await cdp.send("Runtime.callFunctionOn", {
    objectId: el.objectId,
    functionDeclaration: `function() {
      if (this.checked) { this.click(); }
    }`,
    returnByValue: true,
  });
  console.log(ok(`unchecked ${selector}`, Date.now() - start));
}

async function cmdOtp(cdp: CDP, digits: string, selectorPattern: string): Promise<void> {
  const start = Date.now();
  const escaped = selectorPattern.replace(/'/g, "\\'");

  for (let i = 0; i < digits.length; i++) {
    // Focus the i-th input
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const inputs = Array.from(document.querySelectorAll('${escaped}'));
        if (inputs[${i}]) {
          inputs[${i}].focus();
          inputs[${i}].value = '';
        }
      })()`,
      returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 50));

    // Type the digit using keyboard input (triggers React events)
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: digits[i],
      text: digits[i],
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: digits[i],
    });
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(ok(`entered OTP ${digits}`, Date.now() - start));
}

async function cmdBack(cdp: CDP): Promise<void> {
  const start = Date.now();
  await cdp.send("Page.enable");
  const loadPromise = new Promise<void>((resolve) => {
    // Give it a short timeout in case the page doesn't navigate
    const timer = setTimeout(resolve, 3000);
    // We'll wait briefly for load
    setTimeout(() => {
      clearTimeout(timer);
      resolve();
    }, 1000);
  });
  await cdp.evaluate("window.history.back()");
  await loadPromise;
  console.log(ok("navigated back", Date.now() - start));
}

async function cmdReload(cdp: CDP): Promise<void> {
  const start = Date.now();
  await cdp.send("Page.enable");
  await cdp.send("Page.reload");
  // Wait a moment for reload
  await new Promise((r) => setTimeout(r, 1000));
  console.log(ok("reloaded", Date.now() - start));
}

async function cmdScroll(cdp: CDP, direction: string): Promise<void> {
  const delta = direction === "up" ? -600 : 600;
  await cdp.evaluate(`window.scrollBy(0, ${delta})`);
  console.log(ok(`scrolled ${direction}`));
}

async function cmdScrollTo(
  cdp: CDP,
  selector: string,
  config: SlapwrightConfig
): Promise<void> {
  const start = Date.now();
  const el = await cdp.findElement(selector, {
    timeout: config.defaults.timeout,
    pollInterval: config.defaults.pollInterval,
  });
  await cdp.send("Runtime.callFunctionOn", {
    objectId: el.objectId,
    functionDeclaration: `function() {
      this.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }`,
    returnByValue: true,
  });
  console.log(ok(`scrolled to ${selector}`, Date.now() - start));
}

async function cmdWait(
  cdp: CDP,
  selector: string,
  timeout: number,
  config: SlapwrightConfig
): Promise<void> {
  const start = Date.now();
  await cdp.findElement(selector, {
    timeout,
    pollInterval: config.defaults.pollInterval,
  });
  console.log(ok(`found ${selector}`, Date.now() - start));
}

async function cmdWaitText(cdp: CDP, text: string, timeout: number): Promise<void> {
  const start = Date.now();
  const deadline = Date.now() + timeout;
  const escaped = text.replace(/'/g, "\\'");

  while (Date.now() < deadline) {
    const found = await cdp.evaluate(
      `document.body.innerText.toLowerCase().includes('${escaped.toLowerCase()}')`
    );
    if (found) {
      console.log(ok(`found "${text}"`, Date.now() - start));
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(fail(`text not found: "${text}" (${formatDuration(timeout)})`));
  process.exitCode = 1;
}

async function cmdWaitGone(
  cdp: CDP,
  selector: string,
  timeout: number,
  config: SlapwrightConfig
): Promise<void> {
  const start = Date.now();
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    try {
      await cdp.findElement(selector, { timeout: 200, pollInterval: 100 });
      // Still there
      await new Promise((r) => setTimeout(r, 300));
    } catch {
      console.log(ok(`gone: ${selector}`, Date.now() - start));
      return;
    }
  }

  console.log(fail(`still visible: ${selector} (${formatDuration(timeout)})`));
  process.exitCode = 1;
}

async function cmdWaitUrl(cdp: CDP, pattern: string, timeout: number): Promise<void> {
  const start = Date.now();
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const url = await cdp.getCurrentUrl();
    if (url.includes(pattern)) {
      console.log(ok(`URL matches: ${url}`, Date.now() - start));
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(fail(`URL never matched "${pattern}" (${formatDuration(timeout)})`));
  process.exitCode = 1;
}

async function cmdWaitNetwork(cdp: CDP, timeout: number): Promise<void> {
  const start = Date.now();
  await cdp.waitForNetworkIdle({ timeout, idleTime: 500 });
  console.log(ok("network idle", Date.now() - start));
}

async function cmdAssert(cdp: CDP, selector: string): Promise<void> {
  try {
    await cdp.findElement(selector, { timeout: 500, pollInterval: 100 });
    console.log(ok(`visible: ${selector}`));
  } catch {
    console.log(fail(`not visible: ${selector}`));
    process.exitCode = 1;
  }
}

async function cmdAssertText(cdp: CDP, text: string): Promise<void> {
  const escaped = text.replace(/'/g, "\\'");
  const found = await cdp.evaluate(
    `document.body.innerText.toLowerCase().includes('${escaped.toLowerCase()}')`
  );
  if (found) {
    console.log(ok(`visible: "${text}"`));
  } else {
    console.log(fail(`not visible: "${text}"`));
    process.exitCode = 1;
  }
}

async function cmdAssertNot(cdp: CDP, selector: string): Promise<void> {
  try {
    await cdp.findElement(selector, { timeout: 500, pollInterval: 100 });
    console.log(fail(`visible: ${selector} (expected not visible)`));
    process.exitCode = 1;
  } catch {
    console.log(ok(`not visible: ${selector}`));
  }
}

async function cmdAssertUrl(cdp: CDP, pattern: string): Promise<void> {
  const url = await cdp.getCurrentUrl();
  if (url.includes(pattern)) {
    console.log(ok(`URL matches: ${url}`));
  } else {
    console.log(fail(`URL "${url}" doesn't match "${pattern}"`));
    process.exitCode = 1;
  }
}

async function cmdAssertAll(cdp: CDP, selectors: string[]): Promise<void> {
  const results = await Promise.allSettled(
    selectors.map((s) => cdp.findElement(s, { timeout: 500 }))
  );

  const passed: string[] = [];
  const failed: string[] = [];
  for (let i = 0; i < selectors.length; i++) {
    if (results[i].status === "fulfilled") {
      passed.push(selectors[i]);
    } else {
      failed.push(selectors[i]);
    }
  }

  if (passed.length > 0) {
    console.log(ok(`visible: ${passed.join(", ")}`));
  }
  if (failed.length > 0) {
    console.log(fail(`not visible: ${failed.join(", ")}`));
  }
  console.log(`── ${passed.length}/${selectors.length} passed`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

const LAST_TREE_PATH = "/tmp/slapwright-last-tree.txt";

async function cmdPeek(cdp: CDP, config: SlapwrightConfig, filter?: TreeFilter, showDiff = false): Promise<void> {
  // Get URL, screenshot, and AX tree in parallel
  const [url, ssData, axNodes] = await Promise.all([
    cdp.getCurrentUrl(),
    cdp.screenshot(),
    cdp.getAXTree(),
  ]);

  // Save screenshot
  const ssDir = config.defaults.screenshotDir;
  const ssPath = resolve(ssDir, `slapwright-peek-${Date.now()}.png`);
  writeFileSync(ssPath, Buffer.from(ssData, "base64"));

  // Build tree — apply filter if provided
  let tree: string;
  if (filter && (filter.interactive || filter.section || filter.around)) {
    const filterable = toFilterable(axNodes);
    const filtered = filterTree(filterable, filter);
    tree = renderFilterable(filtered, 0);
  } else {
    tree = buildTree(axNodes);
  }

  // Parse URL path
  const urlObj = new URL(url);
  console.log(`\n📸 ${ssPath}`);
  console.log(`PAGE: ${urlObj.pathname}\n`);

  if (showDiff) {
    // Compare with previous tree
    let previousLines: string[] = [];
    try {
      if (existsSync(LAST_TREE_PATH)) {
        previousLines = readFileSync(LAST_TREE_PATH, "utf-8").split("\n");
      }
    } catch { /* no previous tree */ }

    const currentLines = tree.split("\n");
    const diffs = diffLines(previousLines, currentLines);
    console.log(formatDiff(diffs));
  } else {
    console.log(tree);
  }

  // Save current tree for future --diff comparison
  writeFileSync(LAST_TREE_PATH, tree);
}

/** Render FilterableNode[] to indented text lines. */
function renderFilterable(nodes: FilterableNode[], depth: number): string {
  const lines: string[] = [];
  for (const node of nodes) {
    if (node.renderedLine) {
      lines.push("  ".repeat(depth) + node.renderedLine);
    }
    if (node.children.length > 0) {
      const childDepth = node.renderedLine ? depth + 1 : depth;
      lines.push(renderFilterable(node.children, childDepth));
    }
  }
  return lines.join("\n");
}

async function cmdTree(cdp: CDP): Promise<void> {
  const [url, axNodes] = await Promise.all([
    cdp.getCurrentUrl(),
    cdp.getAXTree(),
  ]);
  const tree = buildTree(axNodes);
  const urlObj = new URL(url);
  console.log(`PAGE: ${urlObj.pathname}\n`);
  console.log(tree);
  writeFileSync(LAST_TREE_PATH, tree);
}

async function cmdScreenshot(cdp: CDP, config: SlapwrightConfig, name?: string): Promise<void> {
  const ssData = await cdp.screenshot();
  const ssDir = config.defaults.screenshotDir;
  const ssName = name ?? `slapwright-${Date.now()}`;
  const ssPath = resolve(ssDir, `${ssName}.png`);
  writeFileSync(ssPath, Buffer.from(ssData, "base64"));
  console.log(ssPath);
}

async function cmdSource(cdp: CDP): Promise<void> {
  const html = await cdp.evaluate("document.documentElement.outerHTML");
  console.log(html);
}

async function cmdInspect(cdp: CDP, selector: string, config: SlapwrightConfig): Promise<void> {
  const el = await cdp.findElement(selector, {
    timeout: config.defaults.timeout,
    pollInterval: config.defaults.pollInterval,
  });

  const details = await cdp.send("Runtime.callFunctionOn", {
    objectId: el.objectId,
    functionDeclaration: `function() {
      const cs = window.getComputedStyle(this);
      return {
        tag: this.tagName.toLowerCase(),
        id: this.id || null,
        className: this.className || null,
        text: this.textContent?.trim().slice(0, 100) || null,
        value: this.value || null,
        href: this.href || null,
        role: this.getAttribute('role') || this.computedRole || null,
        ariaLabel: this.getAttribute('aria-label') || null,
        testId: this.getAttribute('data-testid') || null,
        visible: cs.display !== 'none' && cs.visibility !== 'hidden',
        disabled: this.disabled || false,
        checked: this.checked || null,
        type: this.type || null,
        rect: this.getBoundingClientRect().toJSON(),
      };
    }`,
    returnByValue: true,
  }) as { result: { value: Record<string, unknown> } };

  const d = details.result.value;
  const lines: string[] = [];
  for (const [key, val] of Object.entries(d)) {
    if (val !== null && val !== undefined && val !== false && val !== "") {
      if (typeof val === "object") {
        lines.push(`${key}: ${JSON.stringify(val)}`);
      } else {
        lines.push(`${key}: ${val}`);
      }
    }
  }
  console.log(lines.join("\n"));
}

async function cmdFind(cdp: CDP, text: string): Promise<void> {
  const escaped = text.replace(/'/g, "\\'").replace(/\\/g, "\\\\");
  const results = await cdp.evaluate(`(() => {
    const search = '${escaped}'.toLowerCase();
    const found = [];
    const all = document.querySelectorAll('button, a, [role="button"], [role="link"], input, select, textarea, [data-testid], h1, h2, h3, h4, h5, h6, label');
    for (const el of all) {
      const text = (el.textContent || '').trim();
      const label = el.getAttribute('aria-label') || '';
      const testId = el.getAttribute('data-testid') || '';
      if (text.toLowerCase().includes(search) || label.toLowerCase().includes(search) || testId.toLowerCase().includes(search)) {
        found.push({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || null,
          testId: testId || null,
          text: text.slice(0, 80),
          ariaLabel: label || null,
        });
      }
    }
    return found;
  })()`) as Array<Record<string, string | null>>;

  if (results && results.length > 0) {
    console.log(ok(`found ${results.length} match(es) for "${text}"`));
    for (const r of results) {
      const parts: string[] = [];
      if (r.testId) parts.push(`@${r.testId}`);
      if (r.role) parts.push(r.role);
      else parts.push(r.tag!);
      if (r.text) parts.push(`"${r.text}"`);
      if (r.ariaLabel) parts.push(`aria-label="${r.ariaLabel}"`);
      console.log(`  ${parts.join(" ")}`);
    }
  } else {
    console.log(fail(`no matches for "${text}"`));
    process.exitCode = 1;
  }
}

async function cmdConsole(cdp: CDP, level: string): Promise<void> {
  // Enable console and listen for a moment
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");

  // Get existing console messages via Runtime.evaluate
  const messages = await cdp.evaluate(`(() => {
    return window.__slapwright_console || [];
  })()`) as Array<{ level: string; text: string }>;

  if (messages && messages.length > 0) {
    for (const msg of messages) {
      if (shouldShowLevel(msg.level, level)) {
        console.log(`[${msg.level}] ${msg.text}`);
      }
    }
  } else {
    console.log(info("no console messages captured"));
    console.log(info("tip: run 'slapwright peek' first to start capturing"));
  }
}

function shouldShowLevel(msgLevel: string, filterLevel: string): boolean {
  const levels = ["error", "warning", "info", "debug"];
  return levels.indexOf(msgLevel) <= levels.indexOf(filterLevel);
}

async function cmdFormState(cdp: CDP): Promise<void> {
  const formData = await cdp.evaluate(`(() => {
    const els = document.querySelectorAll('input, select, textarea, [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"]');
    return Array.from(els).map(el => {
      const testId = el.getAttribute('data-testid');
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute('type') || tag;
      const role = el.getAttribute('role') || type;
      const label = el.getAttribute('aria-label') || el.closest('label')?.textContent?.trim() || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const checked = el.checked ?? el.getAttribute('aria-checked') === 'true';
      const disabled = el.disabled ?? el.getAttribute('aria-disabled') === 'true';
      return {
        testId: testId || null,
        role,
        label,
        value: el.value || '',
        placeholder,
        checked: (type === 'checkbox' || type === 'radio' || role === 'switch') ? checked : undefined,
        disabled,
      };
    });
  })()`) as Array<{
    testId: string | null;
    role: string;
    label: string;
    value: string;
    placeholder: string;
    checked?: boolean;
    disabled: boolean;
  }>;

  if (!formData || formData.length === 0) {
    console.log(info("no form elements found"));
    return;
  }

  for (const el of formData) {
    const id = el.testId ? `@${el.testId}` : "(no testID)";
    let line = `${id} ${el.role}`;
    if (el.label) line += ` "${el.label}"`;
    if (el.value) line += ` = "${el.value}"`;
    if (el.placeholder && !el.value) line += ` [placeholder="${el.placeholder}"]`;
    if (el.checked !== undefined) line += el.checked ? " [checked]" : "";
    if (el.disabled) line += " (disabled)";
    console.log(line);
  }
  console.log(`── ${formData.length} form element${formData.length === 1 ? "" : "s"}`);
}

async function cmdLogin(cdp: CDP, config: SlapwrightConfig, email?: string, password?: string, otp?: string): Promise<void> {
  const start = Date.now();
  const e = email ?? config.login.email;
  const p = password ?? config.login.password;
  const o = otp ?? config.login.otp;
  const selectors = config.login.selectors;

  console.log(info(`logging in as ${e}...`));

  // Navigate to login
  const loginUrl = `${config.baseUrl}${config.login.url}`;
  await cdp.navigate(loginUrl);
  await new Promise((r) => setTimeout(r, 500));

  // Type email
  await cdp.type(selectors.email, e, { timeout: config.defaults.timeout, pollInterval: config.defaults.pollInterval });
  console.log(ok("entered email"));

  // Type password
  await cdp.type(selectors.password, p, { timeout: config.defaults.timeout, pollInterval: config.defaults.pollInterval });
  console.log(ok("entered password"));

  // Click submit
  await cdp.click(selectors.submit, { timeout: config.defaults.timeout, pollInterval: config.defaults.pollInterval });
  console.log(ok("submitted"));

  // Wait for OTP inputs or dashboard
  await new Promise((r) => setTimeout(r, 1000));

  // Enter OTP if configured
  if (o && selectors.otpInputs) {
    await cmdOtp(cdp, o, selectors.otpInputs);
    // Click verify button after OTP entry
    try {
      await cdp.click('role:button "Verify"', { timeout: 3000, pollInterval: 200 });
      console.log(ok("verified OTP"));
    } catch {
      // Verify button may not exist if auto-verify is enabled
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Wait for dashboard
  if (selectors.dashboard) {
    await cdp.findElement(selectors.dashboard, {
      timeout: 15000,
      pollInterval: config.defaults.pollInterval,
    });
  }

  console.log(ok(`logged in as ${e}`, Date.now() - start));
}

async function cmdChain(
  args: string[],
  cdp: CDP,
  config: SlapwrightConfig
): Promise<void> {
  for (const cmdStr of args) {
    const parts = cmdStr.trim().split(/\s+/);
    const subcmd = parts[0];
    const subargs = parts.slice(1);
    console.log(info(`→ ${cmdStr}`));
    await routeCommand(subcmd, subargs, cdp, config);
    if (process.exitCode && Number(process.exitCode) > 0) {
      console.log(fail(`chain stopped at: ${cmdStr}`));
      return;
    }
  }
}

// ── Command Router ──

async function routeCommand(
  command: string,
  args: string[],
  cdp: CDP,
  config: SlapwrightConfig
): Promise<void> {
  switch (command) {
    case "session":
      return cmdSession(cdp);
    case "status":
      return cmdStatus(cdp);

    case "navigate":
    case "nav":
    case "goto":
      if (!args[0]) throw new Error("Usage: slapwright navigate <url>");
      return cmdNavigate(cdp, args[0], config);
    case "back":
      return cmdBack(cdp);
    case "reload":
      return cmdReload(cdp);

    case "tap":
    case "click":
      if (!args[0]) throw new Error("Usage: slapwright tap <selector>");
      return cmdTap(cdp, args[0], config);
    case "type":
      if (!args[0] || !args[1]) throw new Error("Usage: slapwright type <selector> <text>");
      return cmdType(cdp, args[0], args.slice(1).join(" "), config);
    case "select":
      if (!args[0] || !args[1]) throw new Error("Usage: slapwright select <selector> <value>");
      return cmdSelect(cdp, args[0], args.slice(1).join(" "), config);
    case "check":
      if (!args[0]) throw new Error("Usage: slapwright check <selector>");
      return cmdCheck(cdp, args[0], config);
    case "uncheck":
      if (!args[0]) throw new Error("Usage: slapwright uncheck <selector>");
      return cmdUncheck(cdp, args[0], config);
    case "otp":
      if (!args[0]) throw new Error("Usage: slapwright otp <digits>");
      return cmdOtp(cdp, args[0], config.login.selectors.otpInputs);

    case "scroll":
      if (!args[0]) throw new Error("Usage: slapwright scroll <up|down>");
      return cmdScroll(cdp, args[0]);
    case "scroll-to":
      if (!args[0]) throw new Error("Usage: slapwright scroll-to <selector>");
      return cmdScrollTo(cdp, args[0], config);

    case "wait":
      if (!args[0]) throw new Error("Usage: slapwright wait <selector> [timeout]");
      return cmdWait(cdp, args[0], args[1] ? parseInt(args[1]) : config.defaults.timeout, config);
    case "wait-text":
      if (!args[0]) throw new Error('Usage: slapwright wait-text "<text>" [timeout]');
      return cmdWaitText(cdp, args.join(" "), args[1] ? parseInt(args[args.length - 1]) : config.defaults.timeout);
    case "wait-gone":
      if (!args[0]) throw new Error("Usage: slapwright wait-gone <selector> [timeout]");
      return cmdWaitGone(cdp, args[0], args[1] ? parseInt(args[1]) : config.defaults.timeout, config);
    case "wait-url":
      if (!args[0]) throw new Error("Usage: slapwright wait-url <pattern> [timeout]");
      return cmdWaitUrl(cdp, args[0], args[1] ? parseInt(args[1]) : config.defaults.timeout);
    case "wait-network":
      return cmdWaitNetwork(cdp, args[0] ? parseInt(args[0]) : config.defaults.timeout);

    case "assert":
      if (!args[0]) throw new Error("Usage: slapwright assert <selector>");
      return cmdAssert(cdp, args[0]);
    case "assert-text":
      if (!args[0]) throw new Error('Usage: slapwright assert-text "<text>"');
      return cmdAssertText(cdp, args.join(" "));
    case "assert-not":
      if (!args[0]) throw new Error("Usage: slapwright assert-not <selector>");
      return cmdAssertNot(cdp, args[0]);
    case "assert-url":
      if (!args[0]) throw new Error("Usage: slapwright assert-url <pattern>");
      return cmdAssertUrl(cdp, args[0]);
    case "assert-all":
      if (args.length === 0) throw new Error("Usage: slapwright assert-all <selector1> <selector2> ...");
      return cmdAssertAll(cdp, args);

    case "peek": {
      const { flags: peekFlags } = parseFlags(args, ["interactive", "section", "around", "diff"]);
      const peekFilter: TreeFilter = {};
      if (peekFlags.interactive) peekFilter.interactive = true;
      if (typeof peekFlags.section === "string") peekFilter.section = peekFlags.section;
      if (typeof peekFlags.around === "string") peekFilter.around = peekFlags.around;
      return cmdPeek(cdp, config, peekFilter, !!peekFlags.diff);
    }
    case "tree":
      return cmdTree(cdp);
    case "screenshot":
      return cmdScreenshot(cdp, config, args[0]);
    case "source":
      return cmdSource(cdp);
    case "inspect":
      if (!args[0]) throw new Error("Usage: slapwright inspect <selector>");
      return cmdInspect(cdp, args[0], config);
    case "find":
      if (!args[0]) throw new Error('Usage: slapwright find "<text>"');
      return cmdFind(cdp, args.join(" "));
    case "console":
      return cmdConsole(cdp, args[0] ?? "info");
    case "form-state":
      return cmdFormState(cdp);

    case "login":
      return cmdLogin(cdp, config, args[0], args[1], args[2]);
    case "chain":
      return cmdChain(args, cdp, config);

    default:
      console.log(fail(`unknown command: ${command}`));
      printHelp();
      process.exitCode = 2;
  }
}

function printHelp(): void {
  console.log(`
Usage: slapwright <command> [args...]

Navigation:
  navigate <url>             Go to URL (relative or absolute)
  back                       Browser back
  reload                     Reload page
  wait-url <pattern> [ms]    Wait for URL to match

Interaction:
  tap <selector>             Click element
  type <selector> <text>     Type into input
  select <selector> <value>  Choose dropdown option
  check <selector>           Check checkbox
  uncheck <selector>         Uncheck checkbox
  otp <digits>               OTP digits into numeric inputs
  scroll <up|down>           Scroll page
  scroll-to <selector>       Scroll element into view

Waiting:
  wait <selector> [ms]       Wait for element visible
  wait-text "<text>" [ms]    Wait for text on page
  wait-gone <selector> [ms]  Wait for element gone
  wait-network [ms]          Wait for network idle

Assertions (exit 0 or 1):
  assert <selector>          Visible → 0, not → 1
  assert-text "<text>"       Text on page → 0
  assert-not <selector>      NOT visible → 0
  assert-url <pattern>       URL matches → 0
  assert-all <s1> <s2> ...   Batch assert visibility

Inspection:
  peek [flags]               Screenshot + element tree
    --interactive            Only interactive elements
    --section <testID>       Only subtree under testID
    --around <testID>        Target + parent + siblings
    --diff                   Show changes since last peek
  tree                       Element tree (no screenshot)
  screenshot [name]          Screenshot only
  source                     Page HTML
  inspect <selector>         Element details
  find "<text>"              Find elements by text
  console [level]            Console messages
  form-state                 Dump all form element values

Session:
  session                    Connect to Chrome
  status                     Check connection
  login [email] [pass] [otp] Full login flow
  chain "cmd1" "cmd2" ...    Sequential commands

Selectors:
  @testid                    data-testid attribute
  role:button "Save"         Accessibility role + name
  label:Email                aria-label or <label> match
  #id                        Element ID
  .class                     CSS class
  "text"                     Text content match`);
}

// ── Main ──

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    console.log("slapwright v1.0.0 — Lightning-fast web testing for AI agents");
    printHelp();
    return;
  }

  if (command === "help") {
    printHelp();
    return;
  }

  const config = loadConfig();
  const sessionStore = createFileSessionStore();
  const wsFactory = createWSFactory();

  const cdp = createCDP({
    port: config.chromePort,
    fetchFn: globalThis.fetch,
    wsFactory,
    sessionStore,
  });

  // Auto-connect for all commands except 'session'
  if (command !== "session") {
    await cdp.connect();
  }

  await routeCommand(command, args, cdp, config);

  // Disconnect when done
  cdp.disconnect();
  process.exit(Number(process.exitCode ?? 0));
}

main().catch((err) => {
  if (err instanceof ElementNotFoundError) {
    console.log(fail(err.message));
    process.exit(1);
  } else {
    console.error(fail(err instanceof Error ? err.message : String(err)));
    process.exit(2);
  }
});
