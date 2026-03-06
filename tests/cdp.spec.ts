import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCDP, type CDPClient, type WSFactory, type SessionStore } from "../src/cdp";
import { EventEmitter } from "events";

// Mock WebSocket that simulates CDP responses
class MockWebSocket extends EventEmitter {
  readyState = 1; // OPEN
  sent: string[] = [];

  constructor(public url: string) {
    super();
    // Simulate open event
    setTimeout(() => this.emit("open"), 0);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    this.emit("close");
  }

  // Test helper: simulate a CDP response
  respond(id: number, result: unknown) {
    this.emit("message", JSON.stringify({ id, result }));
  }

  // Test helper: simulate a CDP event
  event(method: string, params: unknown) {
    this.emit("message", JSON.stringify({ method, params }));
  }
}

// Mock fetch for CDP discovery — returns page target list
function mockFetch(wsUrl: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ type: "page", webSocketDebuggerUrl: wsUrl }],
  });
}

// Mock session store (in-memory)
function mockSessionStore(): SessionStore {
  let data: string | null = null;
  return {
    read: vi.fn(async () => data ? JSON.parse(data) : null),
    write: vi.fn(async (session) => { data = JSON.stringify(session); }),
    clear: vi.fn(async () => { data = null; }),
  };
}

describe("CDP client", () => {
  let ws: MockWebSocket;
  let wsFactory: WSFactory;
  let store: SessionStore;

  beforeEach(() => {
    ws = new MockWebSocket("ws://localhost:9222/devtools/page/ABC");
    wsFactory = vi.fn(() => ws) as unknown as WSFactory;
    store = mockSessionStore();
  });

  describe("connect", () => {
    it("discovers WebSocket URL via HTTP and connects", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10)); // Let ws open fire

      await connectPromise;

      expect(fetchMock).toHaveBeenCalledWith("http://localhost:9222/json");
      expect(wsFactory).toHaveBeenCalledWith("ws://localhost:9222/devtools/page/ABC");
    });

    it("saves session after connecting", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      expect(store.write).toHaveBeenCalledWith(
        expect.objectContaining({
          wsUrl: "ws://localhost:9222/devtools/page/ABC",
          port: 9222,
        })
      );
    });

    it("reuses session if available and WebSocket connects", async () => {
      // Pre-populate session
      await store.write({ wsUrl: "ws://localhost:9222/devtools/page/CACHED", port: 9222, createdAt: new Date().toISOString() });

      const ws2 = new MockWebSocket("ws://localhost:9222/devtools/page/CACHED");
      const factory2 = vi.fn(() => ws2) as unknown as WSFactory;
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/NEW");

      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory: factory2, sessionStore: store });
      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      // Should use cached URL, not fetch
      expect(factory2).toHaveBeenCalledWith("ws://localhost:9222/devtools/page/CACHED");
    });

    it("throws if Chrome is not running", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      await expect(cdp.connect()).rejects.toThrow(/Chrome.*9222/i);
    });
  });

  describe("send", () => {
    it("sends CDP command and returns result", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      // Send a command, then respond
      const resultPromise = cdp.send("Page.navigate", { url: "http://example.com" });
      await new Promise((r) => setTimeout(r, 5));

      // Parse the sent message to get the id
      const sent = JSON.parse(ws.sent[0]);
      expect(sent.method).toBe("Page.navigate");
      expect(sent.params).toEqual({ url: "http://example.com" });

      // Respond with matching id
      ws.respond(sent.id, { frameId: "main" });

      const result = await resultPromise;
      expect(result).toEqual({ frameId: "main" });
    });

    it("handles multiple concurrent commands", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      const p1 = cdp.send("DOM.getDocument", {});
      const p2 = cdp.send("Page.getFrameTree", {});
      await new Promise((r) => setTimeout(r, 5));

      const msg1 = JSON.parse(ws.sent[0]);
      const msg2 = JSON.parse(ws.sent[1]);

      // Respond out of order
      ws.respond(msg2.id, { frameTree: {} });
      ws.respond(msg1.id, { root: {} });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toEqual({ root: {} });
      expect(r2).toEqual({ frameTree: {} });
    });

    it("throws on CDP error response", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      const resultPromise = cdp.send("BadMethod", {});
      await new Promise((r) => setTimeout(r, 5));

      const sent = JSON.parse(ws.sent[0]);
      ws.emit("message", JSON.stringify({
        id: sent.id,
        error: { code: -32601, message: "Method not found" },
      }));

      await expect(resultPromise).rejects.toThrow("Method not found");
    });
  });

  describe("disconnect", () => {
    it("closes WebSocket connection", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      cdp.disconnect();
      expect(ws.readyState).toBe(3); // CLOSED
    });
  });

  describe("navigate", () => {
    it("sends Page.navigate and waits for Page.loadEventFired", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      const navPromise = cdp.navigate("http://localhost:3000/dashboard");
      await new Promise((r) => setTimeout(r, 5));

      // Enable page events
      const enableMsg = JSON.parse(ws.sent[0]);
      ws.respond(enableMsg.id, {});
      await new Promise((r) => setTimeout(r, 5));

      // Navigate command
      const navMsg = JSON.parse(ws.sent[1]);
      expect(navMsg.method).toBe("Page.navigate");
      ws.respond(navMsg.id, { frameId: "main" });

      // Fire load event
      ws.event("Page.loadEventFired", { timestamp: 12345 });

      await navPromise;
    });
  });

  describe("screenshot", () => {
    it("captures screenshot and returns base64 data", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      const ssPromise = cdp.screenshot();
      await new Promise((r) => setTimeout(r, 5));

      const sent = JSON.parse(ws.sent[0]);
      expect(sent.method).toBe("Page.captureScreenshot");
      ws.respond(sent.id, { data: "iVBOR...base64..." });

      const result = await ssPromise;
      expect(result).toBe("iVBOR...base64...");
    });
  });

  describe("getAXTree", () => {
    it("fetches accessibility tree nodes", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      const treePromise = cdp.getAXTree();
      await new Promise((r) => setTimeout(r, 5));

      const sent = JSON.parse(ws.sent[0]);
      expect(sent.method).toBe("Accessibility.getFullAXTree");

      const mockNodes = [
        { nodeId: "1", role: { type: "role", value: "WebArea" }, childIds: ["2"] },
        { nodeId: "2", role: { type: "role", value: "button" }, name: { type: "computedString", value: "OK" }, childIds: [] },
      ];
      ws.respond(sent.id, { nodes: mockNodes });

      const nodes = await treePromise;
      expect(nodes).toEqual(mockNodes);
    });
  });

  describe("evaluate", () => {
    it("evaluates JS expression and returns result", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      const evalPromise = cdp.evaluate("document.title");
      await new Promise((r) => setTimeout(r, 5));

      const sent = JSON.parse(ws.sent[0]);
      expect(sent.method).toBe("Runtime.evaluate");
      expect(sent.params.expression).toBe("document.title");

      ws.respond(sent.id, {
        result: { type: "string", value: "Dashboard" },
      });

      const result = await evalPromise;
      expect(result).toBe("Dashboard");
    });

    it("throws on evaluation exception", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      const evalPromise = cdp.evaluate("undefined.foo");
      await new Promise((r) => setTimeout(r, 5));

      const sent = JSON.parse(ws.sent[0]);
      ws.respond(sent.id, {
        exceptionDetails: {
          text: "TypeError: Cannot read properties of undefined",
        },
      });

      await expect(evalPromise).rejects.toThrow("TypeError");
    });
  });

  describe("findElement", () => {
    it("finds element using selector expression", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      const findPromise = cdp.findElement("@save-btn", { timeout: 100, pollInterval: 50 });
      await new Promise((r) => setTimeout(r, 5));

      const sent = JSON.parse(ws.sent[0]);
      expect(sent.method).toBe("Runtime.evaluate");
      // Should contain the testid query
      expect(sent.params.expression).toContain("data-testid");

      ws.respond(sent.id, {
        result: { type: "object", objectId: "obj-123", className: "HTMLButtonElement" },
      });

      const result = await findPromise;
      expect(result).toEqual(
        expect.objectContaining({ objectId: "obj-123" })
      );
    });

    it("throws ElementNotFoundError when element not found after timeout", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      const findPromise = cdp.findElement("@nonexistent", { timeout: 100, pollInterval: 50 });

      // Respond with null (not found) to every poll
      const respondNull = () => {
        if (ws.sent.length > 0) {
          const sent = JSON.parse(ws.sent[ws.sent.length - 1]);
          ws.respond(sent.id, {
            result: { type: "object", subtype: "null", value: null },
          });
        }
      };

      const interval = setInterval(respondNull, 30);

      await expect(findPromise).rejects.toThrow(/not found|timeout/i);
      clearInterval(interval);
    });
  });

  describe("click", () => {
    it("finds element and clicks it", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      const clickPromise = cdp.click("@save-btn", { timeout: 100, pollInterval: 50 });
      await new Promise((r) => setTimeout(r, 5));

      // First call: findElement (Runtime.evaluate with selector expression)
      const findMsg = JSON.parse(ws.sent[0]);
      ws.respond(findMsg.id, {
        result: { type: "object", objectId: "obj-456" },
      });
      await new Promise((r) => setTimeout(r, 10));

      // Second call: Runtime.callFunctionOn to click
      const clickMsg = JSON.parse(ws.sent[1]);
      expect(clickMsg.method).toBe("Runtime.callFunctionOn");
      expect(clickMsg.params.objectId).toBe("obj-456");
      ws.respond(clickMsg.id, { result: { type: "undefined" } });

      await clickPromise;
    });
  });

  describe("type", () => {
    it("finds element, focuses, clears, and types text", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      const typePromise = cdp.type("label:Email", "jane@test.com", { timeout: 100, pollInterval: 50 });
      await new Promise((r) => setTimeout(r, 5));

      // findElement
      const findMsg = JSON.parse(ws.sent[0]);
      ws.respond(findMsg.id, {
        result: { type: "object", objectId: "obj-789" },
      });
      await new Promise((r) => setTimeout(r, 10));

      // focus + clear (callFunctionOn)
      const focusMsg = JSON.parse(ws.sent[1]);
      expect(focusMsg.method).toBe("Runtime.callFunctionOn");
      ws.respond(focusMsg.id, { result: { type: "undefined" } });
      await new Promise((r) => setTimeout(r, 10));

      // insertText
      const typeMsg = JSON.parse(ws.sent[2]);
      expect(typeMsg.method).toBe("Input.insertText");
      expect(typeMsg.params.text).toBe("jane@test.com");
      ws.respond(typeMsg.id, {});

      await typePromise;
    });
  });

  describe("getCurrentUrl", () => {
    it("returns current page URL", async () => {
      const fetchMock = mockFetch("ws://localhost:9222/devtools/page/ABC");
      const cdp = createCDP({ port: 9222, fetchFn: fetchMock, wsFactory, sessionStore: store });

      const connectPromise = cdp.connect();
      await new Promise((r) => setTimeout(r, 10));
      await connectPromise;

      const urlPromise = cdp.getCurrentUrl();
      await new Promise((r) => setTimeout(r, 5));

      const sent = JSON.parse(ws.sent[0]);
      expect(sent.method).toBe("Runtime.evaluate");
      ws.respond(sent.id, {
        result: { type: "string", value: "http://localhost:3000/dashboard" },
      });

      const url = await urlPromise;
      expect(url).toBe("http://localhost:3000/dashboard");
    });
  });
});
