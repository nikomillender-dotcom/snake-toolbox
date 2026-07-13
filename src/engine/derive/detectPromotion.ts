// detectPromotion (CONTRACT 5, backend B9). A pure comparison the composition root calls to fire
// the loud job-change cutscene (integration I11). No I/O, deterministic.
import type { PhaseId } from "../../contracts.js";

export function detectPromotion(
  prevPhase: PhaseId,
  nextPhase: PhaseId,
): { promoted: boolean; from: PhaseId; to: PhaseId } {
  return { promoted: nextPhase > prevPhase, from: prevPhase, to: nextPhase };
}
