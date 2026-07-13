// contracts.ts, Snake ToolBox
//
// VERBATIM transcription of the interface contract block (contract-hash: STB-CONTRACT-v6).
// No type shape, field, or doc-comment content has been altered from the spec block. The changes
// here are purely mechanical: the `export` keywords needed for an importable TS module, the 7
// markdown "### CONTRACT N" section headers reformatted into the "// ===" comment banners below
// (same section titles, just a comment-block shape instead of markdown), and one appended
// "End of verbatim contract transcription" comment at the end of the file.
//
// Source: integration-overview.md, BEGIN-CONTRACT-BLOCK .. END-CONTRACT-BLOCK, STB-CONTRACT-v6.

// ============================================================================
// CONTRACT 1: the worker runtime protocol (main thread <-> Pyodide worker)
// ============================================================================

// One worker, two consumers (Learn + Sandbox). The main thread owns the UI and the secrets; the
// worker owns Python and is a HOSTILE-INPUT ZONE (see CONTRACT 2, SecretsVault): no bearer secret
// is ever reachable from it. All messages are structured-clone safe.

export type NamespaceId = "graded" | "scratch" | "session";
// graded  = Learn buffer, runs FRESH + ISOLATED every time (grading integrity, F9/K4)
// scratch = Learn side REPL, persistent, its OWN namespace (never leaks into graded)
// session = Sandbox, persistent between runs (the living workbench)

export type MainToWorker =
  | { t: "boot"; pyodideVersion: string; pyodideHash: string;
      // P1 degraded boot: both SABs are null when crossOriginIsolated is false (a SharedArrayBuffer
      // cannot be constructed then). On null the worker STILL boots and runs code, but input() and
      // interrupt are disabled and must never block or hang a run. The worker reads the disabled
      // state from these null buffers; the UI reads it from ready.inputCapable (integration I4, L2).
      interruptBuffer: SharedArrayBuffer | null; inputBuffer: SharedArrayBuffer | null }
  | { t: "run"; runId: string; code: string; mountFiles: FileBlob[]; namespace: NamespaceId }
  | { t: "check"; runId: string; code: string; mountFiles: FileBlob[];
      hiddenTests: HiddenTest[] } // ALWAYS graded + isolated; no namespace arg by design
  | { t: "stop"; runId: string }
  | { t: "inputResponse"; runId: string; bytes: Uint8Array }
  | { t: "loadPackage"; name: string }
  | { t: "resetSession"; namespace: NamespaceId } // Restart (Sandbox) / scratch Restart (Learn)
  | { t: "requestNamespace"; namespace: NamespaceId }; // P4 PULL: refresh the Session Inspector on demand (K5)

export type WorkerToMain =
  | { t: "ready"; pyodideVersion: string; inputCapable: boolean } // P1: inputCapable=false => SAB absent, input()/interrupt off
  | { t: "stdout"; runId: string; text: string }
  | { t: "stderr"; runId: string; text: string }
  | { t: "figure"; runId: string; png: Uint8Array; alt: string } // alt REQUIRED (F20)
  | { t: "table"; runId: string; columns: string[]; rows: string[][] } // v1.1, O8 deferred; type reserved
  | { t: "result"; runId: string; repr: string }
  | { t: "error"; runId: string; errorType: string; message: string; line: number | null;
      traceback: string }
  | { t: "checkResult"; runId: string; passed: boolean; results: TestOutcome[] }
  | { t: "inputRequest"; runId: string; prompt: string }
  | { t: "packageProgress"; name: string; phase: "download" | "install" | "done";
      loadedBytes: number; totalBytes: number | null }
  | { t: "namespace"; namespace: NamespaceId; names: NameInfo[] } // filtered + safe (F11)
  | { t: "fileDrain"; runId: string; namespace: NamespaceId; files: FileBlob[] } // v5: MEMFS drain OUT (B6); UPSERT only, session workbench (F1/F9)
  | { t: "runDone"; runId: string; ok: boolean }
  | { t: "resetDone"; namespace: NamespaceId; ok: boolean } // P12: ack for resetSession; Fresh Slate fires ONLY on ok:true
  | { t: "fatal"; reason: "oom" | "crash" | "unknown" }; // worker died; main respawns (F10)

