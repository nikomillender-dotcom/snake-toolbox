import { useEffect, useState } from "preact/hooks";
import type { DueReview, GitHubAuth, GitHubSync, ProgressBackup, ReviewGrade, ReviewScheduler, StatSheet, TokenExpiry } from "../contracts";
import { StatScreen } from "../components/StatScreen";
import { PromotionCutscene } from "../components/PromotionCutscene";
import { ReviewHand } from "../components/ReviewHand";
import { GlossaryScreen } from "./GlossaryScreen";
import { ConceptMap, PortfolioShelf, ProjectLadder, type LadderRung, type PortfolioEntry } from "../components/ConceptMapAndLadder";
import { BackupFileReport, BackupNudge, InstallHint, StorageMeter } from "../components/Durability";
import { BackupStatus, RestoreSheet, TokenExpiryBanner } from "../components/RestoreAndExpiry";
import { GitHubConnectSheet } from "../components/GitHubConnectSheet";
import { ThemePicker } from "../components/ThemePicker";
import type { GlossaryView, PhaseId } from "../contracts";

// SF4 (Frederick full-gate should-fix): lastBackupSkippedFiles()/lastRestoreFileReport() are v6
// non-contract additions on the concrete githubSync object (see githubSyncClient.ts's own comment
// for why they sit outside the frozen GitHubSync interface, I10). This local widened type mirrors
// that same, already-adjudicated posture on the UI side: the object really carries these methods
// at runtime; only the STATIC type this screen is handed needs widening to call them.
type GitHubSyncWithFileReports = GitHubSync & {
  lastBackupSkippedFiles(): Promise<Array<{ path: string; reason: string; sizeBytes: number }>>;
  lastRestoreFileReport(): Promise<{ written: string[]; skipped: string[] }>;
};

export interface DurabilityFacts {
  installed: boolean;
  /** F8's escalation trigger: real, unexported changes over a threshold while non-installed. The
   * composition root owns computing this (I8); the UI only renders what it is handed. */
  unexportedChangesOverThreshold: boolean;
}

export interface ProgressScreenProps {
  sheet: StatSheet;
  glossaryView?: GlossaryView;
  reviewScheduler: ReviewScheduler;
  githubAuth: GitHubAuth;
  githubSync: GitHubSync;
  ladder: LadderRung[];
  portfolio: PortfolioEntry[];
  reducedMotion: boolean;
  onReducedMotionChange: (v: boolean) => void;
  durability?: DurabilityFacts;
  onOpenLesson?: (lessonId: string) => void;
}

