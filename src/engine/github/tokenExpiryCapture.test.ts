import { describe, expect, it } from "vitest";
import { TokenExpiryTracker } from "./tokenExpiryCapture.js";

const T0 = new Date("2026-01-01T00:00:00.000Z").getTime();

describe("TokenExpiryTracker (B15, D3 sanity guard)", () => {
  it("captured:false with no observation yet", () => {
    const tracker = new TokenExpiryTracker();
    expect(tracker.current(T0)).toEqual({ expiresAt: null, daysLeft: null, captured: false });
  });

  it("a single observation of a real future expiry is provisionally trusted", () => {
    const tracker = new TokenExpiryTracker();
    const future = new Date("2026-06-01T00:00:00.000Z");
    tracker.observe(future.toISOString(), T0);
    const snapshot = tracker.current(T0);
    expect(snapshot.captured).toBe(true);
    expect(snapshot.expiresAt).toBe(future.getTime());
    expect(snapshot.daysLeft).toBeGreaterThan(0);
  });

  it("a STABLE expiry across two calls stays trusted (real fine-grained PAT behavior)", () => {
    const tracker = new TokenExpiryTracker();
    const future = new Date("2026-06-01T00:00:00.000Z").toISOString();
    tracker.observe(future, T0);
    tracker.observe(future, T0 + 60_000); // a minute later, same header value, same real gap != drift
    expect(tracker.current(T0 + 60_000).captured).toBe(true);
  });

  it("a header that TRACKS now (go-github 3708) is detected and distrusted from then on", () => {
    const tracker = new TokenExpiryTracker();
    // First call: header returns "now" (looks like a real future value in isolation).
    tracker.observe(new Date(T0).toISOString(), T0);
    // Second call, 10 minutes of real time later: header STILL returns "now" (the bug), i.e. its
    // value advanced by approximately the same 10 minutes that really elapsed.
    const tenMinutesLater = T0 + 10 * 60_000;
    tracker.observe(new Date(tenMinutesLater).toISOString(), tenMinutesLater);
    expect(tracker.current(tenMinutesLater)).toEqual({ expiresAt: null, daysLeft: null, captured: false });
  });

  it("once distrusted, NEVER flips back to captured:true even if a later call looks stable", () => {
    const tracker = new TokenExpiryTracker();
    tracker.observe(new Date(T0).toISOString(), T0);
    const tenMinutesLater = T0 + 10 * 60_000;
    tracker.observe(new Date(tenMinutesLater).toISOString(), tenMinutesLater); // triggers distrust
    // A later call with an identical value (which in isolation would look "stable")
    const twentyMinutesLater = T0 + 20 * 60_000;
    tracker.observe(new Date(tenMinutesLater).toISOString(), twentyMinutesLater);
    expect(tracker.current(twentyMinutesLater).captured).toBe(false);
  });

  it("ignores a missing header without clearing prior good state", () => {
    const tracker = new TokenExpiryTracker();
    const future = new Date("2026-06-01T00:00:00.000Z").toISOString();
    tracker.observe(future, T0);
    tracker.observe(null, T0 + 1000); // a call that sent no header at all
    expect(tracker.current(T0 + 1000).captured).toBe(true);
  });

  it("ignores a malformed header value", () => {
    const tracker = new TokenExpiryTracker();
    tracker.observe("not-a-date", T0);
    expect(tracker.current(T0).captured).toBe(false);
  });

  it("round-trips through toJSON/fromJSON for persistence in githubMeta", () => {
    const tracker = new TokenExpiryTracker();
    const future = new Date("2026-06-01T00:00:00.000Z").toISOString();
    tracker.observe(future, T0);
    const restored = TokenExpiryTracker.fromJSON(tracker.toJSON());
    expect(restored.current(T0)).toEqual(tracker.current(T0));
  });

  it("daysLeft goes negative for an already-expired token (the ship()/backupProgress() refusal signal)", () => {
    const tracker = new TokenExpiryTracker();
    const past = new Date("2025-01-01T00:00:00.000Z").toISOString();
    tracker.observe(past, T0);
    const snapshot = tracker.current(T0);
    expect(snapshot.captured).toBe(true);
    expect(snapshot.daysLeft).toBeLessThan(0);
  });
});