export interface FileBlob { path: string; text?: string; bytes?: Uint8Array; encoding: "utf8" | "binary" }
export interface HiddenTest { id: string; code: string; message: string; group?: string }
export interface TestOutcome { id: string; group?: string; passed: boolean; message: string;
                        actual?: string; expected?: string }
export interface NameInfo { name: string; group: "import" | "function" | "variable";
                     typeName: string; repr: string; fromCurrentRun: boolean }
// NAMESPACE EVENT (F11 + P4): the worker PUSHES a `namespace` event right after each `runDone`, and
// that push is what drives the Session chip (count + freshness). `requestNamespace` is a SEPARATE
// PULL used only when the user opens the Session Inspector on demand; both carry the same snapshot.
// The snapshot is honest and side-effect-free: builtins, dunders, and imported-module noise are
// FILTERED OUT so the count matches what Niko thinks he defined; repr is length-capped and computed
// under try/except (a custom __repr__ can raise, block, or run code); it is emitted only at a SAFE
// point (after a run completes); fromCurrentRun drives the prior-run dimming in the inspector.

// FILE DRAIN (B6, v5): the SYMMETRIC OUT half of `mountFiles`. After a `session` run the worker drains files that
// are NEW or CHANGED in the session working dir and PUSHES a `fileDrain` event, so a file Python just wrote (a
// generator's output.txt, Niko's core Sandbox use case) reaches the file rail and becomes shippable. It is
// UPSERT-ONLY: it never deletes a project file (the file rail stays user-authoritative for deletes), so a buggy
// script cannot silently wipe files. A `graded` check does NOT drain (its MEMFS is cleared for isolation, F9);
// `scratch` has no file tree. The main thread owns the Store write; the worker never touches app storage (F1).

// GRADING ISOLATION (F9, BLOCKER): a "check" MUST run in proven isolation, NOT merely a fresh globals
// dict. Acceptable implementations: (a) a SEPARATE Pyodide interpreter/worker for grading, or (b) a
// hard state reset before every check: purge user-defined modules from sys.modules, restore replaced
// builtins, reset the random seed, clear the grading MEMFS working dir, and reset the recursion limit.
// graded / scratch / session are mutually isolated: a name defined in one can never satisfy a test in
// another. "Fresh globals dict" alone is NOT a correctness guarantee and must not be written as one.

// ============================================================================
// CONTRACT 2: the Store adapter and the SecretsVault
// ============================================================================

// One storage adapter, swappable (v0 4.4). UI code NEVER touches IndexedDB directly. Quota handling,
// hydration-wipe prevention, and migration live INSIDE the adapter so they travel with storage.
export interface Store {
  readonly schemaVersion: number;                          // P14 + v0.4: shipped-shape = 2 (v1 was 1). The v0.4
                                                           // fold adds the `reviews` FSRS collection + a `githubMeta`
                                                           // (token expiry + last-backup) shape, the first genuinely
                                                           // STATEFUL stored data, so the version bumps 1 -> 2 and the
                                                           // migrate() hook is now REAL: a forward-add that is a no-op
                                                           // on greenfield (nothing shipped at v1) yet EXISTS and is
                                                           // unit-tested, so the first in-anger migration is not its
                                                           // first run. Stats + glossary stay pure-derived, no shape.
  get<T>(collection: string, key: string): Promise<T | undefined>;
  put<T>(collection: string, key: string, value: T): Promise<void>;
  delete(collection: string, key: string): Promise<void>;
  list<T>(collection: string, prefix?: string): Promise<Array<{ key: string; value: T }>>;
  estimate(): Promise<{ usage: number; quota: number }>;   // navigator.storage.estimate
  requestPersist(): Promise<boolean>;                      // navigator.storage.persist
}

// SecretsVault: MAIN-THREAD ONLY. Never imported into worker code, never sent over the worker
// protocol, never stored in a partition the worker's FFI can open (F1, BLOCKER). The token is
// used only through the closure form so the raw value never gets returned, logged, or serialized
// (F6 never-log). All api.github.com calls happen on the main thread using this.
// P5: the browser-exposed LLM key is DROPPED from v1 (no consent gate is worth half-building the
// anti-pattern, and the curriculum fences real-LLM to M27). The vault and this SecretId enum are the
// seam a v1.1 "llmKey" slots into, behind a one-time browser-exposed-key consent screen, with no rewrite.
export interface SecretsVault {
  setSecret(id: SecretId, value: string): Promise<void>;
  hasSecret(id: SecretId): Promise<boolean>;
  useSecret<T>(id: SecretId, fn: (value: string) => Promise<T>): Promise<T>;
  clearSecret(id: SecretId): Promise<void>;
}
export type SecretId = "githubToken"; // v1: GitHub token only. "llmKey" returns behind a consent screen in v1.1 (P5)

