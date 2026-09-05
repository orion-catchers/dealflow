/**
 * In-memory login attempt limiter (auth lane). Per-instance state: good enough
 * for the single-instance prototype deployment; a shared store is future work
 * and is called out in the PR, not silently assumed.
 *
 * Uses code UNAUTHENTICATED instead of a dedicated 429 so the shared error
 * envelope contract (blueprint §7) stays untouched; callers get
 * `details.retryAfterSeconds`.
 *
 * Deliberate tradeoff (review P1, accepted): keys are the email, so an attacker
 * who knows a victim's email can keep them locked out by submitting bad
 * passwords. IP-only keying breaks on shared networks and attacker keys rotate,
 * so the denial-of-service window is accepted for this single-tenant prototype
 * and documented here rather than hidden.
 */
import { ApiFailure } from "@/lib/api/respond";

export const MAX_FAILURES = 5;
export const WINDOW_MS = 10 * 60 * 1000;

interface Attempt {
  count: number;
  windowStart: number;
}

export interface RateClock {
  now(): number;
}

export class LoginRateLimiter {
  private readonly attempts = new Map<string, Attempt>();

  constructor(
    private readonly clock: RateClock = { now: () => Date.now() },
    private readonly maxFailures: number = MAX_FAILURES,
    private readonly windowMs: number = WINDOW_MS,
  ) {}

  assertAllowed(key: string): void {
    const attempt = this.attempts.get(key);
    if (!attempt) return;
    if (this.clock.now() - attempt.windowStart >= this.windowMs) {
      this.attempts.delete(key);
      return;
    }
    if (attempt.count >= this.maxFailures) {
      const retryAfterSeconds = Math.ceil(
        (attempt.windowStart + this.windowMs - this.clock.now()) / 1000,
      );
      throw new ApiFailure(
        "UNAUTHENTICATED",
        "Too many failed sign-in attempts; try again later",
        { retryAfterSeconds },
      );
    }
  }

  recordFailure(key: string): void {
    const now = this.clock.now();
    const attempt = this.attempts.get(key);
    if (!attempt || now - attempt.windowStart >= this.windowMs) {
      this.attempts.set(key, { count: 1, windowStart: now });
      return;
    }
    attempt.count += 1;
  }

  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }
}

export const loginRateLimiter = new LoginRateLimiter();
