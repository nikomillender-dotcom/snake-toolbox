// Persisted GitHub connection state (backend B14/B15). Lives in the `githubMeta` Store collection
// (CONTRACT 2/B6). The contract does not pin githubMeta's internal row shape (only its name and
// purpose: "token expiry + last-backup"), so this module owns that shape: which repos are
// connected, the default branch, the token-expiry tracker's serialized state, the last backup
// result, and whether the one-time attribution check (F13) has already run.
import type { Store } from "../../contracts.js";
import { TokenExpiryTracker } from "./tokenExpiryCapture.js";

export const GITHUB_META_COLLECTION = "githubMeta";
export const META_KEY = "connection";

export interface GitHubMetaRow {
  connected: boolean;
  owner: string | null;
  portfolioRepo: string | null;
  portfolioBranch: string;
  backupRepo: string | null;
  tokenExpiry: { lastGoodExpiresAt: number | null; lastCapturedAt: number | null; distrusted: boolean };
  lastBackupAt: number | null;
  lastBackupOk: boolean | null;
  firstShipAttributionChecked: boolean;
}

export function emptyMeta(): GitHubMetaRow {
  return {
    connected: false,
    owner: null,
    portfolioRepo: null,
    portfolioBranch: "main",
    backupRepo: null,
    tokenExpiry: { lastGoodExpiresAt: null, lastCapturedAt: null, distrusted: false },
    lastBackupAt: null,
    lastBackupOk: null,
    firstShipAttributionChecked: false,
  };
}

export async function readMeta(store: Store): Promise<GitHubMetaRow> {
  const row = await store.get<GitHubMetaRow>(GITHUB_META_COLLECTION, META_KEY);
  return row ?? emptyMeta();
}

export async function writeMeta(store: Store, meta: GitHubMetaRow): Promise<void> {
  await store.put(GITHUB_META_COLLECTION, META_KEY, meta);
}

export function trackerFromMeta(meta: GitHubMetaRow): TokenExpiryTracker {
  return TokenExpiryTracker.fromJSON(meta.tokenExpiry);
}

/** B15: capture the token-expiry header on ANY api.github.com response, persisted in githubMeta. */
export async function captureTokenExpiryHeaders(store: Store, headers: Headers, now: number): Promise<void> {
  const meta = await readMeta(store);
  const tracker = trackerFromMeta(meta);
  tracker.observe(headers.get("github-authentication-token-expiration"), now);
  meta.tokenExpiry = tracker.toJSON();
  await writeMeta(store, meta);
}