// ============================================================================
// CONTRACT 3: GitHubAuth and GitHubSync (client-side, api.github.com direct)
// ============================================================================

// v1 = fine-grained PAT, single repo scope (Contents read/write + Metadata read). Same seam holds a
// v2 device-flow-via-Vercel-function impl. Screens never learn which is live.
export interface GitHubAuth {
  status(): Promise<"connected" | "needsReconnect" | "disconnected">;
  isConnected(): Promise<boolean>;
  connectWithToken(token: string, repo: RepoSpec): Promise<ConnectResult>; // v1
  disconnect(): Promise<void>;
  tokenExpiry(): Promise<TokenExpiry | null>; // v0.4 (O): latest value captured from the
                                              // GitHub-Authentication-Token-Expiration response header on ANY
                                              // api.github.com call, persisted in `githubMeta`. Drives the calm
                                              // expiry warning (quiet 7 days out, sticky at 48h). No extra call.
}
export interface RepoSpec { name: string; visibility: "public" | "private" }
export interface ConnectResult { ok: boolean; repoUrl?: string; error?: "invalidToken" | "scope" | "network" | "expired" }
export interface TokenExpiry { expiresAt: number | null; daysLeft: number | null; captured: boolean }
// v0.4 (softened per D10, guarded per D3): captured=false means no USABLE expiry was captured, so the UI shows
// NOTHING rather than a fake countdown (expiresAt/daysLeft null then). captured=false covers EVERY no-signal case:
// a token that sends no header, no call yet, AND the capture-time sanity guard (an expiresAt that tracks `now`
// across successive calls is the known fine-grained-PAT header bug, go-github 3708 -> captured:false, NEVER a
// permanent 0-days alarm). Only a real, stable, future expiry flips captured true. Note: fine-grained PATs CAN be
// created with no expiration (no header), and a classic PAT WITH an expiry DOES send the header; captured:false
// handles all the same honest way. Verify the header hands-on vs a real fine-grained PAT before any countdown
// ships (checklist item 27, frederick-delta-check.md).

export interface GitHubSync {
  scanArtifact(artifact: Artifact): ScanResult;         // F2 secret scan, runs BEFORE any commit
  ship(artifact: Artifact): Promise<ShipResult>;        // one artifact = one commit (Git Data API)
  resolveConflict(artifact: Artifact, choice: ConflictChoice,
                  newFolderPath?: string): Promise<ShipResult>; // P3: completes a conflicted ship
  queueLength(): Promise<number>;
  flushQueue(): Promise<FlushReport>;                   // sequential + backoff + Retry-After (F14/R9)
  regenRootReadme(index: PortfolioIndex): Promise<void>;// tiny single-file write (Contents API)
  firstShipAttributionCheck(): Promise<AttributionStatus>; // F13
  // v0.4 progress backup + restore (N). Target is a SEPARATE PRIVATE repo, NEVER the public portfolio repo: the
  // snapshot is personal learning telemetry (what Niko struggled with) and must not sit in the repo an employer
  // browses. One file `progress.json`, overwritten via the Contents API (tiny single-file write, like
  // regenRootReadme). Auto-backup to a PRIVATE repo is a backstop, not a PUBLISH, so it runs quietly with no
  // per-snapshot consent (A.5). Restore is OFFERED on a fresh device, NEVER required (R).
  backupProgress(snapshot: ProgressBackup): Promise<BackupResult>;
  restoreProgress(): Promise<ProgressBackup | null>;    // null if no snapshot exists yet on the connected account
  lastBackup(): Promise<{ at: number; ok: boolean } | null>; // feeds the durability read (F8, I8)
}
export interface Artifact { folderPath: string; files: FileBlob[]; readme: string;
                     commitMessage: string; moduleId?: string; isCarryProject?: boolean }
export interface ScanResult { clean: boolean; hits: Array<{ path: string; kind: "sk-" | "ghp_" | "github_pat_" | "entropy" }> }
export interface ShipResult { status: "live" | "queued" | "conflict" | "needsReconnect" | "expiredToken";
                       url?: string; conflict?: ConflictChoice[] }
