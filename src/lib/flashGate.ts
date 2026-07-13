// flashGate.ts, the F16 BLOCKER: the ONE global flash-cooldown gate every celebration routes through.
//
// WCAG 2.3.1 forbids more than 3 flashes in any 1 second; the spec sets a stricter, unconditional
// ceiling of at most 2 visual transitions per second across the WHOLE app, enforced in code, for
// ALL users (not just reduced-motion), separate from the prefers-reduced-motion accommodation.
// Every celebration (boss VS BEGIN, victory mint-sweep, unit-complete mint, the promotion cutscene,
// the ship celebration) MUST call requestCelebration/fireWhenReady rather than animate directly, so
// chained auto-firing effects cannot stack past the ceiling even when each looks safe alone (the
// banked Meow Rush lesson, integration-overview.md I7).

export type CelebrationKind =
  | "bossVsIntro"
  | "bossVictory"
  | "unitMint"
  | "promotion"
  | "shipCelebration";

export class FlashCooldownGate {
  private fireTimes: number[] = [];

  constructor(private readonly maxPerWindow = 2, private readonly windowMs = 1000) {}

  private prune(now: number): void {
    this.fireTimes = this.fireTimes.filter((t) => now - t < this.windowMs);
  }

  canFire(now: number = Date.now()): boolean {
    this.prune(now);
    return this.fireTimes.length < this.maxPerWindow;
  }

  markFired(now: number = Date.now()): void {
    this.prune(now);
    this.fireTimes.push(now);
  }

  /** how many fires are currently counted in the trailing window (test/debug hook) */
  countInWindow(now: number = Date.now()): number {
    this.prune(now);
    return this.fireTimes.length;
  }

  reset(): void {
    this.fireTimes = [];
  }
}

/** The one global instance every screen shares. Do not construct a second gate; a per-screen gate
 * would defeat the whole point (chained celebrations across DIFFERENT screens must still share one
 * ceiling). */
export const globalFlashGate = new FlashCooldownGate(2, 1000);

export type CelebrationOutcome = "fired" | "deferred";

/**
 * Attempts to fire a celebration now. Returns "fired" if it ran, "deferred" if the ceiling is
 * currently full (the caller should retry, see fireWhenReady; never silently drop a celebration
 * the user earned, and never let it double-fire either).
 */
export function requestCelebration(
  _kind: CelebrationKind,
  fire: () => void,
  now: number = Date.now()
): CelebrationOutcome {
  if (globalFlashGate.canFire(now)) {
    globalFlashGate.markFired(now);
    fire();
    return "fired";
  }
  return "deferred";
}

/**
 * Fires a celebration as soon as the gate allows it, retrying on a short interval rather than
 * dropping it. Returns a cancel function.
 */
export function fireWhenReady(kind: CelebrationKind, fire: () => void, retryMs = 260): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const attempt = () => {
    if (cancelled) return;
    const outcome = requestCelebration(kind, fire);
    if (outcome === "deferred") {
      timer = setTimeout(attempt, retryMs);
    }
  };
  attempt();

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}
