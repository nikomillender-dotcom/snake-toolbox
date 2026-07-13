// App.tsx: the REAL composition root (I1). Round 3: IndexedDbStore wired for persistence,
// fileDrain reaches SandboxScreen, all execution mocks replaced.
import { useEffect, useMemo, useState, useCallback } from "preact/hooks";
import { AppShell, type Surface } from "./components/AppShell";
import { FirstLoadPrimer } from "./components/FirstLoadPrimer";
import { LearnScreen } from "./screens/LearnScreen";
import { SandboxScreen } from "./screens/SandboxScreen";
import { ProgressScreen, type DurabilityFacts } from "./screens/ProgressScreen";
import { BossScreen } from "./screens/BossScreen";
import { PromotionCutscene } from "./components/PromotionCutscene";
import { ShipCelebration } from "./components/ShipCelebration";
import type {
  WorkerToMain,
  FileBlob,
  CompletedNode,
  PhaseId,
  CurriculumBundle,
  StatSheet,
  GlossaryView,
  ReviewScheduler,
  GitHubAuth,
  GitHubSync,
  Store,
  Module,
  Lesson,
} from "./contracts";
import { COMPLETION_EMITTING_KINDS } from "./contracts";
import { createWorkerClient, type WorkerClient } from "./workerClient";
import { FIXTURE_BUNDLE } from "./mocks/curriculumFixture";
import { deriveStatSheet } from "./engine/derive/deriveStatSheet";
import { detectPromotion } from "./engine/derive/detectPromotion";
import { deriveGlossary } from "./engine/derive/deriveGlossary";
import { createReviewScheduler } from "./engine/fsrs/reviewScheduler";
import { createGitHubAuth } from "./engine/github/githubAuth";
import { createGitHubSync } from "./engine/github/githubSyncClient";
import { createSecretsVault } from "./engine/secrets/secretsVault";
import { fireWhenReady } from "./lib/flashGate";

function detectCrossOriginIsolated(): boolean {
  return typeof crossOriginIsolated !== "undefined" ? crossOriginIsolated : false;
}
function detectInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
}

// Learn Router types (R1)
type LearnView =
  | { view: "map" }
  | { view: "module"; moduleId: string }
  | { view: "lesson"; lessonId: string; focusStepId?: string };

function buildLessonIndex(bundle: CurriculumBundle) {
  const idx = new Map<string, { module: Module; lesson: Lesson; lessonOrder: number }>();
  for (const mod of bundle.modules) {
    for (let i = 0; i < mod.lessons.length; i++) {
      idx.set(mod.lessons[i]!.id, { module: mod, lesson: mod.lessons[i]!, lessonOrder: i });
    }
  }
  return idx;
}

function isLessonComplete(lesson: Lesson, nodes: CompletedNode[]): boolean {
  const nodeIds = new Set(nodes.map(n => n.nodeId));
  const emitting = lesson.steps.filter(s => COMPLETION_EMITTING_KINDS.has(s.kind));
  if (emitting.length === 0) return false;
  return emitting.every(s => nodeIds.has(s.id));
}
function isModuleComplete(mod: Module, nodes: CompletedNode[]): boolean {
  return nodes.some(n => n.kind === "module" && n.moduleId === mod.id);
}
function isBossBeaten(mod: Module, nodes: CompletedNode[]): boolean {
  if (!mod.boss) return true;
  return nodes.some(n => n.kind === "boss" && n.nodeId === mod.boss!.id);
}
function findResumeLessonId(bundle: CurriculumBundle, nodes: CompletedNode[]): string | null {
  for (const phase of bundle.phases) {
    for (const modId of phase.moduleIds) {
      const mod = bundle.modules.find(m => m.id === modId);
      if (!mod || isModuleComplete(mod, nodes)) continue;
      for (const lesson of mod.lessons) {
        if (!isLessonComplete(lesson, nodes)) return lesson.id;
      }
      return mod.lessons[0]?.id ?? null;
    }
  }
  return null;
}

const DEFAULT_PROFILE = { name: "Niko", epithet: "Apprentice", lastViewedAt: 0 };
const PROGRESS_KEY = "completedNodes";
const FILES_COLLECTION = "files";
const SETTINGS_COLLECTION = "settings";