// v0.4 (O): `expiredToken` is the SPECIFIC result of a ship/backup made with an expired PAT (distinct from the
// generic `needsReconnect`), so the UI says "your GitHub key expired, here is the 60-second renewal" not a vague
// failure. ship() refuses on a known-expired token BEFORE building any commit; the artifact stays QUEUED, safe.
export type ConflictChoice = "keepMine" | "keepRemote" | "shipAsCopy";
// P3 conflict round-trip: a `conflict` ShipResult carries the offered choices; the UI (L8/L11) sends
// the user's pick back via resolveConflict(artifact, choice, newFolderPath?):
//   keepMine   -> re-ship THIS artifact onto the current remote head (rebuild the tree on the new
//                 base_tree, the F12 retry path); never force-push (R10).
//   keepRemote -> abandon this ship; the engine pulls the remote version into the local project so
//                 local and remote agree, then returns { status: "live", url } for the remote file.
//   shipAsCopy -> ship to newFolderPath (REQUIRED for this choice; the UI supplies it, e.g.
//                 folderPath + "-copy"); a fresh commit with no conflict.
export interface FlushReport { shipped: number; queued: number; failed: number }
export interface AttributionStatus { willCountTowardGraph: boolean; authorEmail: string; reason?: string }
export interface PortfolioIndex { title: string; intro: string;
                           entries: Array<{ name: string; module?: string; date: number; hero?: boolean }> }
// v0.4 progress snapshot (single JSON to the PRIVATE backup repo). NOT secrets, NEVER the PAT. schemaVersion
// matches Store.schemaVersion so a restore onto a newer build migrates the snapshot forward (same migrate() hook).
// v6 (DESIGN v0.4.3): the snapshot ALSO carries the user's persisted Sandbox FILES (the `files` Store collection), so a
// fresh iPad restores FULLY, not just the Learn journey. Files ride as BackupFile (JSON-safe): verbatim text, or base64
// for binary (a Uint8Array is not JSON-safe); classifyBytes decides which. NO worker NamespaceId is carried (live
// session state is ephemeral; only persisted files are backed up). A pre-v6 snapshot has no `files`; the restore
// validator reads an absent `files` as [] (it captured none), so older backups still restore. On restore, files merge
// ADDITIVELY by path: a path with no local file is restored, a path that already exists locally is LEFT ALONE (local
// wins) and reported, never overwritten (the never-destroy invariant, like completedNodes union-by-id). A fresh device
// has no local files, so all restore. SIZE-GUARDED (BackupFile below) so the snapshot cannot balloon.
export interface ProgressBackup { schemaVersion: number; savedAt: number;
                           completedNodes: CompletedNode[];   // the honest progress log (CONTRACT 5)
                           reviews: ReviewState[];            // FSRS scheduler state (CONTRACT 6)
                           settings: Record<string, unknown>; // theme, key-row, console theme, reduced-motion
                           files: BackupFile[];               // v6: persisted Sandbox files (the `files` Store collection)
                           profile: ProfileFacts }            // name + epithet (CONTRACT 5); no secrets
export interface BackupFile { path: string;        // key in the `files` Store collection (project-relative, e.g. "main.py")
                       content: string;      // JSON-safe: verbatim text, or base64 when encoding is "base64"
                       encoding: "utf8" | "base64" } // wire encoding (distinct from FileBlob's storage "utf8" | "binary")
// v6 SIZE GUARDRAILS (concrete caps in backend B14, tunable at build): a file over the PER-FILE cap is SKIPPED and
// reported, never truncated; if the aggregate exceeds the TOTAL cap, prefer small/text files (the irreplaceable code)
// and skip the largest binary first, REPORTING the skipped set (never a silent drop). The F2 secret scan (D5) covers
// backed-up files too: a file that hits is EXCLUDED and reported, not written.
export interface BackupResult { status: "saved" | "queued" | "needsReconnect" | "expiredToken"; url?: string; at?: number }
// ship() internally: GET ref head -> build tree on base_tree -> commit parented to head -> PATCH ref
// NON-FORCE. On 422 (moved head): re-GET head, rebuild tree on the NEW base_tree, re-commit with the
// new parent, re-PATCH (F12). Never force-push (R10). scanArtifact() must be clean or ship() refuses.

// ============================================================================
// CONTRACT 4: the content schema the app LOADS (Byleth authors this independently)
// ============================================================================

