import { IconCheck, IconPlay, IconStop } from "./icons";

// RunBar, L1/9: Run / Run file / Stop / Check, primary-action emphasis, Stop live-only-while-running.
// F5 BLOCKER: when the worker booted degraded (crossOriginIsolated false, ready.inputCapable
// false), Stop (the interrupt affordance) can never actually interrupt anything (no SAB), so it
// must be DISABLED outright rather than offered and silently do nothing. Default true so screens
// that do not pass it explicitly are not accidentally degraded.

export interface RunBarProps {
  running: boolean;
  onRun: () => void;
  onStop?: () => void;
  onRunFile?: () => void;
  onCheck?: () => void;
  checkLabel?: string;
  disabled?: boolean;
  interruptCapable?: boolean;
}

export function RunBar({ running, onRun, onStop, onRunFile, onCheck, checkLabel = "Check", disabled, interruptCapable = true }: RunBarProps) {
  const stopDisabled = !running || !interruptCapable;
  return (
    <div class="run-bar">
      <button type="button" class="btn btn-primary" onClick={onRun} disabled={disabled || running}>
        <IconPlay /> Run
      </button>
      {onRunFile && (
        <button type="button" class="btn btn-small" onClick={onRunFile} disabled={disabled || running}>
          Run file
        </button>
      )}
      <button
        type="button"
        class="btn"
        onClick={onStop}
        disabled={stopDisabled}
        aria-disabled={stopDisabled}
        title={!interruptCapable ? "Stop is off in this degraded setup; see the banner above." : undefined}
      >
        <IconStop /> Stop
      </button>
      <div class="spacer" />
      {onCheck && (
        <button type="button" class="btn" onClick={onCheck} disabled={disabled || running}>
          <IconCheck /> {checkLabel}
        </button>
      )}
    </div>
  );
}
