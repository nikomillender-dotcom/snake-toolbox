// DegradedBootBanner, F5 BLOCKER / P1: honest visible banner when crossOriginIsolated is false
// (both SABs null, ready.inputCapable === false). input()/interrupt affordances are disabled
// elsewhere in the UI (RunBar/OutputStream read the same `inputCapable` flag); this banner is the
// human-readable half of that state, never a silent disable.
//
// Manager fix round (item 4, SF5 discipline): this used to `return null` until degraded, then
// mount fully formed with its message already baked into the same render. Lysithea's own banked
// lesson on this exact shape: a role="status" region that appears at the same instant it is filled
// with text is not reliably announced by VoiceOver, even though the identical markup announces
// correctly when the TEXT inside an already-present region changes. The fix is the same one
// CheckResult already uses (see LearnScreen.tsx's SF5 comment): keep ONE status element mounted
// from the first render always, and only ever change its text content and visibility class.

import { IconWarning } from "./icons";

export interface DegradedBootBannerProps {
  inputCapable: boolean;
}

export function DegradedBootBanner({ inputCapable }: DegradedBootBannerProps) {
  const degraded = !inputCapable;
  return (
    <div class={`banner warn${degraded ? "" : " visually-hidden"}`} role="status">
      <IconWarning aria-hidden="true" />
      <span>
        {degraded
          ? "input() is unavailable on this device. You can still read and run most code; typing input to a program is off until this is fixed."
          : ""}
      </span>
    </div>
  );
}