// The app loads a CurriculumBundle. The CONTENT (lesson prose, exercises, tests, boss scenarios) is
// NOT in these specs; this schema is the target Byleth authors to, so authoring proceeds separately.
export interface CurriculumBundle { version: string; phases: Phase[]; units: Unit[];
                             modules: Module[]; awardMap: StatAwardMap /* CONTRACT 5 */ }
export type PhaseId = 1 | 2 | 3 | 4;
export type StrandId = "core" | "debug" | "tests" | "read" | "design" | "ship"
              | "stdlib" | "errors" | "review";
export interface Phase { id: PhaseId; name: string; moduleIds: string[]; milestone?: string }
export interface Unit { id: string; title: string; phase: PhaseId; moduleIds: string[]; emblem: string }
export interface Module { id: string; title: string; phase: PhaseId; strands: StrandId[];
                   lessons: Lesson[]; boss?: Boss; producesArtifact: boolean; conceptTags: string[];
                   terms: Term[] } // v0.4 progressive glossary (Q): Byleth authors the module's terms
export interface Lesson { id: string; title: string; steps: Step[] }
export type StepKind = "prose" | "liveExample" | "mcq" | "fillBlank" | "predictOutput" | "parsons"
              | "fixBug" | "specimenDecode" | "traceTable" | "writeStub" | "boss" | "reflection";
// D4 (Frederick delta-check): the ONE shared rule for which step kinds emit a completion node. The completion-log
// writer (backend B6) AND deriveGlossary (backend B16) both read THIS constant, never a private list, so "lesson
// complete" can never disagree between writer and reader. prose / liveExample / reflection are NON-emitting
// (passive read or ungraded capture); a lesson with none of these emitting kinds is an all-prose lesson whose
// terms unlock on the parent MODULE's completion (CONTRACT 7 fallback, B16).
export const COMPLETION_EMITTING_KINDS: ReadonlySet<StepKind> = new Set<StepKind>([
  "mcq", "fillBlank", "predictOutput", "parsons", "fixBug", "specimenDecode", "traceTable", "writeStub", "boss"
]);
export interface Step { id: string; kind: StepKind; conceptTags: string[]; strand?: StrandId;
                 statTags?: StatKey[]; // advisory-only in v1 (P9); not consumed by deriveStatSheet
                 reviewable?: boolean;   // v0.4 (P): default TRUE; authoring opt-out sets false
                 reviewForm?: ReviewForm; // v0.4 (P): the compact daily-review replay of this exercise (Byleth authors)
                 prompt?: string; body?: string; code?: string; expected?: string;
                 starterCode?: string; hiddenTests?: HiddenTest[]; hints?: string[];
                 modelSolution?: string; choices?: string[]; answerIndex?: number;
                 scrambled?: string[]; solutionOrder?: number[] }
export interface Boss { id: string; name: string; taunt: string; brief: string; emblem: string;
                 hiddenTests: HiddenTest[]; modelSolution: string; isPillar: boolean }
// v0.4 glossary TERM (per-module, Byleth-authored, Q). UNLOCK is pure-derived from the completion log (CONTRACT 7),
// stored nowhere; the term carries its home lesson for the deep-link back into Learn.
export interface Term { id: string; term: string; definition: string; // plain-language, Niko-voice
                 kind: "function" | "concept" | "phrase"; strand: StrandId;
                 sourceModuleId: string; sourceLessonId: string }
// v0.4 review FORM (P): a COMPACT replay of a reviewable exercise for the daily hand (CONTRACT 6). Light rungs only.
// v5 (Deviation 1 fix): sourceLessonId is the deep-link home for "open the full exercise", authored per reviewable
// Step exactly as Term carries it (same purpose, same contract block). enroll(node, form) reads it to populate the
// required ReviewState.sourceLessonId (CONTRACT 6); it is the ONLY path to the lesson id from enroll's typed inputs.
export interface ReviewForm { kind: "recall" | "predictOutput" | "fixBug" | "fillBlank";
                       sourceLessonId: string; // deep-link home (mirrors Term.sourceLessonId); enroll -> ReviewState
                       prompt: string; code?: string; expected?: string;
                       choices?: string[]; answerIndex?: number;
                       starterCode?: string; hiddenTests?: HiddenTest[]; hints?: string[] }

