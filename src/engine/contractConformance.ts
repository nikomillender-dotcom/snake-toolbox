// contractConformance: a single file that mechanically proves every real implementation in this
// engine satisfies its frozen CONTRACT interface or function signature (contracts.ts), endpoint by
// endpoint. Each line below is a type-level assignability check with ZERO runtime cost (no import
// of contracts.ts's ambient `declare function`s as values, since those have no emitted JS; only
// their TYPES are used here). If an implementation's signature ever drifts from the contract, this
// file fails to typecheck, which is exactly the point: `npm run typecheck` is the conformance gate.
//
// This is Hubert's own paranoia layer, not part of the frozen contract block.
import type {
  CurriculumBundle,
  GitHubAuth,
  GitHubSync,
  GlossaryView,
  PhaseId,
  ProfileFacts,
  ProgressSnapshot,
  ReviewScheduler,
  SecretsVault,
  StatAwardMap,
  StatSheet,
  Store,
} from "../contracts.js";

import { deriveStatSheet } from "./derive/deriveStatSheet.js";
import { detectPromotion } from "./derive/detectPromotion.js";
import { deriveGlossary } from "./derive/deriveGlossary.js";
import { IndexedDbStore } from "./store/indexedDbStore.js";
import { createSecretsVault } from "./secrets/secretsVault.js";
import { createGitHubAuth } from "./github/githubAuth.js";
import { createGitHubSync } from "./github/githubSyncClient.js";
import { createReviewScheduler } from "./fsrs/reviewScheduler.js";

// CONTRACT 5: deriveStatSheet / detectPromotion -----------------------------------------------
type DeriveStatSheetFn = (progress: ProgressSnapshot, awardMap: StatAwardMap, profile: ProfileFacts) => StatSheet;
type DetectPromotionFn = (prevPhase: PhaseId, nextPhase: PhaseId) => { promoted: boolean; from: PhaseId; to: PhaseId };
const _deriveStatSheetConforms: DeriveStatSheetFn = deriveStatSheet;
const _detectPromotionConforms: DetectPromotionFn = detectPromotion;

// CONTRACT 7: deriveGlossary --------------------------------------------------------------------
type DeriveGlossaryFn = (progress: ProgressSnapshot, bundle: CurriculumBundle) => GlossaryView;
const _deriveGlossaryConforms: DeriveGlossaryFn = deriveGlossary;

// CONTRACT 2: Store, SecretsVault -----------------------------------------------------------------
const _storeConforms: (db?: string) => Promise<Store> = IndexedDbStore.open;
const _secretsVaultConforms: SecretsVault = createSecretsVault(
  // A throwaway backend purely for the type-level check; never invoked.
  { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
);

// CONTRACT 3: GitHubAuth, GitHubSync --------------------------------------------------------------
declare const _fakeStore: Store;
declare const _fakeVault: SecretsVault;
declare const _fakeFetch: typeof fetch;
const _gitHubAuthConforms: GitHubAuth = createGitHubAuth({ store: _fakeStore, vault: _fakeVault, fetch: _fakeFetch, now: () => 0 });
const _gitHubSyncConforms: GitHubSync = createGitHubSync({ store: _fakeStore, vault: _fakeVault, fetch: _fakeFetch, now: () => 0 });

// CONTRACT 6: ReviewScheduler ---------------------------------------------------------------------
const _reviewSchedulerConforms: ReviewScheduler = createReviewScheduler({
  store: _fakeStore,
  getReviewForm: () => undefined,
});

// Silence "unused variable" noise; these exist purely for the assignability check the TypeScript
// compiler performs at the `const x: T = value` line above.
void _deriveStatSheetConforms;
void _detectPromotionConforms;
void _deriveGlossaryConforms;
void _storeConforms;
void _secretsVaultConforms;
void _gitHubAuthConforms;
void _gitHubSyncConforms;
void _reviewSchedulerConforms;
