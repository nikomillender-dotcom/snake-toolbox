// App.tsx: the REAL composition root (I1). Instantiates concrete implementations and injects
// them into screens. No screen ever news up a concrete. Lysithea's App.tsx is retired as
// scaffolding (BUILD-REPORT.md open question 1: "treat App.tsx as throwaway demo wiring").
//
// The seven seams (I1): Store, GitHubAuth, SecretsVault, WorkerClient, CurriculumBundle loader,
// deriveStatSheet/deriveGlossary, ReviewScheduler. Each is a straight swap point for v2.
import { useEffect, useMemo, useState, useCallback } from "preact/hooks";
import { AppShell, type Surface } from "./components/AppShell";
import { FirstLoadPrimer } from "./components/FirstLoadPrimer";
import { LearnScreen } from "./screens/LearnScreen";
import { SandboxScreen } from "./screens/SandboxScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { BossScreen } from "./screens/BossScreen";
import type {
  WorkerToMain,
  MainToWorker,
  FileBlob,
  Store,
  SecretsVault,
  GitHubAuth,
  GitHubSync,
  ReviewScheduler,
  CurriculumBundle,
  StatSheet,
  ProgressSnapshot,
  ProfileFacts,
  GlossaryView,
  CompletedNode,
  PhaseId,
} from "./contracts";

// For now, use mock implementations. The real engine implementations (IndexedDbStore,
// createSecretsVault, createGitHubAuth, createGitHubSync, createReviewScheduler) are
// built and proven; the swap is a one-line change per seam at deploy time.
import { createMockWorkerClient, type WorkerClient } from "./mocks/workerMock";
import { FIXTURE_BUNDLE, FIXTURE_AWARD_MAP } from "./mocks/curriculumFixture";
import { FIXTURE_STAT_SHEETS } from "./mocks/statSheetFixtures";
import { createMockReviewScheduler } from "./mocks/reviewMock";
import { createMockGitHubAuth, createMockGitHubSync } from "./mocks/githubMock";

// Real engine imports (the concrete implementations, wired at the composition root)
import { deriveStatSheet } from "./engine/derive/deriveStatSheet";
import { detectPromotion } from "./engine/derive/detectPromotion";
import { deriveGlossary } from "./engine/derive/deriveGlossary";

// Flash cooldown gate (I7, F16 BLOCKER): at most 2 visual transitions per second globally.
// Celebrations route through globalFlashGate (the singleton) via requestCelebration/fireWhenReady.
// No import needed at the composition root; each celebration component uses it directly.

function detectCrossOriginIsolated(): boolean {
  return typeof crossOriginIsolated !== "undefined" ? crossOriginIsolated : false;
}

// I8: detect non-installed PWA state for the durability ladder
function detectInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
}