// ============================================================================
// CONTRACT 5: the stat model (pure-derived, stored nowhere)
// ============================================================================

export type StatKey = "SYNTAX" | "DEBUG" | "TESTS" | "READ" | "DESIGN" | "SHIP"; // fixed display order
export interface StatValue { key: StatKey; value: number; max: number }
export interface JobStar { pillarModuleId: string; lit: boolean; label: string }
export interface Title { id: string; label: string; earnedAt: number }
export interface Seal { id: string; label: string; tier: "bronze" | "silver" | "gold";
                 moduleId?: string; mintedAt: number }
export interface StatSheet {
  characterName: string; characterEpithet: string; // P13: user-controlled; render as TEXT never markup,
                                                    // escape on the portfolio README path (backend B8)
  level: number;                 // modules cleared, 0 to 33 (the one honest headline number)
  phase: PhaseId;
  className: string;             // Apprentice | Builder | Forgemaster | Wayfarer
  spriteTier: PhaseId;           // == phase; selects the costume asset
  jobMastery: { earned: number; total: number; stars: JobStar[] };
  titles: Title[];               // certs render as titles under the name
  stats: StatValue[];            // the six, fixed order
  seals: Seal[];
  shipCount: number;
  changedSince: StatKey[];       // rose since profile.lastViewedAt (the calm up-arrow)
}
export interface StatAwardMap {
  version: string;
  statMax: Record<StatKey, number>;                                  // full-bar target per stat
  byKind: Partial<Record<StepKind, Partial<Record<StatKey, number>>>>;
  byStrand: Partial<Record<StrandId, Partial<Record<StatKey, number>>>>;
  modulePrimary: Record<string, { stat: StatKey; bump: number }>;    // P7: keyed by moduleId; joins
                                                                     // CompletedNode.moduleId, kind==="module"
  bossAward: Record<string, { stat: StatKey; bump: number; seal: Seal; pillar: boolean }>;
                                                                     // P7: keyed by bossId; joins
                                                                     // CompletedNode.nodeId, kind==="boss" (nodeId===Boss.id)
  shipAward: number;                                                 // + SHIP per artifact node (kind==="artifact")
  titleFor: Record<string, Title>;                                  // P7: keyed by moduleId; joins
                                                                     // CompletedNode.moduleId, kind==="module" (M10 -> PCEP)
  classByPhase: Record<PhaseId, { className: string; spriteTier: PhaseId }>;
  phaseThresholds: Record<PhaseId, number>;                         // P2: min level (modules cleared) to be
                                                                     // IN each phase; phase = highest PhaseId
                                                                     // whose threshold <= level. No magic 10/20/30.
}
export interface CompletedNode { nodeId: string; kind: StepKind | "module" | "boss" | "artifact";
                          moduleId: string; strand?: StrandId; statTags?: StatKey[]; timestamp: number }
// P8: `strand` is REQUIRED (copied verbatim from Step.strand) on any step-kind node whose kind feeds
// byStrand (the DEBUG / TESTS / READ strands). The completion-log writer MUST stamp it (backend B6) or
// those three stats silently under-count. module / boss / artifact nodes may omit it.
// P9: `statTags` is ADVISORY-ONLY in v1 (authoring / analytics metadata). No award-map dimension
// consumes it; deriveStatSheet folds byKind + byStrand + modulePrimary + bossAward + shipAward only.
export interface ProgressSnapshot { completedNodes: CompletedNode[] }
export interface ProfileFacts { name: string; epithet: string; lastViewedAt: number }

// PURE. No I/O. Output stored NOWHERE (Throughline pure-derived-rank pattern). Recomputed on demand,
// memoized in memory only. deriveStatSheet is a fold: sum award-map contributions over completedNodes.
// level = count of kind==="module" nodes; phase = derived from level via awardMap.phaseThresholds (P2).
export declare function deriveStatSheet(progress: ProgressSnapshot, awardMap: StatAwardMap,
                                 profile: ProfileFacts): StatSheet;
export declare function detectPromotion(prevPhase: PhaseId, nextPhase: PhaseId):
  { promoted: boolean; from: PhaseId; to: PhaseId };

// ============================================================================
// CONTRACT 6: the review scheduler (FSRS, the one genuinely STATEFUL new collection)
// ============================================================================

