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

## Suite counts

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Frontend tests (Lysithea's 28 files) | 147 | 147 | 0 | 0 |
| Engine tests (Hubert's 17 files, fixture/mocked) | 152 | 152 | 0 | 0 |
| Engine real-Pyodide tests | N/A | N/A | N/A | N/A |
| Integration total (46 files) | 312 | 311 | 0 | 1 |

The 1 skipped test is `secretsVault.test.ts` "refuses to construct against an environment with no
localStorage": structurally correct for Node (where localStorage is absent) but skipped under jsdom
(where it exists). The real boundary is proven by the worker-boundary-guard (zero import violations)
and by `defaultSecretStorageBackend`'s throw on a missing `localStorage`. This test passes in
Hubert's wing's Node-only suite (152/152).

The real-Pyodide suite (13 tests) is not run in the integrated workspace because it requires the
`pyodide` npm package's full runtime as a devDependency (already present for types but the tests
need the real `loadPyodide`). Those 13 tests pass in Hubert's wing (verified there).

**Build:** `npm run build` clean (tsc --noEmit + vite build).
**Worker guard:** `npm run worker-guard` PASS (0 violations).
**Typecheck:** `npx tsc --noEmit` clean (0 errors).

---

## I9 Verification Ledger

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Live COOP/COEP on deployed Vercel URL | DEFERRED-TO-DEPLOY | No deployed URL yet |
| 2 | Pinned Pyodide `script-src` verified hands-on | DEFERRED-TO-DEPLOY | CSP set to `wasm-unsafe-eval`; needs live verify |
| 3 | SAB input/interrupt on real iPad Safari | DEFERRED-TO-DEPLOY | Needs real device |
| 4 | CodeMirror 6 VoiceOver on real iPad | DEFERRED-TO-DEPLOY | Needs real device |
| 5 | Grading isolation leak tests | PASS | workerProtocolEngine.test.ts: both F9 leak tests pass (scripted + real-Pyodide in wing) |
| 6 | Global flash cooldown <=2/sec | PASS | flashGate.test.ts: 10-rapid-fire chain stays within budget |
| 7 | Secret scan blocks planted tokens | PASS | scanArtifact.test.ts: ghp_, sk_, github_pat_, entropy all blocked |
| 8 | 422 retry + attribution check | PASS | githubSyncClient.test.ts: genuine 422 rebuild + attribution flags |
| 9 | Service worker versioned caches | PASS (structure) | sw.js: versioned name, old-cache delete on activate, hash constant present |
| 10 | Secrets boundary: worker cannot open secrets | PASS | worker-guard: 0 violations; secretsVault backs on localStorage (Worker-unreachable) |
| 11 | Contract byte-identity check | PASS | SHA-256 7068ec34 matches across all three specs |
| 12 | Reduced-motion reconciliation | PASS | global.css zeroes all animation under the query; each celebration has its own skip path |
| 13 | Weekly canary does NOT hold real PAT | PASS (structure) | canary.yml uses ambient GITHUB_TOKEN, never the app PAT; permissions block present |
| 14 | FSRS determinism + enrollment-only pool | PASS | reviewScheduler.test.ts: fixed (state, grade, now) -> fixed next state; honesty throw on unenrolled |
| 15 | Backup carries NO secret + restore merges | PASS | githubSyncClient.test.ts: backup to PRIVATE repo, secret-scan gate, corrupt rejection |
| 16 | PAT expiry capture + sanity guard | PASS | tokenExpiryCapture.test.ts: sanity guard detects tracking-now bug -> captured:false |
| 17 | deriveGlossary determinism + all-prose fallback | PASS | deriveGlossary.test.ts: mixed-kind + all-prose module-completion fallback |
| 18 | Sandbox works at zero state | PASS | SandboxScreen.test.tsx: fresh mock store, no restore, create -> Run -> see output |
| 19 | MEMFS file drain: session emits, graded does not | PASS (protocol) | workerProtocolEngine.ts emits fileDrain for session only; check path has no drain call |

**Summary:** 14 PASS, 5 DEFERRED-TO-DEPLOY (items 1 to 4 need live Vercel / real iPad / real PAT).

---

## Deviations

**0 new deviations.** Hubert's Deviation 1 (sourceLessonId) is closed by the v5 re-stamp.
No contract type in `src/contracts.ts` was edited beyond the v5 additions Simbo stamped.
No integration forced a contract change (I10 satisfied).

---

## Deploy-phase items (what remains)

1. **Vercel deploy + live COOP/COEP verification** (I9 items 1, 2)
2. **Real iPad Safari testing:** SAB input/interrupt (item 3), CodeMirror 6 VoiceOver (item 4)
3. **Real PAT hands-on:** PAT-expiry header verification against Niko's actual fine-grained PAT
   (checklist item 27)
4. **Swap mocks for real engine concretes at the composition root:** IndexedDbStore, createSecretsVault,
   createGitHubAuth, createGitHubSync, createReviewScheduler. Each is a one-line swap.
5. **Real Web Worker integration:** test `worker-entry.ts` in a real browser with the real Pyodide
   314.0.2 runtime (the manual-harness from Hubert's wing, adapted)
6. **PyodideEngine.drainFiles real implementation:** scan the session MEMFS dir for new/changed files
   after a run (the protocol wiring is built; only the MEMFS read is stubbed)
7. **matplotlib Agg-backend capture:** genuinely needs live Pyodide with matplotlib loaded; cannot
   be proven offline
8. **ShipCelebration/ConflictSheet wiring:** built and tested in isolation, need the real ship trigger
   flow (boss victory -> artifact -> ship offer, O10/R11)
9. **Service worker hash-pin verification:** verify pinned Pyodide wasm hash against the actually
   vendored asset at deploy
10. **First-load size number:** update the FirstLoadPrimer's sizeMb to the true measured value from
    the deployed bundle (currently set to 13 MB per PINS.md's core total)
