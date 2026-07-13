import { useEffect, useRef } from "preact/hooks";
import type { RefObject } from "preact";

// useDialogFocus, the P11 dialog-discipline hook shared by every modal in the app: the promotion
// cutscene (L7), the ConflictSheet (L8), the Sandbox Restart confirm (L3/F20), the RestoreSheet
// (L14). On open: move focus INTO the dialog (a heading or the primary action). While open: TRAP
// Tab/Shift+Tab within it. On close: RETURN focus to the element that triggered it. Pair with
// aria-labelledby on the dialog's heading so a screen reader lands on a real name, not on <body>.

export interface UseDialogFocusOptions {
  open: boolean;
  containerRef: RefObject<HTMLElement>;
  /** focused first on open; falls back to the first focusable element in the container */
  initialFocusRef?: RefObject<HTMLElement>;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus({ open, containerRef, initialFocusRef }: UseDialogFocusOptions): void {
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusTo.current = (document.activeElement as HTMLElement) ?? null;

    const target = initialFocusRef?.current ?? containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    target?.focus();

    function onKeydown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      // NOTE: an earlier version filtered on `el.offsetParent !== null` to skip hidden elements,
      // but offsetParent is never computed in a headless/jsdom environment (always null there),
      // which silently collapsed this list to a single element and broke the trap under test.
      // The FOCUSABLE_SELECTOR already excludes disabled controls; that is enough for the trap's
      // job here.
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      returnFocusTo.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