// v0.4 FSRS spaced repetition: a state-of-the-art open scheduler (the algorithm Anki adopted), pure TypeScript,
// fully OFFLINE and deterministic given its inputs. Unlike stats/glossary (pure-derived, stored nowhere), review
// memory state genuinely EVOLVES per grade and CANNOT be re-derived from the completion log, so it is STORED in a
// new `reviews` collection (Store.schemaVersion -> 2). See DESIGN v0.4 P.
export type ReviewGrade = "failed" | "struggled" | "passed"; // three calm buttons -> FSRS Again / Hard / Good (backend N)
export interface ReviewState {
  itemId: string;          // stable id of the reviewable exercise (the Step.id it reviews)
  sourceLessonId: string;  // deep-link home for "open the full exercise"
  stability: number;       // FSRS S (days): how long the memory lasts
  difficulty: number;      // FSRS D (1 to 10): how hard this item is for Niko
  due: number;             // next-due timestamp (ms)
  lastReviewed: number;    // last grade timestamp (ms)
  reps: number; lapses: number;
  state: "new" | "learning" | "review" | "relearning";
}
export interface DueReview { itemId: string; sourceLessonId: string; form: ReviewForm; due: number } // form from CONTRACT 4
export interface ReviewScheduler {
  getDueReviews(now: number, cap: number): Promise<DueReview[]>;  // at most `cap` due now (calm hand; UI caps 5 to 8)
  recordReview(itemId: string, grade: ReviewGrade, now: number): Promise<ReviewState>; // FSRS fold + one write
  dueCount(now: number): Promise<number>;                        // drives the home-screen hand badge (no poll)
  enroll(node: CompletedNode, form: ReviewForm): Promise<void>;  // a newly-cleared reviewable exercise joins the pool
}
// enroll is called by the completion-log writer when a reviewable Step (reviewable !== false) is first cleared, so
// the review pool grows only from REAL completions (honesty invariant, v0 5.3). getDueReviews/dueCount never surface
// an item Niko has not actually done. A struggled/failed item simply comes back sooner: no miss shaming (v0.4 P).
// D9 (form's home, PINNED): DueReview.form is NOT persisted in ReviewState; getDueReviews RE-JOINS it from the
// loaded CurriculumBundle at read time (the item's Step.reviewForm, CONTRACT 4), keeping the stored `reviews`
// collection lean (the bundle is always loaded when a hand is drawn).
// D7 (SNAPSHOT PER SITTING, PINNED, Manager's product call for the calm ritual): a sitting = one app open, up to
// the next app open or the next day, whichever comes first. The hand is snapshotted ONCE per sitting: within it a
// graded card is DONE regardless of grade, and dueCount does NOT tick back up mid-session. FSRS learning/relearning
// may reschedule a just-failed card minutes out, but the scheduler MUST FILTER those library-scheduled same-day
// re-dues OUT of the current sitting's hand; a failed card returns only at the NEXT hand. Finishing the hand is a
// real, stable daily win.

// ============================================================================
// CONTRACT 7: the progressive glossary (pure-derived, stored NOWHERE, the stat-screen pattern)
// ============================================================================

// v0.4 progressive glossary (DESIGN v0.4 Q, Niko's feature). Which terms are UNLOCKED is PURE-DERIVED from the
// completion log, exactly like the Stat Screen: no stored unlock state, no migration, no drift. A term unlocks when
// its home lesson is complete, where "lesson complete" = every step of that lesson whose kind is in
// COMPLETION_EMITTING_KINDS (CONTRACT 4, the shared constant, D4) is present in the completion log (matched by
// Step.id). An ALL-PROSE lesson (no completion-emitting step) unlocks its terms on the parent MODULE's completion
// instead (the B16 fallback). deriveGlossary is a pure fold over (progress, bundle).
export interface GlossaryView {
  discovered: number; total: number;              // the "N of M discovered" count
  entries: Array<Term & { unlocked: boolean }>;   // locked entries render as silhouettes (frontend); Term = CONTRACT 4
}
export declare function deriveGlossary(progress: ProgressSnapshot, bundle: CurriculumBundle): GlossaryView;
// PURE. No I/O. Output stored nowhere, memoized in memory only (same discipline as deriveStatSheet). Byleth's
// authoring obligation: author each module's `terms` and keep every term's sourceLessonId pointed at a real lesson
// whose completion-emitting step set is determinate (Frederick delta-check: "lesson complete" must be well-defined).

// End of verbatim contract transcription (STB-CONTRACT-v6).