export function ProgressScreen({
  sheet,
  glossaryView,
  reviewScheduler,
  githubAuth,
  githubSync,
  ladder,
  portfolio,
  reducedMotion,
  onReducedMotionChange,
  durability = { installed: false, unexportedChangesOverThreshold: false },
  onOpenLesson
}: ProgressScreenProps) {
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [hand, setHand] = useState<DueReview[] | null>(null);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [restoreSnapshot, setRestoreSnapshot] = useState<ProgressBackup | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [tokenExpiry, setTokenExpiry] = useState<TokenExpiry | null>(null);
  const [expiryDismissed, setExpiryDismissed] = useState(false);
  const [consoleTheme, setConsoleTheme] = useState<"cli" | "green">("cli");
  const [appTheme, setAppTheme] = useState<"dark" | "light">("dark");
  const [installDismissed, setInstallDismissed] = useState(false);
  const [connected, setConnected] = useState(false);
  // SF4: honest counts + reasons for files a backup/restore skipped, surfaced from the engine's
  // v6 non-contract reporting methods (see the GitHubSyncWithFileReports comment above).
  const [backupSkips, setBackupSkips] = useState<Array<{ path: string; reason: string; sizeBytes: number }>>([]);
  const [restoreSkippedPaths, setRestoreSkippedPaths] = useState<string[]>([]);
  // H2 (Simbo's visual-quality checklist, "exactly ONE hero focal point per screen"): Progress
  // originally stacked the Stat Sheet, Concept Map, Project Ladder, Portfolio Shelf, Glossary, and
  // Backup/Settings onto one long scroll, which reads flat rather than as one hero per view.
  // Internal tabs give Progress the same "one surface, one hero" discipline Learn/Sandbox already
  // have, matching v0 1.1's "profile/settings lives inside Progress as a tab" framing. The Review
  // Hand and the durability/expiry banners stay always-visible above the tabs (the calm daily
  // ritual and safety reads should never be a tap away).
  const [view, setView] = useState<"sheet" | "map" | "glossary" | "backup">("sheet");

  useEffect(() => {
    void reviewScheduler.dueCount(Date.now()).then(setDueCount);
    void refreshFileReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SF4: pulls the most recent backup-skip / restore-skip reports and puts them in state. Called
  // on mount (so the tab is honest about whatever happened earlier this session) and again right
  // after a restore (below), since that is the one point in this screen that already triggers a
  // real githubSync call.
  async function refreshFileReports() {
    const withReports = githubSync as GitHubSyncWithFileReports;
    const [skips, restoreReport] = await Promise.all([
      withReports.lastBackupSkippedFiles(),
      withReports.lastRestoreFileReport(),
    ]);
    setBackupSkips(skips);
    setRestoreSkippedPaths(restoreReport.skipped);
  }

  async function drawHand() {
    const items = await reviewScheduler.getDueReviews(Date.now(), 8);
    setHand(items);
  }

  async function grade(itemId: string, g: ReviewGrade) {
    await reviewScheduler.recordReview(itemId, g, Date.now());
  }

  async function connect(token: string, repoName: string) {
    const result = await githubAuth.connectWithToken(token, { name: repoName, visibility: "public" });
    if (result.ok) {
      setConnected(true);
      const snapshot = await githubSync.restoreProgress();
      if (snapshot) {
        setRestoreSnapshot(snapshot);
        setRestoreOpen(true);
      }
      const expiry = await githubAuth.tokenExpiry();
      setTokenExpiry(expiry);
      await refreshFileReports(); // SF4: pick up whatever this restore attempt just reported
    }
    return result;
  }

  useEffect(() => {
    document.documentElement.dataset.theme = appTheme;
  }, [appTheme]);

  return (
    <div style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "18px", overflow: "auto" }}>
      <InstallHint
        installed={durability.installed}
        dismissed={installDismissed}
        sticky={!durability.installed && durability.unexportedChangesOverThreshold}
        onDismiss={() => setInstallDismissed(true)}
      />
      <TokenExpiryBanner expiry={tokenExpiry} onRenew={() => setConnectOpen(true)} onDismiss={() => setExpiryDismissed(true)} dismissed={expiryDismissed} />

      <ReviewHand dueCount={dueCount ?? 0} hand={hand} onDrawHand={drawHand} onGrade={grade} reducedMotion={reducedMotion} />

      <div class="seg" role="tablist" aria-label="Progress views">
        <button type="button" role="tab" aria-selected={view === "sheet"} onClick={() => setView("sheet")}>Character sheet</button>
        <button type="button" role="tab" aria-selected={view === "map"} onClick={() => setView("map")}>Concept map</button>
        <button type="button" role="tab" aria-selected={view === "glossary"} onClick={() => setView("glossary")}>Glossary</button>
        <button type="button" role="tab" aria-selected={view === "backup"} onClick={() => setView("backup")}>Backup &amp; settings</button>
      </div>

      {view === "sheet" && <StatScreen sheet={sheet} onBecome={() => setPromotionOpen(true)} />}

      {view === "map" && (
        <>
          <ConceptMap sheet={sheet} />
          <ProjectLadder rungs={ladder} />
          <PortfolioShelf entries={portfolio} />
        </>
      )}

      {view === "glossary" && glossaryView && <GlossaryScreen view={glossaryView} onOpenLesson={onOpenLesson} />}

      {view === "backup" && (
        <>
          <section aria-label="Backup and storage" class="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <BackupNudge connected={connected} lastBackupDaysAgo={connected ? 1 : null} onConnect={() => setConnectOpen(true)} onExportZip={() => {}} />
            <BackupStatus lastBackup={connected ? { at: Date.now() - 86400000, ok: true } : null} />
            <BackupFileReport backupSkips={backupSkips} restoreSkippedPaths={restoreSkippedPaths} />
            <StorageMeter usageBytes={12_500_000} quotaBytes={1_000_000_000} />
          </section>

          <ThemePicker
            consoleTheme={consoleTheme}
            onConsoleThemeChange={setConsoleTheme}
            appTheme={appTheme}
            onAppThemeChange={setAppTheme}
            reducedMotion={reducedMotion}
            onReducedMotionChange={onReducedMotionChange}
          />
        </>
      )}

      <GitHubConnectSheet open={connectOpen} onClose={() => setConnectOpen(false)} onConnect={connect} />
      <RestoreSheet
        open={restoreOpen}
        snapshot={restoreSnapshot}
        onRestore={() => setRestoreOpen(false)}
        onStartFresh={() => setRestoreOpen(false)}
      />
      {/* Promotion cutscene moved to App.tsx: fires from real detectPromotion on boss victory */}
    </div>
  );
}
