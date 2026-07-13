// icons.tsx, the custom in-grid icon set (H3: zero platform emoji as UI glyphs).
// Every icon is decorative by default (aria-hidden); the accessible name lives on the parent
// control's text label, never on the icon alone.

export function IconPlay({ color = "#161311" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <polygon points="3,2 14,8 3,14" fill={color} />
    </svg>
  );
}
export function IconStop({ color = "#EDE4D3" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="3" width="10" height="10" rx="1.5" fill={color} />
    </svg>
  );
}
export function IconCheck({ color = "#EDE4D3" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <polyline points="2,9 6,13 14,3" fill="none" stroke={color} stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
export function IconCheckBig() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="12" fill="none" stroke="#7BD88F" stroke-width="2" />
      <polyline points="6,13 11,18 20,7" fill="none" stroke="#7BD88F" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
export function IconX() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="12" fill="none" stroke="#E88A7C" stroke-width="2" />
      <path d="M8 8 L18 18 M18 8 L8 18" stroke="#E88A7C" stroke-width="2.4" stroke-linecap="round" />
    </svg>
  );
}
export function IconRestart() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M14 5 A6 6 0 1 0 15 9" fill="none" stroke="#EDE4D3" stroke-width="2" stroke-linecap="round" />
      <polyline points="14,1 14,5 10,5" fill="none" stroke="#EDE4D3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
export function IconLock({ color = "#5b5348" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke={color} stroke-width="1.6" />
      <path d="M5 7 V5 a3 3 0 0 1 6 0 V7" fill="none" stroke={color} stroke-width="1.6" />
    </svg>
  );
}
export function IconUpArrow({ color = "#F5C2CE" }: { color?: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <polygon points="5,1 9,6 6,6 6,9 4,9 4,6 1,6" fill={color} />
    </svg>
  );
}
export function IconCoil({ size = 40, color = "#F5C2CE" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Snake ToolBox">
      <g fill="none" stroke={color} stroke-width="5" stroke-linecap="round">
        <path d="M24 8 a16 16 0 1 1 -0.1 0" />
        <path d="M24 16 a8 8 0 1 0 6 3" />
      </g>
      <circle cx="24" cy="24" r="3" fill={color} />
      <circle cx="8.2" cy="24" r="3.4" fill={color} />
      <circle cx="7.2" cy="22.6" r="1" fill="#161311" />
    </svg>
  );
}
export function IconSeal({ size = 44, metal = "#E0A54C", locked = false }: { size?: number; metal?: string; locked?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={locked ? "locked seal" : "seal"}>
      <polygon points="24,3 44,14 44,34 24,45 4,34 4,14" fill="#2A2420" stroke={metal} stroke-width="2.5" />
      <polygon points="24,11 36,18 36,30 24,37 12,30 12,18" fill="none" stroke={locked ? "#5b5348" : "#F5C2CE"} stroke-width="2" />
      {!locked && (
        <path d="M18 24 l4 4 8 -9" fill="none" stroke="#7BD88F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      )}
    </svg>
  );
}
export function IconStar({ size = 18, lit = false }: { size?: number; lit?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polygon
        points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9"
        fill={lit ? "#E0A54C" : "none"}
        stroke={lit ? "#E0A54C" : "#5b5348"}
        stroke-width="1.5"
      />
    </svg>
  );
}

// H3 fixes (2026-07-12 build-report pass): these four replace platform emoji (a warning-sign
// emoji, a floppy-disk emoji, an alembic emoji, and a print emoji) that had slipped in as quick
// placeholders in DegradedBootBanner, Durability, RestoreAndExpiry, and BossScreen. Zero platform
// emoji as UI glyphs is a banked hard rule; these are hand-authored to match the icon grid.
export function IconWarning({ size = 16, color = "#E0A54C" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 L22 20 H2 Z" fill="none" stroke={color} stroke-width="2" stroke-linejoin="round" />
      <rect x="11" y="9" width="2" height="6" fill={color} />
      <rect x="11" y="16.5" width="2" height="2" fill={color} />
    </svg>
  );
}
export function IconInstall({ size = 16, color = "#EDE4D3" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="3" width="16" height="16" rx="2" fill="none" stroke={color} stroke-width="1.8" />
      <path d="M12 7 v7 M9 11 l3 3 3 -3" fill="none" stroke={color} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <rect x="7" y="20" width="10" height="1.6" fill={color} />
    </svg>
  );
}
export function IconBackup({ size = 16, color = "#EDE4D3" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 18 a4 4 0 0 1 -1 -7.9 a5 5 0 0 1 9.6 -1.6 A3.5 3.5 0 0 1 17 18 Z"
        fill="none"
        stroke={color}
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <path d="M12 11 v6 M9.5 14.5 l2.5 2.5 2.5 -2.5" fill="none" stroke={color} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
/** Generic placeholder boss badge (the real per-boss emblem is Byleth/Simbo's authored asset,
 * L6/L7 "[TBD-AUTHORING]"); this renders the tier system's renderer honestly with no real art. */
export function IconBossBadge({ size = 40, color = "#E0A54C" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="boss emblem, placeholder pending authored art">
      <polygon points="24,4 42,15 42,33 24,44 6,33 6,15" fill="#2A2420" stroke={color} stroke-width="2.5" />
      <circle cx="24" cy="24" r="10" fill="none" stroke={color} stroke-width="2" />
      <path d="M18 24 h12 M24 18 v12" stroke={color} stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}
