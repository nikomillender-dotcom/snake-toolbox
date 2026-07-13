import type { StatSheet } from "../contracts";
import { SpriteImage } from "./SpriteImage";
import { PixelWord } from "./PixelWord";
import { IconSeal, IconStar, IconUpArrow } from "./icons";

// StatScreen, L6 = DESIGN v0.3 section L: the calm FF5 character sheet. Reads deriveStatSheet's
// output only; never computes a stat itself. P10: changedSince carries real accessible text, never
// icon+color alone. P13: characterName/characterEpithet render as TEXT, never markup.

export interface StatScreenProps {
  sheet: StatSheet;
  onBecome?: () => void;
}

function SegBar({ value, max }: { value: number; max: number }) {
  const n = 10;
  const on = Math.round((value / max) * n);
  return (
    <div class="segbar" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => <span key={i} class={i < on ? "on" : ""} />)}
    </div>
  );
}

export function StatScreen({ sheet, onBecome }: StatScreenProps) {
  return (
    <div class="stat-sheet">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--line)", background: "#1b1613" }}>
        <PixelWord word="SNAKE TOOLBOX" cell={4} color="#F5C2CE" />
        <span class="dim-label">character sheet</span>
      </div>

      <div class="stat-hero">
        <div class="stat-portrait">
          <SpriteImage tier={sheet.spriteTier} scale={4} />
          <div class="dim-label" style={{ textAlign: "center", marginTop: "6px" }}>Tier {sheet.spriteTier}</div>
        </div>
        <div>
          {/* P13: plain text, never innerHTML/markdown */}
          <div style={{ fontSize: "26px", fontWeight: 800 }}>{sheet.characterName}</div>
          <div style={{ color: "var(--dim)", fontSize: "14px" }}>{sheet.characterEpithet}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "16px", marginTop: "14px" }}>
            <PixelWord word={sheet.className.toUpperCase()} cell={7} color="#EDE4D3" />
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span class="dim-label">Lv</span>
              <PixelWord word={String(sheet.level)} cell={10} color="#F5C2CE" />
            </div>
          </div>
          <div style={{ marginTop: "16px" }}>
            <div class="dim-label">titles</div>
            {sheet.titles.length === 0 ? (
              <span class="title-slot">no titles yet, cleared modules earn them</span>
            ) : (
              sheet.titles.map((t) => <span class="title-slot earned" key={t.id}>{t.label}</span>)
            )}
          </div>
          <div style={{ marginTop: "14px", fontSize: "13px", color: "var(--dim)" }}>
            Job mastery <b style={{ color: "var(--ink)" }}>{sheet.jobMastery.earned} of {sheet.jobMastery.total} pillar bosses</b>
          </div>
        </div>
      </div>

      <div style={{ padding: "6px 22px 20px" }}>
        <h3 class="dim-label">Stats</h3>
        <div class="stats-grid">
          {sheet.stats.map((st) => {
            if (st.key === "SHIP") {
              return (
                <div key={st.key}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700, fontSize: "13px" }}>SHIP</span></div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <span class="mono" style={{ fontSize: "22px", color: "var(--brass)", fontWeight: 700 }}>{st.value}</span>
                    <span style={{ color: "var(--dim)", fontSize: "13px" }}>artifact{st.value === 1 ? "" : "s"} shipped to your portfolio</span>
                  </div>
                </div>
              );
            }
            const up = sheet.changedSince.includes(st.key);
            const accessibleLabel = up ? `${st.key} ${st.value}, up since your last visit` : `${st.key} ${st.value} of ${st.max}`;
            return (
              <div key={st.key} role="group" aria-label={accessibleLabel}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 700, fontSize: "13px" }}>{st.key}</span>
                  <span class="mono" style={{ fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                    {st.value} / {st.max}
                    {up && <span style={{ color: "var(--pink)", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "3px" }}><IconUpArrow /> up</span>}
                  </span>
                </div>
                <SegBar value={st.value} max={st.max} />
                {up && <div style={{ fontSize: "11px", color: "var(--dim)", marginTop: "3px" }}>up since your last visit</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "6px 22px 20px" }}>
        <h3 class="dim-label">Seals &nbsp;{sheet.seals.length} earned</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {sheet.seals.slice(0, 4).map((seal) => (
            <span key={seal.id} title={seal.label}>
              <IconSeal metal={seal.tier === "gold" ? "#E0A54C" : seal.tier === "silver" ? "#C7CBD1" : "#CD7F32"} />
            </span>
          ))}
          {sheet.seals.length === 0 && <span style={{ color: "var(--dim)", fontSize: "13px" }}>none minted yet, your first boss win mints one</span>}
        </div>
      </div>

      <div style={{ padding: "6px 22px 20px" }}>
        <h3 class="dim-label">Equipment . cosmetic</h3>
        <div style={{ color: "var(--dim)", fontSize: "13px" }}>
          What the <b style={{ color: "var(--ink)" }}>{sheet.className}</b> carries: a tiny <b style={{ color: "var(--pink)" }}>pink snake</b> at your feet.
        </div>
      </div>

      {onBecome && (
        <div style={{ margin: "8px 22px 24px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" class="btn btn-primary" onClick={onBecome}><IconStar lit={false} /> See a promotion</button>
          <span class="dim-label" style={{ maxWidth: "34ch" }}>This fires on its own when a real phase change happens. This button is a dev preview of the beat.</span>
        </div>
      )}
    </div>
  );
}
