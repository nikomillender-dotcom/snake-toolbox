// DegradedBootBanner, F5 BLOCKER / P1: honest visible banner when crossOriginIsolated is false
// (both SABs null, ready.inputCapable === false). input()/interrupt affordances are disabled
// elsewhere in the UI (RunBar/OutputStream read the same `inputCapable` flag); this banner is the
// human-readable half of that state, never a silent disable.

import { IconWarning } from "./icons";

export interface DegradedBootBannerProps {
  inputCapable: boolean;
}

export function DegradedBootBanner({ inputCapable }: DegradedBootBannerProps) {
  if (inputCapable) return null;
  return (
    <div class="banner warn" role="status">
      <IconWarning />
      <span>
        Some features need a secure setup that is not active right now. You can still read and run
        most code; typing input to a program is off until this is fixed.
      </span>
    </div>
  );
}
