import { describe, it, expect } from "vitest";
import { AdaptivePoll, FixedPoll } from "../src/polling.js";
import type { PollStrategy } from "../src/polling.js";

describe("PollStrategy interface", () => {
  it("AdaptivePoll and FixedPoll both satisfy PollStrategy", () => {
    const strategies: PollStrategy[] = [new AdaptivePoll(), new FixedPoll()];
    for (const s of strategies) {
      expect(typeof s.nextDelay).toBe("function");
      expect(typeof s.reset).toBe("function");
    }
  });
});

describe("AdaptivePoll", () => {
  it("starts at initial delay and doubles each call", () => {
    const poll = new AdaptivePoll(50, 300);
    expect(poll.nextDelay()).toBe(50);
    expect(poll.nextDelay()).toBe(100);
    expect(poll.nextDelay()).toBe(200);
  });

  it("caps at maxDelay", () => {
    const poll = new AdaptivePoll(50, 300);
    poll.nextDelay(); // 50
    poll.nextDelay(); // 100
    poll.nextDelay(); // 200
    expect(poll.nextDelay()).toBe(300); // capped
    expect(poll.nextDelay()).toBe(300); // stays capped
    expect(poll.nextDelay()).toBe(300); // stays capped
  });

  it("uses defaults when no args provided", () => {
    const poll = new AdaptivePoll();
    expect(poll.nextDelay()).toBe(50);
  });

  it("resets to initial delay", () => {
    const poll = new AdaptivePoll(50, 300);
    poll.nextDelay(); // 50
    poll.nextDelay(); // 100
    poll.nextDelay(); // 200
    poll.reset();
    expect(poll.nextDelay()).toBe(50);
    expect(poll.nextDelay()).toBe(100);
  });

  it("handles initial equal to maxDelay", () => {
    const poll = new AdaptivePoll(300, 300);
    expect(poll.nextDelay()).toBe(300);
    expect(poll.nextDelay()).toBe(300);
  });

  it("handles initial greater than maxDelay by capping immediately", () => {
    const poll = new AdaptivePoll(500, 300);
    expect(poll.nextDelay()).toBe(500); // returns initial once
    expect(poll.nextDelay()).toBe(300); // then caps
  });
});

describe("FixedPoll", () => {
  it("always returns the same interval", () => {
    const poll = new FixedPoll(300);
    expect(poll.nextDelay()).toBe(300);
    expect(poll.nextDelay()).toBe(300);
    expect(poll.nextDelay()).toBe(300);
  });

  it("uses default 300ms when no arg provided", () => {
    const poll = new FixedPoll();
    expect(poll.nextDelay()).toBe(300);
  });

  it("reset is a no-op (interval stays the same)", () => {
    const poll = new FixedPoll(200);
    poll.nextDelay();
    poll.nextDelay();
    poll.reset();
    expect(poll.nextDelay()).toBe(200);
  });
});
