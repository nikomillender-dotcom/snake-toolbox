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
  // grading-interaction-spec G13: the five comparison kinds disable Check independently of Run
  // (Run/Stop are hidden for them anyway, see hideRun/hideStop below), keyed off answer emptiness
  // rather than the general `disabled` flag. Falls back to `disabled` when unset, so every existing
  // call site (the hidden-test path) is unchanged.
  checkDisabled?: boolean;
  // predictOutput/traceTable/mcq/fillBlank/parsons have no "code to run" the way writeStub/fixBug/
  // boss do (G1: the prediction field is explicitly NOT the code editor); hide Run/RunFile/Stop for
  // those kinds rather than offering a Run button with nothing useful to run.
  hideRun?: boolean;
  hideStop?: boolean;
}

export function RunBar({
  running, onRun, onStop, onRunFile, onCheck, checkLabel = "Check", disabled, interruptCapable = true,
  checkDisabled, hideRun, hideStop,
}: RunBarProps) {
  const stopDisabled = !running || !interruptCapable;
  const checkIsDisabled = (checkDisabled ?? disabled ?? false) || running;
  return (
    <div class="run-bar">
      {!hideRun && (
        <button type="button" class="btn btn-primary" onClick={onRun} disabled={disabled || running}>
          <IconPlay /> Run
        </button>
      )}
      {!hideRun && onRunFile && (
        <button type="button" class="btn btn-small" onClick={onRunFile} disabled={disabled || running}>
          Run file
        </button>
      )}
      {!hideStop && (
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
      )}
      <div class="spacer" />
      {onCheck && (
        <button type="button" class="btn" onClick={onCheck} disabled={checkIsDisabled}>
          <IconCheck /> {checkLabel}
        </button>
      )}
    </div>
  );
}
