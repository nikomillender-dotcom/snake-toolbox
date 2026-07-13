// tokenExpiryCapture (CONTRACT 3, backend B15). Captures the GitHub-Authentication-Token-Expiration
// response header on every api.github.com call and decides tokenExpiry() honestly.
//
// D3 (the one to get right): go-github issue 3708 reports the header returning the CURRENT SERVER
// TIME instead of the real expiry for some fine-grained PATs. Trusted blindly, daysLeft computes to
// ~0 on every call, a permanent false alarm. The signature of that bug: the captured expiresAt
// ADVANCES IN LOCKSTEP with real elapsed time between calls (because it IS "now" each time),
// whereas a real fixed future expiry stays constant while calls happen around it. The guard below
// compares consecutive observations: if the delta between captured expiresAt values is
// approximately equal to the real elapsed time between the calls that captured them, the source is
// untrustworthy for the rest of this tracker's life (captured stays false from then on; a single
// observation is not enough signal either way, so it is provisionally trusted until a second
// observation confirms stability or reveals the drift).
export interface TokenExpirySnapshot {
  expiresAt: number | null;
  daysLeft: number | null;
  captured: boolean;
}

const DRIFT_TOLERANCE_MS = 5_000; // clock/network jitter allowance

export class TokenExpiryTracker {
  private lastGoodExpiresAt: number | null = null;
  private lastCapturedAt: number | null = null;
  private distrusted = false;

  /**
   * Call once per api.github.com response. `headerValue` is the raw
   * GitHub-Authentication-Token-Expiration header string (or null/undefined if absent, e.g. a
   * fine-grained PAT created with no expiration, or a response that never carried it). `capturedAt`
   * is the real wall-clock time this observation was made (injectable for deterministic tests).
   */
  observe(headerValue: string | null | undefined, capturedAt: number): void {
    if (!headerValue) return; // no signal this call; does not itself distrust or clear prior state
    const parsed = Date.parse(headerValue);
    if (Number.isNaN(parsed)) return; // malformed header; ignore rather than guess

    if (!this.distrusted && this.lastGoodExpiresAt !== null && this.lastCapturedAt !== null) {
      const elapsedReal = capturedAt - this.lastCapturedAt;
      const elapsedExpiry = parsed - this.lastGoodExpiresAt;
      if (elapsedReal > 0 && Math.abs(elapsedExpiry - elapsedReal) <= DRIFT_TOLERANCE_MS) {
        this.distrusted = true;
      }
    }

    this.lastGoodExpiresAt = parsed;
    this.lastCapturedAt = capturedAt;
  }

  current(now: number): TokenExpirySnapshot {
    if (this.distrusted || this.lastGoodExpiresAt === null) {
      return { expiresAt: null, daysLeft: null, captured: false };
    }
    const daysLeft = Math.ceil((this.lastGoodExpiresAt - now) / 86_400_000);
    return { expiresAt: this.lastGoodExpiresAt, daysLeft, captured: true };
  }

  /** Serializes tracker state for persistence in the `githubMeta` Store collection (B15). */
  toJSON(): { lastGoodExpiresAt: number | null; lastCapturedAt: number | null; distrusted: boolean } {
    return {
      lastGoodExpiresAt: this.lastGoodExpiresAt,
      lastCapturedAt: this.lastCapturedAt,
      distrusted: this.distrusted,
    };
  }

  static fromJSON(data: {
    lastGoodExpiresAt: number | null;
    lastCapturedAt: number | null;
    distrusted: boolean;
  }): TokenExpiryTracker {
    const tracker = new TokenExpiryTracker();
    tracker.lastGoodExpiresAt = data.lastGoodExpiresAt;
    tracker.lastCapturedAt = data.lastCapturedAt;
    tracker.distrusted = data.distrusted;
    return tracker;
  }
}
