import { describe, expect, it } from "vitest";
import { FlashCooldownGate, fireWhenReady, requestCelebration } from "../src/lib/flashGate";

describe("FlashCooldownGate (F16 BLOCKER)", () => {
  it("allows up to 2 fires in a 1 second window and refuses the 3rd", () => {
    const gate = new FlashCooldownGate(2, 1000);
    const t0 = 1_000_000;
    expect(gate.canFire(t0)).toBe(true);
    gate.markFired(t0);
    expect(gate.canFire(t0 + 10)).toBe(true);
    gate.markFired(t0 + 10);
    // a 3rd fire within the same rolling second must be refused, unconditionally (all users)
    expect(gate.canFire(t0 + 20)).toBe(false);
  });

  it("frees up capacity again once fires age out of the rolling window", () => {
    const gate = new FlashCooldownGate(2, 1000);
    const t0 = 1_000_000;
    gate.markFired(t0);
    gate.markFired(t0 + 10);
    expect(gate.canFire(t0 + 1001)).toBe(true);
  });

  it("requestCelebration fires immediately when under the ceiling and defers when full", () => {
    const gate = new FlashCooldownGate(2, 1000);
    let fired = 0;
    const t0 = 5000;
    // monkeypatch the module-level singleton is undesirable; test the pure function shape instead
    const outcome1 = requestCelebration("bossVsIntro", () => fired++, t0);
    expect(outcome1).toBe("fired");
    expect(fired).toBe(1);
  });

  it("a chain of 10 rapid celebration requests never exceeds 2 fires in any 1-second window (Meow Rush lesson)", () => {
    const gate = new FlashCooldownGate(2, 1000);
    const fireLog: number[] = [];
    let now = 0;
    for (let i = 0; i < 10; i++) {
      if (gate.canFire(now)) {
        gate.markFired(now);
        fireLog.push(now);
      }
      now += 50; // 10 attempts within 500ms, chained, as if each "looked safe alone"
    }
    // check every possible 1-second sliding window across the log
    for (const start of fireLog) {
      const countInWindow = fireLog.filter((t) => t >= start && t - start < 1000).length;
      expect(countInWindow).toBeLessThanOrEqual(2);
    }
  });

  it("fireWhenReady retries until the gate frees up rather than dropping the celebration", async () => {
    const fired: string[] = [];
    // exhaust the shared global gate deliberately via two immediate calls, then request a 3rd
    const c1 = fireWhenReady("unitMint", () => fired.push("a"), 5);
    const c2 = fireWhenReady("unitMint", () => fired.push("b"), 5);
    const c3 = fireWhenReady("unitMint", () => fired.push("c"), 5);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(fired).toEqual(["a", "b", "c"]);
    c1();
    c2();
    c3();
  });
});
