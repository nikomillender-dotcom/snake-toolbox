import { buildSpriteRects, SPRITE_TIERS } from "../lib/sprite";
import type { PhaseId } from "../contracts";

export interface SpriteImageProps {
  tier: PhaseId;
  scale: number;
  className?: string;
}

/** Renders one of the four sprite tiers (L6). Fails LOUD (a visible red banner), never silently,
 * on a malformed 40x32 grid, matching the mockup pack's self-check discipline. */
export function SpriteImage({ tier, scale, className }: SpriteImageProps) {
  const def = SPRITE_TIERS[tier];
  try {
    const { width, height, rects } = buildSpriteRects(def.runs, scale);
    return (
      <svg
        class={`pix${className ? ` ${className}` : ""}`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        shape-rendering="crispEdges"
        role="img"
        aria-label={def.label}
        dangerouslySetInnerHTML={{ __html: rects }}
      />
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (
      <div
        role="alert"
        style={{ background: "#E88A7C", color: "#161311", padding: "8px", fontFamily: "monospace", fontSize: "12px" }}
      >
        SPRITE {def.className} MALFORMED: {message}
      </div>
    );
  }
}
