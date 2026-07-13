# INTEGRATION-REPORT.md, Snake ToolBox

**Built by:** Edelgard (Full-Stack / Integration Lead, Coding Wing)
**Date:** 2026-07-12
**Contract:** STB-CONTRACT-v5, digest 7068ec34 (byte-identical across all three specs, verified)
**Workspace:** `C:\Users\meowr\dev\snake-toolbox\` (git init, integration branch, no remote)
**Sources:** `C:\Users\meowr\dev\snake-toolbox-wing\frontend\` (Lysithea, untouched),
`C:\Users\meowr\dev\snake-toolbox-wing\backend\` (Hubert, untouched)

---

## What was wired

### Composition root (I1)
One `src/App.tsx` replaces Lysithea's mock-wired scaffolding. It instantiates all seven seam
bindings (Store, SecretsVault, WorkerClient, GitHubAuth + GitHubSync, CurriculumBundle loader,
deriveStatSheet + deriveGlossary, ReviewScheduler) and injects them into screens. No screen news up
a concrete. Currently wired through mocks for the frontend-testable pass; the real engine concretes
(IndexedDbStore, createSecretsVault, createGitHubAuth, createGitHubSync, createReviewScheduler) are
imported and typecheck-proven via contractConformance.ts, ready for a one-line swap at each seam.

### App.tsx adoption call (Lysithea's open question 1)
Lysithea's `App.tsx` is retired as throwaway demo wiring. It contained demo-only calls (the
boss-battle preview link, hardcoded fixture progress, a fixture hash in the boot message) that are
not meant to ship. The new root keeps the same screen routing but uses the real Pyodide version +
hash (314.0.2 per PINS.md), honest `crossOriginIsolated` detection, and the real install-state
detection for the durability ladder. Tell Lysithea: her App.tsx served its purpose perfectly as
scaffolding and every screen it composed is adopted unchanged.

### v5 delta (all three rulings applied)
1. **Ruling 1 (ReviewForm.sourceLessonId):** The new field is in contracts.ts (v5). Every ReviewForm
   fixture/mock in both halves now carries it. Engine's `reviewScheduler.enroll()` reads
   `form.sourceLessonId` directly; the old `node.moduleId` fallback is retired. The engine test is
   updated. Deviation 1 is closed.

2. **Ruling 2 (fileDrain):** `WorkerToMain` gains the `fileDrain` variant in contracts.ts (v5).
   `WorkerProtocolEngine.handleRun()` emits `fileDrain` after a `session` run (never graded, never
   scratch). `PythonEngine` gains a `drainFiles(namespace)` method (FakePythonEngine returns
   configurable fixtures; PyodideEngine is stubbed, deferred to deploy phase for the real MEMFS
   scan). The worker mock emits `fileDrain` on session runs that contain `open(`. The composition
   root's worker subscription handles `fileDrain` for session namespace (currently mock, ready for
   real Store.put at deploy).

3. **Ruling 3 (keepRemote shape, delegated to me):**
   - **Keying:** repo-relative path (e.g. `m1-variables/main.py`) becomes the Store `files`
     collection key. This is the same key the file rail and the ship artifact use, so a file pulled
     via keepRemote is immediately renderable and shippable with no additional mapping.
   - **Normalization:** Hubert's interim `{ base64Content }` is reconciled into `FileBlob` at the
     composition root before the Store write. Text files (detected by extension: `.py`, `.txt`,
     `.md`, `.json`, `.csv`, `.cfg`, `.toml`, `.ini`, `.yaml`, `.yml`) are base64-decoded to
     `{ text, encoding: "utf8" }`; everything else goes to `{ bytes, encoding: "binary" }`. This
     is a one-shape collection: the `files` store holds only `FileBlob`, never the raw GitHub API
     shape.
   - **Where this lives:** the reconciliation function will live at `src/engine/github/keepRemoteReconcile.ts`
     when the real GitHubSyncClient swap is wired. For now, the shape is documented and the mock
     already returns `FileBlob` directly.

### Web Worker entry point (src/worker-entry.ts)
The real `self.onmessage` handler wiring `WorkerProtocolEngine` + `PyodideEngine`. SAB buffers are
passed through unchanged in the boot message (the protocol layer already reads `inputCapable`
correctly from null vs real SharedArrayBuffer). An unhandled error in the protocol layer emits
`fatal("crash")` rather than silently stopping.

### SAB input/interrupt handshake (B4)
The P1 degraded path is intact: `crossOriginIsolated === false` -> both SABs null -> boots, runs,
input/interrupt off, never hangs. `ready.inputCapable === false` drives the L2 banner. The full SAB
handshake (real `SharedArrayBuffer` + `Atomics.wait`/`Atomics.store` for synchronous input()) is
deferred to the deploy phase, exactly as Hubert documented (his `stop()`/`provideInput()` are
documented no-op stubs in `PyodideEngine`). The protocol layer and the mock suite both exercise the
degraded and isolated paths.

### Mode switch (I2)
Learn uses graded + scratch namespaces; Sandbox uses session. One worker, main-thread policy only.

### Deploy posture (I5)
- `vercel.json`: COOP same-origin, COEP require-corp, CSP with `wasm-unsafe-eval` (to be verified
  hands-on against pinned Pyodide 314.0.2 at deploy, checklist item 2), X-Content-Type-Options
  nosniff.
- `public/sw.js`: versioned cache (`stb-v1`), old-cache deletion on activate, cache-first for
  same-origin assets. Hash-pinned Pyodide constant is present (from PINS.md).
- Canary workflows (`canary.yml`, `canary-keepalive.yml`) carried over from Hubert's `.github/`.

### Flash cooldown gate (I7)
`globalFlashGate` singleton at `src/lib/flashGate.ts` (max 2 fires per rolling 1-second window).
All celebrations route through `requestCelebration`/`fireWhenReady`. Test proves the gate holds
under rapid chaining.

### esbuild/Vite advisory decision
Staying on Vite 5. The npm audit finding is dev-server-only (esbuild's request forwarding), never
shipped in `dist/`. A Vite 8 beta major bump mid-integration is default-NO per the task
instructions. The finding does not affect the shipped build. Revisit for a dedicated Vite-bump pass
after Vite 8 reaches stable GA.

### matplotlib figure rendering
The `figure` event type and hook plumbing exist and are tested via the fake engine. The real
Agg-backend PNG capture is NOT built in this pass: PyodideEngine has no matplotlib-specific
interception code, and the pinned Pyodide 314.0.2 npm package does not ship matplotlib (it is
fetched on demand via `loadPackage`). This genuinely needs the live deploy to prove. Listed as a
deploy-phase item, not faked.

---

## keepRemote shape (Ruling 3, pinned)

| Concern | Decision |
|---|---|
| Store collection | `files` (one collection, one shape) |
| Key | repo-relative path, e.g. `m1-variables/main.py` |
| Value shape | `FileBlob` (CONTRACT 1): `{ path, text?, bytes?, encoding }` |
| Text detection | by extension: `.py .txt .md .json .csv .cfg .toml .ini .yaml .yml` |
| Binary fallback | everything else: `{ bytes: Uint8Array, encoding: "binary" }` |
| Hubert's `{ base64Content }` | reconciled at the composition root before Store write, never stored |

---

## Contract drift check

| Source | SHA-256 (contract block, inclusive of BEGIN/END lines) |
|---|---|
| integration-overview.md | `7068ec3462216b33693e2498e534f201bb60787242e51d7f1e2dc4b2663a697a` |
| frontend-spec.md | `7068ec3462216b33693e2498e534f201bb60787242e51d7f1e2dc4b2663a697a` |
| backend-spec.md | `7068ec3462216b33693e2498e534f201bb60787242e51d7f1e2dc4b2663a697a` |

All three match. The Manager's verified digest `7068ec34` is confirmed.

The two wing `contracts.ts` transcriptions differ only in their header comments (Lysithea's vs
Hubert's authorship note); the actual type/interface content is identical between them (both at v4).
The integrated `src/contracts.ts` is at v5 with the two additions (fileDrain, sourceLessonId).

---

## Fix round: real worker wiring (2026-07-12, blocker fix)

**Problem:** App.tsx used `createMockWorkerClient()` in production. Every Run returned "3.5" (the
mock's scripted output). No real `WorkerClient` adapter existed anywhere in `src/engine`. The
`worker-entry.ts` was built but nothing instantiated it. The app's heart was unplugged.

**What was built:**

1. **`src/workerClient.ts`** (the REAL main-thread WorkerClient): wraps `new Worker(new URL(
   "./worker-entry.ts", import.meta.url), { type: "module" })`. Handles:
   - SAB construction gated on `crossOriginIsolated` (P1 degraded path: both null when false)
   - Boot message with pinned pyodideVersion (314.0.2) and pyodideHash from PINS.md
   - `fatal` -> auto-respawn (F10): old worker terminates, fresh one spawns
   - All CONTRACT 1 messages pass through unchanged (structured-clone safe)
   - `dispose()` terminates the worker cleanly

2. **App.tsx swapped:** `createMockWorkerClient()` replaced with `createWorkerClient()`. The
   `WorkerClient` interface is now exported from `src/workerClient.ts` (not from mocks). All three
   screens (LearnScreen, SandboxScreen, BossScreen) now import `WorkerClient` from the real module.

3. **Self-hosted Pyodide:** Core Pyodide assets (wasm, stdlib, lock, mjs) copied to
   `public/pyodide/` via `scripts/copy-pyodide-assets.mjs` (runs on `npm install` via postinstall).
   `worker-entry.ts` computes `PYODIDE_INDEX_URL` from `self.location.href` and passes it to
   `PyodideEngine({ indexURL })`, which passes it to `loadPyodide({ indexURL })`. Pyodide loads
   from the same origin, no CDN, works under require-corp.

4. **Production no-mock guard** (`scripts/no-mock-in-prod-guard.mjs`): proves no production source
   file imports the test worker mock. Same spirit as worker-guard. `npm run no-mock-guard` is the
   command.

5. **Playwright E2E test** (`e2e/smoke.spec.ts`): two tests against `vite preview`:
   - Clicks "Sounds good, let's go" to dismiss the primer, waits for "Python runtime is warm",
     navigates to Sandbox, clicks Run on the default code (`print("hello from a fresh Sandbox")`),
     asserts the stdout "hello from a fresh Sandbox" appears in the output stream.
   - Asserts `crossOriginIsolated === true` under the served COOP/COEP headers.
   Both pass (2/2, 5.9s).

6. **Test isolation:** `tests/App.test.tsx` mocks `src/workerClient` via `vi.mock()` so the unit
   test suite runs under jsdom without a real Web Worker. The mock stays test-only.

**End-to-end proof evidence (automated, Playwright, headless Chromium):**
- Command: `npx playwright test`
- Server: `vite preview --port 4173` (production build, COOP/COEP headers active)
- Test 1: `crossOriginIsolated === true` (PASS)
- Test 2: Primer dismissed -> Pyodide boots -> Sandbox -> Run -> "hello from a fresh Sandbox"
  appears in the output (PASS, 5.9s total)
- This is REAL Python executed by REAL Pyodide in a REAL browser. Not a mock. Not "should work."

---

## Suite counts (after fix round)

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit tests (46 files, vitest) | 312 | 311 | 0 | 1 |
| E2E tests (1 file, Playwright) | 2 | 2 | 0 | 0 |
| **Total** | **314** | **313** | **0** | **1** |

The 1 skipped test is `secretsVault.test.ts` "refuses to construct against an environment with no
localStorage": structurally correct for Node (where localStorage is absent) but skipped under jsdom
(where it exists). The real boundary is proven by the worker-boundary-guard (zero import violations)
and by `defaultSecretStorageBackend`'s throw on a missing `localStorage`. This test passes in
Hubert's wing's Node-only suite (152/152).

**Build:** `npm run build` clean (tsc --noEmit + vite build).
**Worker guard:** `npm run worker-guard` PASS (0 violations).
**No-mock guard:** `npm run no-mock-guard` PASS (0 violations).
**Typecheck:** `npx tsc --noEmit` clean (0 errors).

---

## I9 Verification Ledger

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Live COOP/COEP on deployed Vercel URL | PASS (local) | E2E: `crossOriginIsolated === true` in headless Chromium against vite preview. DEFERRED for live Vercel URL |
| 2 | Pinned Pyodide `script-src` verified hands-on | PASS (local) | E2E: Pyodide 314.0.2 loads and runs under `wasm-unsafe-eval` CSP. DEFERRED for live Vercel verify |
| 3 | SAB input/interrupt on real iPad Safari | DEFERRED-TO-DEPLOY | Needs real device |
| 4 | CodeMirror 6 VoiceOver on real iPad | DEFERRED-TO-DEPLOY | Needs real device |
| 5 | Grading isolation leak tests | PASS | workerProtocolEngine.test.ts: both F9 leak tests pass (scripted + real-Pyodide in wing) |
| 6 | Global flash cooldown <=2/sec | PASS | flashGate.test.ts: 10-rapid-fire chain stays within budget |
| 7 | Secret scan blocks planted tokens | PASS | scanArtifact.test.ts: ghp_, sk_, github_pat_, entropy all blocked |
| 8 | 422 retry + attribution check | PASS | githubSyncClient.test.ts: genuine 422 rebuild + attribution flags |
| 9 | Service worker versioned caches | PASS (structure) | sw.js: versioned name, old-cache delete on activate, hash constant present |
| 10 | Secrets boundary: worker cannot open secrets | PASS | worker-guard + no-mock-guard: 0 violations each; secretsVault backs on localStorage |
| 11 | Contract byte-identity check | PASS | SHA-256 7068ec34 matches across all three specs |
| 12 | Reduced-motion reconciliation | PASS | global.css zeroes all animation under the query; each celebration has its own skip path |
| 13 | Weekly canary does NOT hold real PAT | PASS (structure) | canary.yml uses ambient GITHUB_TOKEN, never the app PAT; permissions block present |
| 14 | FSRS determinism + enrollment-only pool | PASS | reviewScheduler.test.ts: fixed (state, grade, now) -> fixed next state; honesty throw on unenrolled |
| 15 | Backup carries NO secret + restore merges | PASS | githubSyncClient.test.ts: backup to PRIVATE repo, secret-scan gate, corrupt rejection |
| 16 | PAT expiry capture + sanity guard | PASS | tokenExpiryCapture.test.ts: sanity guard detects tracking-now bug -> captured:false |
| 17 | deriveGlossary determinism + all-prose fallback | PASS | deriveGlossary.test.ts: mixed-kind + all-prose module-completion fallback |
| 18 | Sandbox works at zero state | PASS (E2E) | Playwright: fresh app, no saved data, primer -> boot -> Sandbox -> Run -> real stdout appears |
| 19 | MEMFS file drain: session emits, graded does not | PASS (protocol) | workerProtocolEngine.ts emits fileDrain for session only; check path has no drain call |
| E2E | Trivial run against real Pyodide in a browser | PASS | Playwright headless Chromium: `print("hello from a fresh Sandbox")` -> stdout in OutputStream |

**Summary:** 17 PASS (including the E2E trivial-run proof), 2 DEFERRED-TO-DEPLOY (items 3, 4: real iPad Safari).
Items 1 and 2 now PASS locally via Playwright; live Vercel confirmation still needed at deploy.

---

## Round 2: consolidated fixes + progression spine (2026-07-12)

### Part A: Frederick's fixes

| Fix | Status | Evidence |
|---|---|---|
| S1: respawn replays boot args, cap + backoff | DONE | workerClient.ts: lastBootArgs cached, replayed on fatal, MAX_RESPAWNS=3 in 30s window |
| S2: CSP on vite preview | DONE (item 2 now PASS-local) | vite.config.ts: CSP header on both server + preview; E2E boots Pyodide under wasm-unsafe-eval |
| S3: directory-rule no-mock guard | DONE | guard rewrote to MOCK_IMPORT_PATTERN + DATA_FIXTURE_ALLOWLIST; exits 0 with zero violations |
| S4: SW registered + manifest | DONE | main.tsx registers sw.js; manifest.json shipped; dead PYODIDE_PINS removed from sw.js |
| S5: keepRemoteReconcile | DONE | TextDecoder {fatal:true, ignoreBOM:true}; 5 tests: binary-as-.txt, no-ext text, BOM, valid UTF-8, all-zeroes |
| S6: fileDrain protocol tests | DONE | 3 tests: session writes -> drain emitted; graded writes -> no drain; no-write -> no empty drain |
| N1: canary dedupe closed issues | DEFERRED | Low priority, Frederick rated NOTE; no code change |
| N5: GlossaryScreen comment fix | DEFERRED | Cosmetic comment correction, no functional impact |

### Part B: progression spine + router (Simbo's gaps 1 to 7)

| Gap | Status | What landed |
|---|---|---|
| 1: fixture-as-real lie on Stat Screen | FIXED | Real CompletedNode log at the root; deriveStatSheet bound to it; zero state = honest level-0 Apprentice |
| 2: boss victory dead-end | FIXED | onVictory records boss + module + artifact nodes, runs detectPromotion, fires PromotionCutscene through flash gate |
| 3: Ship flow unreachable | FIXED | ShipCelebration wired to boss victory auto-OFFER (one tap, O10/R11) |
| 4: nothing persists | PARTIAL | In-memory Store (makeInMemoryStore) wired; real IndexedDbStore swap is deploy-item (async open) |
| 5: Learn locked to one lesson | FIXED | Three-view router (map / module / lesson) per R1 to R10; derived gating; goToLesson deep-link |
| 6: fileDrain to file rail | PARTIAL | Protocol emission proven (S6 tests); SandboxScreen subscription + Store write deferred to real IndexedDbStore |
| 7: glossary deep-link dead | FIXED | onOpenLesson prop wired from ProgressScreen through goToLesson to the Learn router |

### Execution mocks replaced

| Mock | Replacement | Status |
|---|---|---|
| createMockWorkerClient | createWorkerClient (real Web Worker) | DONE (round 1) |
| createMockReviewScheduler | createReviewScheduler (ts-fsrs + Store) | DONE |
| createMockGitHubAuth | createGitHubAuth (real, disconnected at zero state) | DONE |
| createMockGitHubSync | createGitHubSync (real, disconnected at zero state) | DONE |
| mockDetectPromotion | detectPromotion (real engine) | DONE |
| FIXTURE_GLOSSARY in ProgressScreen | deriveGlossary (real derivation from log) | DONE |
| FIXTURE_STAT_SHEETS in App | deriveStatSheet (real derivation from log) | DONE |

### Suite counts (round 2)

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit tests (47 files, vitest) | 320 | 319 | 0 | 1 |
| E2E tests (1 file, Playwright) | 2 | 2 | 0 | 0 |
| **Total** | **322** | **321** | **0** | **1** |

### Revised I9 ledger (round 2)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | COOP/COEP on preview | PASS (local) | E2E: crossOriginIsolated===true under preview headers |
| 2 | Pyodide under wasm-unsafe-eval CSP | PASS (local, S2 fix) | E2E: Pyodide boots and runs Python under the CSP enforced on vite preview |
| 3 | SAB input/interrupt on real iPad Safari | DEFERRED-TO-DEPLOY | Needs real device |
| 4 | CodeMirror 6 VoiceOver on real iPad | DEFERRED-TO-DEPLOY | Needs real device |
| 5 | Grading isolation leak tests | PASS | 6 protocol tests: scratch/session/monkeypatch/seed/MEMFS/cross-isolation |
| 6 | Global flash cooldown | PASS | flashGate.test.ts: 10-chain stays within budget |
| 7 | Secret scan blocks planted tokens | PASS | scanArtifact.test.ts |
| 8 | 422 retry + attribution | PASS | githubSyncClient.test.ts |
| 9 | Service worker | PASS | SW registered in main.tsx, versioned cache, old-cache delete |
| 10 | Secrets boundary | PASS | worker-guard + no-mock-guard clean; localStorage boundary |
| 11 | Contract byte-identity | PASS | SHA-256 7068ec34 x3 |
| 12 | Reduced-motion | PASS | global.css + per-component skip paths |
| 13 | Canary no PAT | PASS (structure) | canary.yml: ambient GITHUB_TOKEN only |
| 14 | FSRS determinism | PASS | reviewScheduler.test.ts |
| 15 | Backup no secret + restore | PASS | githubSyncClient.test.ts |
| 16 | PAT expiry sanity guard | PASS | tokenExpiryCapture.test.ts |
| 17 | deriveGlossary | PASS | deriveGlossary.test.ts |
| 18 | Sandbox zero state | PASS (E2E) | Playwright: primer -> boot -> Sandbox -> Run -> real stdout |
| 19 | fileDrain session/graded | PASS | 3 protocol tests: session drain emits, graded never drains, no-write no empty drain |
| E2E | Trivial run (real Pyodide) | PASS | Playwright: real Python output in the OutputStream |

**Summary:** 18 PASS (including E2E), 2 DEFERRED-TO-DEPLOY (items 3, 4: real iPad Safari).

---

## Deviations

**0 deviations.** No contract change forced in round 2 (I10 satisfied).

---

## Round 3: persistence, real drain, PWA icons, N1/N5 (2026-07-12)

### What closed

| Item | Status | Evidence |
|---|---|---|
| Gap 4: IndexedDbStore persistence | DONE | AppRoot.tsx opens IndexedDbStore, passes to App; progress + files hydrated on mount, persisted on change |
| Gap 6: fileDrain to file rail | DONE | SandboxScreen subscribes to drainedFiles prop, UPSERTs into local state + Store |
| PyodideEngine.drainFiles | DONE | Real session-dir MEMFS scan (/home/pyodide, separate from /grading), snapshot tracking |
| PWA icons | DONE | generate-pwa-icons.mjs: 192x192 and 512x512 PNGs from app color tokens, no new deps |
| N1: canary dedupe | DONE | canary.yml: state:"all", reopens closed issues |
| N5: glossary comment + lock contrast | DONE | Comment fixed; IconLock color raised to #8a7e72 for 3:1+ contrast |

### Suite counts (round 3)

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit tests (47 files, vitest) | 320 | 319 | 0 | 1 |
| E2E tests (1 file, Playwright) | 2 | 2 | 0 | 0 |
| **Total** | **322** | **321** | **0** | **1** |

---

## Micro-round: reconciler wiring, drain decoder, ship button (2026-07-12)

Three loose ends Frederick caught as doable without a PAT or browser:

1. **S5 reconciler wired:** `githubSyncClient.ts` keepRemote path now calls
   `reconcileKeepRemoteFile()` instead of writing raw `{ base64Content }`. The `files`
   collection holds exactly one shape (`FileBlob`).

2. **Drain decoder fixed:** extracted `classifyBytes` as a shared helper
   (`src/engine/classifyBytes.ts`) used by both `keepRemoteReconcile` and
   `PyodideEngine.drainFiles`. The old `drainFiles` used `TextDecoder({fatal:false})` and
   always stored `{text, encoding:"utf8"}`, which would have mangled binary session files.
   Now it classifies correctly: valid UTF-8 -> text, anything else -> binary losslessly.
   6 unit tests on the helper cover all attack cases (binary-as-.txt, BOM, gzip-as-json,
   no-extension, empty).

3. **Ship button wired:** `ShipCelebration` gains `onShip` + `shipping` props. App.tsx's
   `handleShip` calls `githubSync.ship()` on the explicit tap only (consent property: never
   silent, O10/R11). With no token connected, the result is the honest
   `needsReconnect` path, which the UI already renders.

Suite: 326 unit tests (325 pass, 1 skip), 2 E2E pass. Typecheck, build, both guards clean.

---

## Hardening round (2026-07-13)

| Letter | Item | Status | Evidence |
|---|---|---|---|
| A | SW: build-derived cache version, network-first shell, update prompt, version stamp | DONE | sw.js reads `?v=` param from main.tsx; network-first for shell, cache-first for pyodide; update prompt via postMessage("skipWaiting") |
| B | SAB input/interrupt handshake | DONE | PyodideEngine: setInterruptBuffer on boot, stop() writes SIGINT via Atomics.store, provideInput resolves pending input. Degraded null-SAB path unchanged. iPad Safari proof: DEFERRED (deploy) |
| C | 401 re-queues the artifact | DONE | githubSyncClient.ts: NotConnectedError + 401 now call queue.enqueueShip before returning needsReconnect |
| D | Storage meter + aggressive install nudge | DONE | Durability threshold: fires after first completed step or first saved file, not a vague threshold |
| E | Canary arming + PYODIDE_VERSION constant | DONE | pyodideManifest.ts: one constant for version + hash; DEPLOY-RUNBOOK.md: ten-minute arming checklist |
| F | Bundle validator + completeness test | DONE | bundleValidator.ts: validates Term/ReviewForm sourceLessonId, awardMap keys, unique ids, strand on emitting steps, flags all-prose; assertAllModulesCompletable: 5 tests |

### SAB input/interrupt handshake proven end to end

Two Playwright E2E tests against the real Pyodide worker under COOP/COEP + CSP headers
(headless Chromium, `crossOriginIsolated === true`, real SharedArrayBuffers):

1. **input() round trip (PASS):** `name = input("your name? ")` + `print(f"hello {name}")`
   -> InputRequest UI appears -> user types "Niko" -> program prints "hello Niko".
   The SAB `Atomics.wait`/`Atomics.notify` handshake works: the worker blocks synchronously
   in the Pyodide stdin callback, the main thread writes input bytes directly to the
   inputBuffer SAB and notifies, the worker unblocks and Python receives the value.

2. **Stop interrupt (PASS):** `while True: pass` -> loop runs -> user clicks Stop ->
   main thread writes SIGINT (2) to the interruptBuffer via `Atomics.store` ->
   `pyodide.setInterruptBuffer` catches it between opcodes and raises KeyboardInterrupt ->
   the run terminates -> a follow-up `print("still alive")` proves the engine is still usable.

**Product bugs found and fixed during this round:**
- `pyodide.setInterruptBuffer` expects an `Int32Array`, not a raw `SharedArrayBuffer`
  (passing the raw buffer silently did nothing; the interrupt never fired)
- `inputBuffer` was only 4 bytes (one Int32), too small for the B4 protocol's 8-byte
  header + data layout; raised to 4104 bytes (8 header + 4096 data)
- Pyodide's stdout/stderr hooks needed to be wired at `loadPyodide` time so print output
  routes through the current run's hooks

**Item B now shrinks to WebKit-only:** the handshake is proven in a real browser (Chromium).
Only iPad Safari re-verification remains on the deploy list.

### Suite counts (hardening round, final)

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit tests (49 files, vitest) | 331 | 330 | 0 | 1 |
| E2E tests (2 files, Playwright) | 4 | 4 | 0 | 0 |
| **Total** | **335** | **334** | **0** | **1** |

---

## Deviations

**0 deviations across all rounds.** No contract change forced (I10 satisfied).

---

## What genuinely remains (each requires a live deploy, a real device, or a real token)

1. **Vercel deploy + live URL verification:** COOP/COEP + CSP confirmed locally, need live Vercel confirmation (see DEPLOY-RUNBOOK.md)
2. **Real iPad Safari (WebKit only):** SAB input/interrupt re-verified on WebKit (Chromium proven via E2E), CodeMirror 6 VoiceOver (item 4)
3. **Real PAT hands-on:** header verification against Niko's actual fine-grained PAT (checklist 27)
4. **matplotlib Agg-backend capture:** genuinely needs live Pyodide with the package loaded via loadPackage
5. **Byleth's curriculum content:** the Learn router + player + bundle validator are built, awaiting real content
6. **Real sprite art for tiers 2 to 4:** placeholder recolors, honestly labeled, await authoring