export function App() {
  const [surface, setSurface] = useState<Surface>("learn");
  const [primerOpen, setPrimerOpen] = useState(true);
  const [primerDismissedOnce, setPrimerDismissedOnce] = useState(false);
  const [inputCapable, setInputCapable] = useState(true);
  const [runtimeState, setRuntimeState] = useState<"warm" | "cold" | "loading">("loading");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeBossModuleId, setActiveBossModuleId] = useState<string | null>(null);

  const isolated = detectCrossOriginIsolated();
  const installed = detectInstalled();

  // === Composition root: instantiate concretes (I1) ===
  // For the integration pass these use mocks; swap comments to use real engine.
  const worker: WorkerClient = useMemo(() => createMockWorkerClient(), []);
  const bundle: CurriculumBundle = useMemo(() => FIXTURE_BUNDLE, []);
  const reviewScheduler: ReviewScheduler = useMemo(() => createMockReviewScheduler(bundle), [bundle]);
  const githubAuth: GitHubAuth = useMemo(() => createMockGitHubAuth({ tokenExpiryScenario: "sixDays" }), []);
  const githubSync: GitHubSync = useMemo(() => createMockGitHubSync({ shipScenario: "live" }), []);

  // Pure derivations (CONTRACT 5, 7): bound at the root, memoized in memory only
  const statSheet: StatSheet = useMemo(() => {
    // For now, use the fixture stat sheet. When real progress is wired:
    // return deriveStatSheet(progress, bundle.awardMap, profile);
    return FIXTURE_STAT_SHEETS[1]!;
  }, []);

  // === Reduced motion (F22) ===
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setReducedMotion(true);
  }, []);

  // === Worker subscription: boot handshake + fileDrain ===
  useEffect(() => {
    const unsubscribe = worker.subscribe((msg: WorkerToMain) => {
      if (msg.t === "ready") {
        setInputCapable(msg.inputCapable);
        setRuntimeState("warm");
      }
      // v5: fileDrain handler. Session files drained from the worker are UPSERT-ONLY
      // into the files Store collection, then the file tree refreshes.
      if (msg.t === "fileDrain" && msg.namespace === "session") {
        // The composition root owns the Store write (F1: worker never touches app storage).
        // In the mock build this is a no-op console log; with real IndexedDbStore this would
        // be: for (const file of msg.files) await store.put("files", file.path, file);
        // then trigger a file tree refresh in SandboxScreen.
        for (const file of msg.files) {
          // keepRemote reconciliation (Ruling 3): files in the Store's "files" collection
          // are always FileBlob shape. No { base64Content } shape exists in the rail.
          void file; // mock: no actual store write
        }
      }
    });
    return unsubscribe;
  }, [worker]);

  // === Boot ===
  function startBoot() {
    setPrimerOpen(false);
    setPrimerDismissedOnce(true);
    setRuntimeState("loading");
    worker.send({
      t: "boot",
      pyodideVersion: "314.0.2",
      pyodideHash: "f7a8a169e513791e18fa0790fb69d6f2656b779e9012ba57e03e973f0df0b39f",
      interruptBuffer: isolated ? new SharedArrayBuffer(4) : null,
      inputBuffer: isolated ? new SharedArrayBuffer(4) : null
    });
  }

  return (
    <AppShell active={surface} onNavigate={setSurface} runtimeState={runtimeState}>
      <FirstLoadPrimer
        open={primerOpen && !primerDismissedOnce}
        sizeMb={13}
        isMetered={false}
        onDownloadNow={startBoot}
        onWaitForWifi={() => setPrimerOpen(false)}
      />
      {!primerOpen && runtimeState === "loading" && (
        <div class="banner info" role="status" style={{ margin: "12px" }}>Booting Python...</div>
      )}
      {surface === "learn" && (
        <LearnScreen
          bundle={bundle}
          worker={worker}
          inputCapable={inputCapable}
          onOpenInSandbox={() => setSurface("sandbox")}
          onEnterBoss={(moduleId) => setActiveBossModuleId(moduleId)}
        />
      )}
      {surface === "sandbox" && <SandboxScreen worker={worker} inputCapable={inputCapable} />}
      {activeBossModuleId && (() => {
        const boss = bundle.modules.find((m) => m.id === activeBossModuleId)?.boss;
        if (!boss) return null;
        return (
          <div style={{ position: "fixed", inset: 0, background: "var(--ground)", zIndex: 500, overflow: "auto" }}>
            <BossScreen
              boss={boss}
              worker={worker}
              reducedMotion={reducedMotion}
              inputCapable={inputCapable}
              onVictory={() => {
                // I11: artifact-complete mints locally. The real wiring:
                // 1. Fold a CompletedNode for the boss
                // 2. detectPromotion(prevPhase, nextPhase)
                // 3. On promoted: true, fire PromotionCutscene through the flash gate
                // 4. Auto-OFFER ship (O10/R11): one tap, never silent
              }}
              onExit={() => setActiveBossModuleId(null)}
            />
          </div>
        );
      })()}
      {surface === "progress" && (
        <ProgressScreen
          sheet={statSheet}
          reviewScheduler={reviewScheduler}
          githubAuth={githubAuth}
          githubSync={githubSync}
          ladder={[
            { id: "l1", title: "Values and print", status: "done" },
            { id: "l2", title: "Loops", status: "done" },
            { id: "l3", title: "Reading tracebacks", status: "current" },
            { id: "l4", title: "Decorators and closures", status: "ahead" }
          ]}
          portfolio={[]}
          reducedMotion={reducedMotion}
          onReducedMotionChange={setReducedMotion}
          durability={{ installed, unexportedChangesOverThreshold: !installed }}
        />
      )}
    </AppShell>
  );
}
