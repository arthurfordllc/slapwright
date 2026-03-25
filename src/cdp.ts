/**
 * CDP WebSocket client — connect, send, receive, session management.
 *
 * Factory pattern with DI for testability:
 *   createCDP({ port, fetchFn, wsFactory, sessionStore }) → CDPClient
 */

import { EventEmitter } from "events";
import { parseSelector, selectorToExpression } from "./selector.js";
import type { AXNode } from "./tree.js";
import { AdaptivePoll, FixedPoll, type PollStrategy } from "./polling.js";
import { closestMatches } from "./fuzzy.js";

// ── Types ──

export interface CDPConfig {
  port: number;
  fetchFn?: typeof fetch;
  wsFactory: WSFactory;
  sessionStore: SessionStore;
}

export interface SessionData {
  wsUrl: string;
  port: number;
  createdAt: string;
}

export interface SessionStore {
  read(): Promise<SessionData | null>;
  write(session: SessionData): Promise<void>;
  clear(): Promise<void>;
}

export type WSFactory = (url: string) => WSLike;

export interface WSLike extends EventEmitter {
  readyState: number;
  send(data: string): void;
  close(): void;
}

export interface ElementRef {
  objectId: string;
  className?: string;
}

export interface FindOptions {
  timeout?: number;
  pollInterval?: number;
  pollStrategy?: PollStrategy;
}

export interface NetworkIdleOptions {
  timeout?: number;
  idleTime?: number;
}

export interface CDPClient {
  connect(): Promise<void>;
  disconnect(): void;
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  navigate(url: string): Promise<void>;
  screenshot(): Promise<string>;
  getAXTree(): Promise<AXNode[]>;
  evaluate(expression: string): Promise<unknown>;
  findElement(selector: string, opts?: FindOptions): Promise<ElementRef>;
  click(selector: string, opts?: FindOptions): Promise<void>;
  type(selector: string, text: string, opts?: FindOptions): Promise<void>;
  getCurrentUrl(): Promise<string>;
  on(event: string, handler: (params: unknown) => void): void;
  off(event: string, handler: (params: unknown) => void): void;
  waitForNetworkIdle(opts?: NetworkIdleOptions): Promise<void>;
}

// ── Errors ──

export class CDPError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CDPError";
  }
}

export class ElementNotFoundError extends CDPError {
  constructor(selector: string, suggestions?: string[], visibleIds?: string[]) {
    let msg = `Element not found: "${selector}" — timed out waiting`;
    if (suggestions && suggestions.length > 0) {
      msg += `\n  did you mean: ${suggestions.join(", ")}`;
    }
    if (visibleIds && visibleIds.length > 0) {
      msg += `\n  visible: ${visibleIds.join(", ")}`;
    }
    super(msg);
    this.name = "ElementNotFoundError";
  }
}

// ── Factory ──

