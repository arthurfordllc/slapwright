import { describe, it, expect } from "vitest";
import { AdaptivePoll, FixedPoll, pollUntil, PollTimeoutError } from "../src/polling.js";
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

describe("pollUntil", () => {
  it("resolves with the value once the condition returns non-null", async () => {
    let calls = 0;
    const result = await pollUntil(
      async () => (++calls >= 3 ? "ready" : null),
      { timeout: 1000, strategy: new FixedPoll(1) },
    );
    expect(result).toBe("ready");
    expect(calls).toBe(3);
  });

  it("throws PollTimeoutError carrying the description and last value on timeout", async () => {
    await expect(
      pollUntil(async () => null, {
        timeout: 20,
        strategy: new FixedPoll(5),
        description: "OTP inputs to appear",
      }),
    ).rejects.toThrow(/OTP inputs to appear/);
  });

  it("treats false as not-ready but returns other falsy condition values (0, empty string) as success", async () => {
    const zero = await pollUntil(async () => 0, { timeout: 100, strategy: new FixedPoll(1) });
    expect(zero).toBe(0);
    await expect(
      pollUntil(async () => false, { timeout: 15, strategy: new FixedPoll(5) }),
    ).rejects.toThrow(PollTimeoutError);
  });

  it("swallows condition errors while polling and surfaces the last one on timeout", async () => {
    await expect(
      pollUntil(
        async () => {
          throw new Error("evaluate exploded");
        },
        { timeout: 15, strategy: new FixedPoll(5), description: "thing" },
      ),
    ).rejects.toThrow(/evaluate exploded/);
  });
});
