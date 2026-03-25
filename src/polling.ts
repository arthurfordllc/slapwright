/** Strategy interface for controlling poll timing in find-element loops. */
export interface PollStrategy {
  /** Returns ms to wait before next attempt. Called after each failed poll. */
  nextDelay(): number;
  /** Reset state for a new find operation. */
  reset(): void;
}

/** Starts fast, doubles each attempt, caps at maxDelay. */
export class AdaptivePoll implements PollStrategy {
  private current: number;

  constructor(
    private readonly initial = 50,
    private readonly maxDelay = 300,
  ) {
    this.current = initial;
  }

  nextDelay(): number {
    const delay = this.current;
    this.current = Math.min(this.current * 2, this.maxDelay);
    return delay;
  }

  reset(): void {
    this.current = this.initial;
  }
}

/** Fixed interval — backward-compatible with original behavior. */
export class FixedPoll implements PollStrategy {
  constructor(private readonly interval = 300) {}

  nextDelay(): number {
    return this.interval;
  }

  reset(): void {}
}
