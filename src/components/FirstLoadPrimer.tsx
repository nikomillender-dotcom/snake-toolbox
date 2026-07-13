// FirstLoadPrimer, L2/F15/P6: shown the FIRST time the app needs Pyodide, BEFORE the download
// starts. The real measured size comes from the composition root (backend B1's pinned-build
// measurement, integration I5); this component never hardcodes a stale figure. On a metered
// connection this is a CONSENT gate, not an auto-start. Once cached it never shows again.

export interface FirstLoadPrimerProps {
  open: boolean;
  sizeMb: number;
  isMetered: boolean;
  onDownloadNow: () => void;
  onWaitForWifi?: () => void;
}

export function FirstLoadPrimer({ open, sizeMb, isMetered, onDownloadNow, onWaitForWifi }: FirstLoadPrimerProps) {
  if (!open) return null;
  const size = Math.round(sizeMb);
  return (
    <div class="dialog-overlay" role="presentation">
      <div class="dialog-box" role="dialog" aria-modal="true" aria-labelledby="primer-heading">
        <h2 id="primer-heading" class="serif">Let's grab Python, once</h2>
        <p>
          This downloads Python once, about {size} MB. After that it runs offline, lessons, the
          editor, running code, all of it, even on a plane.
        </p>
        {isMetered ? (
          <>
            <p>Looks like you are on cellular. Download now, or wait for Wi-Fi?</p>
            <div class="row">
              <button type="button" class="btn btn-ghost" onClick={onWaitForWifi}>Wait for Wi-Fi</button>
              <button type="button" class="btn btn-primary" onClick={onDownloadNow}>Download now</button>
            </div>
          </>
        ) : (
          <div class="row">
            <button type="button" class="btn btn-primary" onClick={onDownloadNow}>Sounds good, let's go</button>
          </div>
        )}
      </div>
    </div>
  );
}