export interface AppProps {
  store: Store;
}

export function App({ store }: AppProps) {
  const [surface, setSurface] = useState<Surface>("learn");
  const [primerOpen, setPrimerOpen] = useState(true);
  const [primerDismissedOnce, setPrimerDismissedOnce] = useState(false);
  const [inputCapable, setInputCapable] = useState(true);
  const [runtimeState, setRuntimeState] = useState<"warm" | "cold" | "loading">("loading");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeBossModuleId, setActiveBossModuleId] = useState<string | null>(null);
  const [completedNodes, setCompletedNodes] = useState<CompletedNode[]>([]);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [learnView, setLearnView] = useState<LearnView>({ view: "map" });
  const [promotionData, setPromotionData] = useState<{ from: PhaseId; to: PhaseId } | null>(null);
  const [shipOffer, setShipOffer] = useState<{ moduleId: string; folderPath: string } | null>(null);
  // Sandbox files drained from the worker (fileDrain events)
  const [drainedFiles, setDrainedFiles] = useState<FileBlob[]>([]);
  const [storeReady, setStoreReady] = useState(false);

  const isolated = detectCrossOriginIsolated();
  const installed = detectInstalled();

  const worker: WorkerClient = useMemo(() => createWorkerClient(), []);
  const bundle: CurriculumBundle = useMemo(() => FIXTURE_BUNDLE, []);
  const lessonIndex = useMemo(() => buildLessonIndex(bundle), [bundle]);
  const vault = useMemo(() => {
    try { return createSecretsVault(); }
    catch { return createSecretsVault({ getItem: () => null, setItem: () => {}, removeItem: () => {} }); }
  }, []);

  const reviewScheduler: ReviewScheduler = useMemo(() => {
    const getReviewForm = (itemId: string) => {
      for (const mod of bundle.modules) {
        for (const lesson of mod.lessons) {
          const step = lesson.steps.find(s => s.id === itemId);
          if (step?.reviewForm) return step.reviewForm;
        }
      }
      return undefined;
    };
    return createReviewScheduler({ store, getReviewForm });
  }, [store, bundle]);

  const githubAuth: GitHubAuth = useMemo(() => {
    const f = (typeof globalThis.fetch === "function") ? globalThis.fetch.bind(globalThis) : (() => Promise.reject(new Error("no fetch"))) as typeof fetch;
    return createGitHubAuth({ store, vault, fetch: f, now: Date.now });
  }, [store, vault]);
  const githubSync: GitHubSync = useMemo(() => {
    const f = (typeof globalThis.fetch === "function") ? globalThis.fetch.bind(globalThis) : (() => Promise.reject(new Error("no fetch"))) as typeof fetch;
    return createGitHubSync({ store, vault, fetch: f, now: Date.now });
  }, [store, vault]);

  // === Hydrate from Store on mount ===
  useEffect(() => {
    (async () => {
      const saved = await store.get<CompletedNode[]>("progress", PROGRESS_KEY);
      if (saved && Array.isArray(saved)) setCompletedNodes(saved);
      const savedProfile = await store.get<typeof DEFAULT_PROFILE>(SETTINGS_COLLECTION, "profile");
      if (savedProfile) setProfile(savedProfile);
      setStoreReady(true);
    })();
  }, [store]);

  // === Persist completedNodes to Store on change ===
  useEffect(() => {
    if (!storeReady) return;
    store.put("progress", PROGRESS_KEY, completedNodes).catch(() => {});
  }, [completedNodes, storeReady, store]);

  // === REAL derivations ===
  const progress = useMemo(() => ({ completedNodes }), [completedNodes]);
  const statSheet: StatSheet = useMemo(
    () => deriveStatSheet(progress, bundle.awardMap, profile),
    [progress, bundle.awardMap, profile]
  );
  const glossaryView: GlossaryView = useMemo(
    () => deriveGlossary(progress, bundle),
    [progress, bundle]
  );
  const ladder = useMemo(() => {
    return bundle.modules.map(mod => {
      const complete = isModuleComplete(mod, completedNodes);
      const firstIncomplete = mod.lessons.find(l => !isLessonComplete(l, completedNodes));
      return {
        id: mod.id, title: mod.title,
        status: complete ? "done" as const : firstIncomplete ? "current" as const : "ahead" as const,
      };
    });
  }, [bundle, completedNodes]);

  const recordCompletion = useCallback((node: CompletedNode) => {
    setCompletedNodes(prev => {
      if (prev.some(n => n.nodeId === node.nodeId)) return prev;
      return [...prev, node];
    });
  }, []);

  const handleLessonStepComplete = useCallback((moduleId: string, lessonId: string, stepId: string) => {
    const entry = lessonIndex.get(lessonId);
    if (!entry) return;
    const step = entry.lesson.steps.find(s => s.id === stepId);
    if (!step || !COMPLETION_EMITTING_KINDS.has(step.kind)) return;
    const node: CompletedNode = {
      nodeId: stepId, kind: step.kind, moduleId,
      strand: step.strand, statTags: step.statTags, timestamp: Date.now(),
    };
    recordCompletion(node);
    if (step.reviewable !== false && step.reviewForm) {
      reviewScheduler.enroll(node, step.reviewForm).catch(() => {});
    }
    // Check lesson then module completion
    const lesson = entry.lesson;
    const allEmitting = lesson.steps.filter(s => COMPLETION_EMITTING_KINDS.has(s.kind));
    const nodeIds = new Set([...completedNodes.map(n => n.nodeId), stepId]);
    if (allEmitting.every(s => nodeIds.has(s.id))) {
      const mod = entry.module;
      const allLessonsComplete = mod.lessons.every(l => {
        const em = l.steps.filter(s => COMPLETION_EMITTING_KINDS.has(s.kind));
        if (em.length === 0) return true;
        return em.every(s => nodeIds.has(s.id));
      });
      if (allLessonsComplete && isBossBeaten(mod, completedNodes)) {
        recordCompletion({ nodeId: `module-${mod.id}`, kind: "module", moduleId: mod.id, timestamp: Date.now() });
      }
    }
  }, [lessonIndex, completedNodes, recordCompletion, reviewScheduler]);

  const handleBossVictory = useCallback(() => {
    if (!activeBossModuleId) return;
    const mod = bundle.modules.find(m => m.id === activeBossModuleId);
    if (!mod?.boss) return;
    const prevSheet = statSheet;
    recordCompletion({ nodeId: mod.boss.id, kind: "boss", moduleId: mod.id, strand: mod.strands[0], timestamp: Date.now() });
    recordCompletion({ nodeId: `module-${mod.id}`, kind: "module", moduleId: mod.id, timestamp: Date.now() });
    if (mod.producesArtifact) {
      recordCompletion({ nodeId: `artifact-${mod.id}`, kind: "artifact", moduleId: mod.id, timestamp: Date.now() });
    }
    const nextSheet = deriveStatSheet(
      { completedNodes: [...completedNodes, { nodeId: mod.boss.id, kind: "boss", moduleId: mod.id, timestamp: Date.now() }, { nodeId: `module-${mod.id}`, kind: "module", moduleId: mod.id, timestamp: Date.now() }] },
      bundle.awardMap, profile
    );
    const promo = detectPromotion(prevSheet.phase, nextSheet.phase);
    if (promo.promoted) {
      fireWhenReady("promotion", () => setPromotionData({ from: promo.from, to: promo.to }));
    }
    if (mod.producesArtifact) {
      setShipOffer({ moduleId: mod.id, folderPath: `${mod.id}-project` });
    }
  }, [activeBossModuleId, bundle, completedNodes, statSheet, profile, recordCompletion]);

  const goToLesson = useCallback((lessonId: string, focusStepId?: string) => {
    setSurface("learn");
    setLearnView({ view: "lesson", lessonId, focusStepId });
  }, []);

  // Reduced motion
  useEffect(() => { document.documentElement.dataset.reducedMotion = String(reducedMotion); }, [reducedMotion]);
  useEffect(() => { if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setReducedMotion(true); }, []);

  // Worker subscription: boot handshake + fileDrain
  useEffect(() => {
    const unsubscribe = worker.subscribe((msg: WorkerToMain) => {
      if (msg.t === "ready") { setInputCapable(msg.inputCapable); setRuntimeState("warm"); }
      // fileDrain: UPSERT drained files into the Store and surface them to SandboxScreen
      if (msg.t === "fileDrain" && msg.namespace === "session") {
        setDrainedFiles(prev => {
          const merged = [...prev];
          for (const file of msg.files) {
            const idx = merged.findIndex(f => f.path === file.path);
            if (idx >= 0) merged[idx] = file; else merged.push(file);
          }
          return merged;
        });
        // Persist drained files to the Store
        for (const file of msg.files) {
          store.put(FILES_COLLECTION, file.path, file).catch(() => {});
        }
      }
    });
    return unsubscribe;
  }, [worker, store]);

  function startBoot() {
    setPrimerOpen(false); setPrimerDismissedOnce(true); setRuntimeState("loading");
    worker.send({
      t: "boot", pyodideVersion: "314.0.2",
      pyodideHash: "f7a8a169e513791e18fa0790fb69d6f2656b779e9012ba57e03e973f0df0b39f",
      interruptBuffer: isolated ? new SharedArrayBuffer(4) : null,
      inputBuffer: isolated ? new SharedArrayBuffer(4) : null
    });
  }

  // Resume (R4)
  useEffect(() => {
    if (completedNodes.length > 0 && learnView.view === "map") {
      const resumeId = findResumeLessonId(bundle, completedNodes);
      if (resumeId) setLearnView({ view: "lesson", lessonId: resumeId });
    }
  }, []);

  return (
    <AppShell active={surface} onNavigate={setSurface} runtimeState={runtimeState}>
      <FirstLoadPrimer open={primerOpen && !primerDismissedOnce} sizeMb={13} isMetered={false}
        onDownloadNow={startBoot} onWaitForWifi={() => setPrimerOpen(false)} />
      {!primerOpen && runtimeState === "loading" && (
        <div class="banner info" role="status" style={{ margin: "12px" }}>Booting Python...</div>
      )}
      {surface === "learn" && (
        <LearnScreen bundle={bundle} worker={worker} inputCapable={inputCapable}
          learnView={learnView} lessonIndex={lessonIndex} completedNodes={completedNodes}
          onNavigate={setLearnView} onOpenInSandbox={() => setSurface("sandbox")}
          onLessonStepComplete={handleLessonStepComplete}
          onEnterBoss={(moduleId) => setActiveBossModuleId(moduleId)} />
      )}
      {surface === "sandbox" && (
        <SandboxScreen worker={worker} inputCapable={inputCapable} drainedFiles={drainedFiles} store={store} />
      )}
      {activeBossModuleId && (() => {
        const boss = bundle.modules.find(m => m.id === activeBossModuleId)?.boss;
        if (!boss) return null;
        return (
          <div style={{ position: "fixed", inset: 0, background: "var(--ground)", zIndex: 500, overflow: "auto" }}>
            <BossScreen boss={boss} worker={worker} reducedMotion={reducedMotion}
              inputCapable={inputCapable} onVictory={handleBossVictory}
              onExit={() => setActiveBossModuleId(null)} />
          </div>
        );
      })()}
      {promotionData && (
        <PromotionCutscene open={true} fromPhase={promotionData.from} toPhase={promotionData.to}
          fromClassName={bundle.awardMap.classByPhase[promotionData.from]?.className ?? "Apprentice"}
          toClassName={bundle.awardMap.classByPhase[promotionData.to]?.className ?? "Builder"}
          equipment={["upgraded toolbelt", "new goggles"]}
          line={`You are now a ${bundle.awardMap.classByPhase[promotionData.to]?.className ?? "Builder"}.`}
          reducedMotion={reducedMotion} onClose={() => setPromotionData(null)} />
      )}
      {shipOffer && (
        <ShipCelebration open={true} artifactName={shipOffer.folderPath} shipResult={null}
          reducedMotion={reducedMotion} onDismiss={() => setShipOffer(null)} />
      )}
      {surface === "progress" && (
        <ProgressScreen sheet={statSheet} glossaryView={glossaryView}
          reviewScheduler={reviewScheduler} githubAuth={githubAuth} githubSync={githubSync}
          ladder={ladder} portfolio={[]} reducedMotion={reducedMotion}
          onReducedMotionChange={setReducedMotion}
          durability={{ installed, unexportedChangesOverThreshold: !installed }}
          onOpenLesson={goToLesson} />
      )}
    </AppShell>
  );
}
