import { useEffect, useState } from "preact/hooks";
import type { ShipResult } from "../contracts";
import { IconSeal } from "./icons";
import { fireWhenReady } from "../lib/flashGate";

// ShipCelebration, L8/I11: the honesty split. "Artifact complete" is LOCAL truth (emblem mints
// immediately, offline or not, from a boss pass). "Live on GitHub" is NETWORK truth: only a `live`
// ShipResult with a URL shows the green "it's up". Offline/queued gets an honest queued line, never
// a fake green checkmark. F13: the offline-queue copy states the durability ceiling honestly.

export interface ShipCelebrationProps {
  open: boolean;
  artifactName: string;
  shipResult: ShipResult | null;
  attributionWarning?: boolean;
  reducedMotion?: boolean;
  onDismiss: () => void;
  onRenewToken?: () => void;
  /** Fires when the user taps "Ship to GitHub". Consent-gated: ship() fires ONLY
   *  on this explicit tap, never silently (O10/R11). */
  onShip?: () => void;
  shipping?: boolean;
}

export function ShipCelebration({ open, artifactName, shipResult, attributionWarning, reducedMotion, onDismiss, onRenewToken, onShip, shipping }: ShipCelebrationProps) {
  const [sweep, setSweep] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (reducedMotion) return;
    const cancel = fireWhenReady("shipCelebration", () => {
      setSweep(true);
      setTimeout(() => setSweep(false), 800);
    });
    return cancel;
  }, [open, reducedMotion]);

  if (!open) return null;

  return (
    <div class="dialog-overlay">
      <div class={`dialog-box${sweep ? " sweep" : ""}`} role="dialog" aria-modal="true" aria-labelledby="ship-heading" style={{ textAlign: "left", maxWidth: "440px" }}>
        <span aria-hidden="true"><IconSeal size={48} /></span>
        <h2 id="ship-heading" class="serif">Artifact complete: {artifactName}</h2>
        <p>That's a real, finished thing. It counts, whether or not GitHub has seen it yet.</p>

        {shipResult?.status === "live" && (
          <div class="banner info" role="status">
            Live on GitHub. <a href={shipResult.url} target="_blank" rel="noreferrer">See it -&gt;</a>
          </div>
        )}
        {shipResult?.status === "queued" && (
          <div class="banner warn" role="status">
            You're offline. I'll push this to GitHub the second you're back. (Note: a plain browser
            tab can lose a queued push after 7 days of no visits, re-shippable any time.)
          </div>
        )}
        {shipResult?.status === "conflict" && (
          <div class="banner warn" role="status">GitHub has a newer version there. We'll ask you how to reconcile it next.</div>
        )}
        {shipResult?.status === "needsReconnect" && (
          <div class="banner warn" role="alert">Your GitHub connection needs a refresh before this can ship.</div>
        )}
        {shipResult?.status === "expiredToken" && (
          <div class="banner warn" role="alert">
            Your GitHub key expired. Renew it (about a minute) and I'll finish shipping.
            {onRenewToken && <> <button type="button" class="btn btn-ghost btn-small" onClick={onRenewToken}>Renew now</button></>}
          </div>
        )}
        {attributionWarning && (
          <div class="banner warn" role="status">
            Heads up: this first ship may not count toward your public contribution graph (a commit
            author mismatch). Your project still shipped, just flagging the graph honestly.
          </div>
        )}
        <div class="row" style={{ display: "flex", gap: "10px" }}>
          {onShip && !shipResult && (
            <button type="button" class="btn btn-primary btn-small" onClick={onShip} disabled={shipping}>
              {shipping ? "Shipping..." : "Ship to GitHub"}
            </button>
          )}
          <button type="button" class={onShip && !shipResult ? "btn btn-ghost btn-small" : "btn btn-primary btn-small"} onClick={onDismiss}>
            {shipResult ? "Nice" : "Maybe later"}
          </button>
        </div>
      </div>
    </div>
  );
}
