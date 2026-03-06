import { describe, it, expect } from "vitest";
import { ok, fail, info, formatDuration } from "../src/fmt";

describe("fmt", () => {
  describe("ok", () => {
    it("formats success message without duration", () => {
      expect(ok("tapped save-btn")).toBe("✓ tapped save-btn");
    });

    it("formats success message with duration in seconds", () => {
      expect(ok("tapped save-btn", 150)).toBe("✓ tapped save-btn (0.1s)");
    });

    it("formats success message with sub-100ms duration", () => {
      expect(ok("tapped save-btn", 42)).toBe("✓ tapped save-btn (0.0s)");
    });

    it("formats success message with multi-second duration", () => {
      expect(ok("found email-input", 3750)).toBe("✓ found email-input (3.8s)");
    });
  });

  describe("fail", () => {
    it("formats failure message", () => {
      expect(fail("not found: save-btn")).toBe("✗ not found: save-btn");
    });

    it("formats failure with context lines", () => {
      const result = fail("not found: save-btn (5.0s)", [
        "visible: email-input, password-input, login-button",
      ]);
      expect(result).toBe(
        "✗ not found: save-btn (5.0s)\n  visible: email-input, password-input, login-button"
      );
    });

    it("formats failure with multiple context lines", () => {
      const result = fail("element not interactable", [
        "testID: save-btn",
        "enabled: false",
      ]);
      expect(result).toBe(
        "✗ element not interactable\n  testID: save-btn\n  enabled: false"
      );
    });
  });

  describe("info", () => {
    it("formats info message", () => {
      expect(info("session: abc-123")).toBe("ℹ session: abc-123");
    });
  });

  describe("formatDuration", () => {
    it("formats milliseconds to seconds with one decimal", () => {
      expect(formatDuration(1500)).toBe("1.5s");
    });

    it("formats zero", () => {
      expect(formatDuration(0)).toBe("0.0s");
    });

    it("formats sub-second", () => {
      expect(formatDuration(250)).toBe("0.3s");
    });

    it("rounds to one decimal", () => {
      expect(formatDuration(1234)).toBe("1.2s");
    });
  });
});
