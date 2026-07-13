import { useEffect, useRef, useState } from "preact/hooks";
import type { PhaseId } from "../contracts";
import { SpriteImage } from "./SpriteImage";
import { PixelWord } from "./PixelWord";
import { useDialogFocus } from "../lib/useDialogFocus";
import { fireWhenReady } from "../lib/flashGate";

// PromotionCutscene, L7/DESIGN v0.3 L.6: fired by detectPromotion. Cross-dissolve the sprite region
// only, fly in new equipment, show the class-change card. P11: move focus in, trap, return on
// close. Reduced motion: new sprite appears already changed, static card, identical payload. F16:
// the reveal routes through the flash-cooldown gate.

export interface PromotionCutsceneProps {
  open: boolean;
  fromPhase: PhaseId;
  toPhase: PhaseId;
  fromClassName: string;
  toClassName: string;
  equipment: string[];
  line: string;
  reducedMotion?: boolean;
  onClose: () => void;
}

export function PromotionCutscene({ open, fromPhase, toPhase, fromClassName, toClassName, equipment, line, reducedMotion, onClose }: PromotionCutsceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [revealed, setRevealed] = useState(false);
  useDialogFocus({ open, containerRef, initialFocusRef: primaryRef });

  // P11 note: useDialogFocus's own mount-time focus-in fires the instant `open` flips true, but
  // the calm-then-loud beat means the primary button does not exist in the DOM yet at that exact
  // moment (the "..." calm state renders first). So focus explicitly once the card actually
  // reveals, rather than relying on the generic hook to catch a target that appears later.
  useEffect(() => {
    if (open && revealed) primaryRef.current?.focus();
  }, [open, revealed]);

  useEffect(() => {
    if (!open) {
      setRevealed(false);
      return;
    }
    if (reducedMotion) {
      setRevealed(true);
      return;
    }
    const cancel = fireWhenReady("promotion", () => setRevealed(true));
    return cancel;
  }, [open, reducedMotion]);

  if (!open) return null;

  return (
    <div class="dialog-overlay" role="presentation">
      <div
        ref={containerRef}
        class="dialog-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="promotion-heading"
        style={{ textAlign: "center", maxWidth: "440px" }}
      >
        {/* The accessible name (aria-labelledby="promotion-heading") must exist for the WHOLE
            time the dialog is open, including the brief calm beat before reveal, or a screen
            reader lands on an unnamed dialog. Visually hidden until revealed; reduced-motion
            skips the calm beat entirely so this is visible immediately in that path. */}
        <h2 id="promotion-heading" class={revealed ? "serif" : "serif visually-hidden"}>
          Class change, you are now a {toClassName}
        </h2>
        {!revealed ? (
          <div aria-hidden="true" style={{ color: "var(--dim)" }}>...</div>
        ) : (
          <>
            <PixelWord word="CLASS CHANGE" cell={5} color="#E0A54C" />
            <div style={{ margin: "10px 0" }}>
              <PixelWord word={fromClassName.toUpperCase()} cell={4} color="#B7AC97" />
              {" "}<PixelWord word="->" cell={6} color="#F5C2CE" />{" "}
              <PixelWord word={toClassName.toUpperCase()} cell={4} color="#F5C2CE" />
            </div>
            <div style={{ position: "relative", width: "128px", height: "160px", margin: "12px auto" }}>
              {!reducedMotion && <div style={{ position: "absolute", inset: 0, opacity: 0.001 }}><SpriteImage tier={fromPhase} scale={3} /></div>}
              <div style={{ position: "absolute", inset: 0 }}><SpriteImage tier={toPhase} scale={3} /></div>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap", margin: "10px 0" }}>
              {equipment.map((e) => (
                <span key={e} style={{ fontSize: "12px", color: "var(--brass)", border: "1px solid rgba(224,165,76,.4)", borderRadius: "20px", padding: "6px 12px" }}>{e}</span>
              ))}
            </div>
            <p class="serif">{line}</p>
            <div class="row" style={{ justifyContent: "center" }}>
              <button type="button" class="btn" onClick={onClose}>Keep going</button>
              <button type="button" class="btn btn-primary" ref={primaryRef} onClick={onClose}>See your sheet</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
