// ThemePicker, L9: the console theme picker touches ONLY the console/highlight palette, never the
// app chrome or the pink identity. Separate control for the app light/dark mode and reduced motion.

export interface ThemePickerProps {
  consoleTheme: "cli" | "green";
  onConsoleThemeChange: (theme: "cli" | "green") => void;
  appTheme: "dark" | "light";
  onAppThemeChange: (theme: "dark" | "light") => void;
  reducedMotion: boolean;
  onReducedMotionChange: (value: boolean) => void;
}

export function ThemePicker({ consoleTheme, onConsoleThemeChange, appTheme, onAppThemeChange, reducedMotion, onReducedMotionChange }: ThemePickerProps) {
  return (
    <div class="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div>
        <div class="dim-label">Console theme</div>
        <div class="seg" role="group" aria-label="Console theme">
          <button type="button" aria-selected={consoleTheme === "cli"} onClick={() => onConsoleThemeChange("cli")}>CLI white</button>
          <button type="button" aria-selected={consoleTheme === "green"} onClick={() => onConsoleThemeChange("green")}>Hacker green</button>
        </div>
      </div>
      <div>
        <div class="dim-label">App theme</div>
        <div class="seg" role="group" aria-label="App theme">
          <button type="button" aria-selected={appTheme === "dark"} onClick={() => onAppThemeChange("dark")}>Dark</button>
          <button type="button" aria-selected={appTheme === "light"} onClick={() => onAppThemeChange("light")}>Light</button>
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
        <input type="checkbox" checked={reducedMotion} onChange={(e) => onReducedMotionChange((e.target as HTMLInputElement).checked)} />
        Reduce motion
      </label>
    </div>
  );
}
