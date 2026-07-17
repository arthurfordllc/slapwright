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

/** Thrown when pollUntil exhausts its timeout without the condition passing. */
export class PollTimeoutError extends Error {
  constructor(description: string, timeout: number, lastError?: Error) {
    const cause = lastError ? ` (last error: ${lastError.message})` : "";
    super(`Timed out after ${timeout}ms waiting for ${description}${cause}`);
    this.name = "PollTimeoutError";
  }
}

export interface PollUntilOptions {
  timeout: number;
  strategy?: PollStrategy;
  /** Human phrase for the timeout message, e.g. "OTP inputs to appear". */
  description?: string;
}

/**
 * Poll an async condition until it returns something other than null,
 * undefined, or false. Condition errors are swallowed while time remains
 * (transient CDP evaluate failures) and surfaced in the timeout error.
 */
export async function pollUntil<T>(
  condition: () => Promise<T | null | undefined | false>,
  opts: PollUntilOptions,
): Promise<T> {
  const strategy = opts.strategy ?? new AdaptivePoll();
  const description = opts.description ?? "condition";
  const deadline = Date.now() + opts.timeout;
  strategy.reset();
  let lastError: Error | undefined;

  for (;;) {
    try {
      const value = await condition();
      if (value !== null && value !== undefined && value !== false) {
        return value as T;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (Date.now() >= deadline) {
      throw new PollTimeoutError(description, opts.timeout, lastError);
    }
    await new Promise((r) => setTimeout(r, strategy.nextDelay()));
  }
}