export function createCDP(config: CDPConfig): CDPClient {
  const { port, wsFactory, sessionStore } = config;
  const fetchFn = config.fetchFn ?? globalThis.fetch;

  let ws: WSLike | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const eventListeners = new Map<string, ((params: unknown) => void)[]>();

  // ── Internal helpers ──

  function onMessage(raw: string) {
    const msg = JSON.parse(raw);

    // CDP response (has id)
    if ("id" in msg) {
      const handler = pending.get(msg.id);
      if (handler) {
        pending.delete(msg.id);
        if (msg.error) {
          handler.reject(new CDPError(msg.error.message));
        } else {
          handler.resolve(msg.result);
        }
      }
      return;
    }

    // CDP event (has method)
    if ("method" in msg) {
      const listeners = eventListeners.get(msg.method);
      if (listeners) {
        for (const listener of listeners) {
          listener(msg.params);
        }
      }
    }
  }

  function addEventListener(method: string, handler: (params: unknown) => void) {
    const list = eventListeners.get(method) ?? [];
    list.push(handler);
    eventListeners.set(method, list);
  }

  function removeEventListener(method: string, handler: (params: unknown) => void) {
    const list = eventListeners.get(method);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  // ── Public API ──

  async function connect(): Promise<void> {
    // Try cached session first
    const cached = await sessionStore.read();
    if (cached) {
      try {
        ws = wsFactory(cached.wsUrl);
        await waitForOpen(ws);
        ws.on("message", (data: string) => onMessage(data));
        return;
      } catch {
        // Cached session stale, fall through to discovery
        await sessionStore.clear();
      }
    }

    // Discover via HTTP — get page target (not browser-level)
    let wsUrl: string;
    try {
      const resp = await fetchFn(`http://localhost:${port}/json`);
      const targets = await resp.json() as Array<{ type: string; webSocketDebuggerUrl: string }>;
      const page = targets.find(t => t.type === "page");
      if (!page) {
        throw new Error("No page targets found");
      }
      wsUrl = page.webSocketDebuggerUrl;
    } catch (err) {
      if (err instanceof CDPError) throw err;
      throw new CDPError(`Chrome not running on port ${port}. Start Chrome with --remote-debugging-port=${port}`);
    }

    ws = wsFactory(wsUrl);
    await waitForOpen(ws);
    ws.on("message", (data: string) => onMessage(data));

    // Save session
    await sessionStore.write({
      wsUrl,
      port,
      createdAt: new Date().toISOString(),
    });
  }

  function disconnect(): void {
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  async function send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!ws) throw new CDPError("Not connected");

    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  async function navigate(url: string): Promise<void> {
    // Enable page events
    await send("Page.enable");

    // Set up load listener before navigating
    const loadPromise = new Promise<void>((resolve) => {
      const handler = () => {
        removeEventListener("Page.loadEventFired", handler);
        resolve();
      };
      addEventListener("Page.loadEventFired", handler);
    });

    await send("Page.navigate", { url });
    await loadPromise;
  }

  async function screenshot(): Promise<string> {
    const result = await send("Page.captureScreenshot", { format: "png" }) as { data: string };
    return result.data;
  }

  async function getAXTree(): Promise<AXNode[]> {
    const result = await send("Accessibility.getFullAXTree") as { nodes: AXNode[] };
    return result.nodes;
  }

  async function evaluate(expression: string): Promise<unknown> {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    }) as {
      result: { type: string; value?: unknown; subtype?: string };
      exceptionDetails?: { text: string };
    };

    if (result.exceptionDetails) {
      throw new CDPError(result.exceptionDetails.text);
    }

    return result.result.value;
  }

  async function findElement(selector: string, opts: FindOptions = {}): Promise<ElementRef> {
    const { timeout = 5000 } = opts;
    const poller: PollStrategy = opts.pollStrategy
      ?? (opts.pollInterval != null ? new FixedPoll(opts.pollInterval) : new AdaptivePoll());
    const parsed = parseSelector(selector);
    const expression = selectorToExpression(parsed);

    poller.reset();
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = await send("Runtime.evaluate", {
        expression,
        returnByValue: false,
      }) as {
        result: {
          type: string;
          subtype?: string;
          objectId?: string;
          className?: string;
          value?: unknown;
        };
      };

      if (
        result.result.type === "object" &&
        result.result.subtype !== "null" &&
        result.result.objectId
      ) {
        return {
          objectId: result.result.objectId,
          className: result.result.className,
        };
      }

      await sleep(poller.nextDelay());
    }

    // Gather visible testIDs for error context
    let suggestions: string[] | undefined;
    let visibleIds: string[] | undefined;
    try {
      const nodes = await getAXTree();
      visibleIds = nodes
        .map((n) => n.properties?.find((p) => p.name === "data-testid")?.value?.value)
        .filter((v): v is string => typeof v === "string");
      // Extract the bare name from the selector for fuzzy matching (strip @ prefix)
      const queryName = selector.startsWith("@") ? selector.slice(1) : selector;
      suggestions = closestMatches(queryName, visibleIds);
    } catch {
      // If AX tree fetch fails, just throw without suggestions
    }

    throw new ElementNotFoundError(selector, suggestions, visibleIds);
  }

  async function click(selector: string, opts: FindOptions = {}): Promise<void> {
    const el = await findElement(selector, opts);
    await send("Runtime.callFunctionOn", {
      objectId: el.objectId,
      functionDeclaration: "function() { this.click(); }",
      returnByValue: true,
    });
  }

  async function typeText(selector: string, text: string, opts: FindOptions = {}): Promise<void> {
    const el = await findElement(selector, opts);

    // Focus and clear
    await send("Runtime.callFunctionOn", {
      objectId: el.objectId,
      functionDeclaration: `function() {
        this.focus();
        this.value = '';
        this.dispatchEvent(new Event('input', { bubbles: true }));
      }`,
      returnByValue: true,
    });

    // Insert text
    await send("Input.insertText", { text });
  }

  async function getCurrentUrl(): Promise<string> {
    return await evaluate("window.location.href") as string;
  }

  async function waitForNetworkIdle(opts: NetworkIdleOptions = {}): Promise<void> {
    const { timeout = 5000, idleTime = 500 } = opts;
    await send("Network.enable");

    const pending = new Set<string>();

    const onRequest = (params: unknown) => {
      const p = params as { requestId: string };
      pending.add(p.requestId);
    };
    const onResponse = (params: unknown) => {
      const p = params as { requestId: string };
      pending.delete(p.requestId);
    };
    const onFailed = (params: unknown) => {
      const p = params as { requestId: string };
      pending.delete(p.requestId);
    };

    addEventListener("Network.requestWillBeSent", onRequest);
    addEventListener("Network.responseReceived", onResponse);
    addEventListener("Network.loadingFailed", onFailed);

    try {
      await new Promise<void>((resolve, reject) => {
        const deadline = setTimeout(() => {
          clearInterval(check);
          resolve(); // resolve on timeout rather than reject — network "idle enough"
        }, timeout);

        let idleSince = Date.now();
        const check = setInterval(() => {
          if (pending.size === 0) {
            if (Date.now() - idleSince >= idleTime) {
              clearTimeout(deadline);
              clearInterval(check);
              resolve();
            }
          } else {
            idleSince = Date.now();
          }
        }, 50);
      });
    } finally {
      removeEventListener("Network.requestWillBeSent", onRequest);
      removeEventListener("Network.responseReceived", onResponse);
      removeEventListener("Network.loadingFailed", onFailed);
    }
  }

  return {
    connect,
    disconnect,
    send,
    navigate,
    screenshot,
    getAXTree,
    evaluate,
    findElement,
    click,
    type: typeText,
    getCurrentUrl,
    on: addEventListener,
    off: removeEventListener,
    waitForNetworkIdle,
  };
}

// ── Helpers ──

function waitForOpen(ws: WSLike): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === 1) {
      resolve();
      return;
    }
    ws.on("open", () => resolve());
    ws.on("error", (err: Error) => reject(err));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
