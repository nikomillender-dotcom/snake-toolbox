// GitHubSyncClient (CONTRACT 3, backend B8/B14/B15). The full ship/backup/restore pipeline against
// a MOCKED api.github.com (B11); zero live network in any test. Token handling always goes through
// SecretsVault.useSecret's closure (F1/F6): the raw token is never assigned to a variable this
// module retains past a single call.
import type {
  Artifact,
  AttributionStatus,
  BackupResult,
  ConflictChoice,
  FlushReport,
  PortfolioIndex,
  ProgressBackup,
  ScanResult,
  SecretsVault,
  ShipResult,
  Store,
} from "../../contracts.js";
import { fileBlobToBase64, utf8ToBase64 } from "./base64.js";
import { escapeForMarkdown } from "./htmlEscape.js";
import type { FetchFn } from "./fetchTypes.js";
import {
  createBlob,
  createCommit,
  createTree,
  getBlob,
  getCommitTreeSha,
  getRefHead,
  getRepoInfo,
  getTreeRecursive,
  updateRefNonForce,
  type GitDataApiDeps,
  type TreeEntryInput,
} from "./gitDataApi.js";
import { getFile, putFile, type ContentsApiDeps } from "./contentsApi.js";
import { captureTokenExpiryHeaders, readMeta, trackerFromMeta, writeMeta } from "./githubConnectionMeta.js";
import { GitHubApiError } from "./gitHubApiError.js";
import { createOfflineQueue, type OfflineQueue, type OfflineQueueOptions } from "./offlineQueue.js";
import { migrateProgressBackup } from "./progressBackupMigrate.js";
import { parseProgressBackup } from "./progressBackupValidate.js";
import { scanArtifact, scanSerializedPayload } from "./scanArtifact.js";

export const BACKUP_REPO_NAME = "snake-toolbox-save";
const PROGRESS_FILE_PATH = "progress.json";

export interface GitHubSyncDeps {
  store: Store;
  vault: SecretsVault;
  fetch: FetchFn;
  now(): number;
  queueOptions?: OfflineQueueOptions;
}

class NotConnectedError extends Error {}
class ExpiredTokenError extends Error {}

export function createGitHubSync(deps: GitHubSyncDeps, queue: OfflineQueue = createOfflineQueue(deps.store, deps.queueOptions)) {
  const captureHeaders = (headers: Headers): Promise<void> => captureTokenExpiryHeaders(deps.store, headers, deps.now());

  async function requireConnection(): Promise<{ token: string; owner: string; portfolioRepo: string; branch: string }> {
    const meta = await readMeta(deps.store);
    if (!meta.connected || !meta.owner || !meta.portfolioRepo) throw new NotConnectedError();
    const tracker = trackerFromMeta(meta);
    const snap = tracker.current(deps.now());
    if (snap.captured && snap.expiresAt !== null && snap.expiresAt <= deps.now()) throw new ExpiredTokenError();
    const hasToken = await deps.vault.hasSecret("githubToken");
    if (!hasToken) throw new NotConnectedError();
    return await deps.vault.useSecret("githubToken", async (token) => ({
      token,
      owner: meta.owner!,
      portfolioRepo: meta.portfolioRepo!,
      branch: meta.portfolioBranch,
    }));
  }

  async function ensureBackupRepo(token: string, owner: string): Promise<string> {
    const meta = await readMeta(deps.store);
    if (meta.backupRepo) return meta.backupRepo;

    const dataDeps: GitDataApiDeps = { fetch: deps.fetch, token, owner, repo: BACKUP_REPO_NAME, onResponseHeaders: (h) => void captureHeaders(h) };
    const info = await getRepoInfo(dataDeps);
    if (!info) {
      // Create it: private, auto-init (B14 suggested shape).
      const res = await deps.fetch("https://api.github.com/user/repos", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
        body: JSON.stringify({ name: BACKUP_REPO_NAME, private: true, auto_init: true }),
      });
      await captureHeaders(res.headers);
      if (!res.ok) throw new GitHubApiError(res.status, "could not create the private backup repo");
    }
    meta.backupRepo = BACKUP_REPO_NAME;
    await writeMeta(deps.store, meta);
    return BACKUP_REPO_NAME;
  }

  /** F12/P3: detects whether a concurrent push already touched OUR exact folderPath differently. */
  async function folderConflicted(
    gitDeps: GitDataApiDeps,
    originalTreeSha: string,
    movedTreeSha: string,
    folderPath: string,
    ourEntries: TreeEntryInput[],
  ): Promise<boolean> {
    const [originalEntries, movedEntries] = await Promise.all([
      getTreeRecursive(gitDeps, originalTreeSha),
      getTreeRecursive(gitDeps, movedTreeSha),
    ]);
    const prefix = `${folderPath}/`;
    const originalShaByPath = new Map(originalEntries.filter((e) => e.path.startsWith(prefix)).map((e) => [e.path, e.sha]));
    const movedShaByPath = new Map(movedEntries.filter((e) => e.path.startsWith(prefix)).map((e) => [e.path, e.sha]));
    const ourShaByPath = new Map(ourEntries.map((e) => [e.path, e.sha]));

    for (const [path, movedSha] of movedShaByPath) {
      const wasThereBefore = originalShaByPath.get(path);
      const oursForPath = ourShaByPath.get(path);
      if (wasThereBefore !== movedSha) {
        // Someone else changed (or added) this exact path since our read. If our own intended
        // content for that path differs too, that is a genuine content conflict.
        if (oursForPath !== movedSha) return true;
      }
    }
    return false;
  }

  async function buildArtifactBlobEntries(gitDeps: GitDataApiDeps, artifact: Artifact): Promise<TreeEntryInput[]> {
    const entries: TreeEntryInput[] = [];
    for (const file of artifact.files) {
      const sha = await createBlob(gitDeps, fileBlobToBase64(file));
      entries.push({ path: `${artifact.folderPath}/${file.path}`, mode: "100644", type: "blob", sha });
    }
    const readmeSha = await createBlob(gitDeps, utf8ToBase64(artifact.readme));
    entries.push({ path: `${artifact.folderPath}/README.md`, mode: "100644", type: "blob", sha: readmeSha });
    return entries;
  }

  async function shipPipeline(
    token: string,
    owner: string,
    repo: string,
    branch: string,
    artifact: Artifact,
  ): Promise<ShipResult> {
    const gitDeps: GitDataApiDeps = { fetch: deps.fetch, token, owner, repo, onResponseHeaders: (h) => void captureHeaders(h) };

    let head = await getRefHead(gitDeps, branch);
    if (head === null) throw new Error(`branch "${branch}" does not exist in ${owner}/${repo}`);
    let baseTree = await getCommitTreeSha(gitDeps, head);
    const originalTreeSha = baseTree;

    const entries = await buildArtifactBlobEntries(gitDeps, artifact);

    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const treeSha = await createTree(gitDeps, baseTree, entries);
      const commitSha = await createCommit(gitDeps, artifact.commitMessage, treeSha, [head]);
      const updateResult = await updateRefNonForce(gitDeps, branch, commitSha);
      if (updateResult.ok) {
        return { status: "live", url: `https://github.com/${owner}/${repo}/tree/${branch}/${artifact.folderPath}` };
      }

      // F12: 422, moved head. Re-GET head, check for a genuine content conflict, then rebuild.
      const newHead = await getRefHead(gitDeps, branch);
      if (newHead === null) throw new Error("branch disappeared mid-ship");
      const newBaseTree = await getCommitTreeSha(gitDeps, newHead);

      if (await folderConflicted(gitDeps, originalTreeSha, newBaseTree, artifact.folderPath, entries)) {
        return { status: "conflict", conflict: ["keepMine", "keepRemote", "shipAsCopy"] };
      }

      head = newHead;
      baseTree = newBaseTree;
    }
    return { status: "queued" }; // exhausted retries; caller enqueues for a later flush
  }

  // Throws on retryable failures (GitHubApiError from network/5xx/403/429) or on the terminal
  // auth-state errors (NotConnectedError / ExpiredTokenError), or on a dirty F2 scan. Returns a
  // ShipResult only for outcomes attemptShipOnce itself considers "done deciding": live, conflict,
  // or "queued" once the F12 retry budget is exhausted. Shared by the public ship() (which wraps
  // this with auto-enqueue-on-failure) and the offline queue's flush handler (which must NOT
  // auto-enqueue again, since the item is already in the queue, and DOES want the thrown
  // GitHubApiError to reach its own Retry-After/backoff logic, see offlineQueue.ts).
  async function attemptShipOnce(artifact: Artifact): Promise<ShipResult> {
    const scan = scanArtifact(artifact);
    if (!scan.clean) {
      throw new Error(`scanArtifact found secrets; ship refused: ${JSON.stringify(scan.hits)}`);
    }
    const conn = await requireConnection(); // throws NotConnectedError / ExpiredTokenError
    return shipPipeline(conn.token, conn.owner, conn.portfolioRepo, conn.branch, artifact);
  }

  async function processShipFromQueue(artifact: Artifact): Promise<ShipResult> {
    try {
      return await attemptShipOnce(artifact);
    } catch (err) {
      if (err instanceof ExpiredTokenError) return { status: "expiredToken" };
      if (err instanceof NotConnectedError) return { status: "needsReconnect" };
      if (err instanceof GitHubApiError && err.status === 401) return { status: "needsReconnect" };
      throw err; // a retryable GitHubApiError (403/429/network/5xx): let flush()'s backoff handle it
    }
  }

  async function recordBackupOutcome(ok: boolean): Promise<void> {
    const meta = await readMeta(deps.store);
    meta.lastBackupAt = deps.now();
    meta.lastBackupOk = ok;
    await writeMeta(deps.store, meta);
  }

  // Same throw-on-retryable / return-on-terminal split as attemptShipOnce, and for the same reason:
  // shared by the public backupProgress() (auto-enqueue on failure) and the queue's flush handler
  // (must not double-enqueue, and DOES want a retryable GitHubApiError to reach offlineQueue's own
  // Retry-After/backoff logic).
  async function attemptBackupOnce(snapshot: ProgressBackup): Promise<BackupResult> {
    const serialized = JSON.stringify(snapshot);
    const scan = scanSerializedPayload(serialized);
    if (!scan.clean) {
      // D5: the F2 scan is a RUNTIME GATE on backup, not a fixture nicety. Refuse the write hard.
      throw new Error(`scanArtifact found secrets in the progress snapshot; backup refused: ${JSON.stringify(scan.hits)}`);
    }
    const conn = await requireConnection(); // throws NotConnectedError / ExpiredTokenError

    const backupRepo = await ensureBackupRepo(conn.token, conn.owner);
    const contentsDeps: ContentsApiDeps = {
      fetch: deps.fetch,
      token: conn.token,
      owner: conn.owner,
      repo: backupRepo,
      onResponseHeaders: (h) => void captureHeaders(h),
    };
    const existing = await getFile(contentsDeps, PROGRESS_FILE_PATH);
    let result = await putFile(contentsDeps, PROGRESS_FILE_PATH, utf8ToBase64(serialized), "Backup progress", existing?.sha);
    if (!result.ok) {
      // D12: Contents-API 409 stale-sha race between two devices: re-fetch sha, retry ONCE.
      const refetched = await getFile(contentsDeps, PROGRESS_FILE_PATH);
      result = await putFile(contentsDeps, PROGRESS_FILE_PATH, utf8ToBase64(serialized), "Backup progress", refetched?.sha);
    }
    if (!result.ok) {
      return { status: "queued" };
    }
    const at = deps.now();
    return { status: "saved", at, url: `https://github.com/${conn.owner}/${backupRepo}/blob/main/${PROGRESS_FILE_PATH}` };
  }

  async function processBackupFromQueue(snapshot: ProgressBackup): Promise<BackupResult> {
    try {
      const result = await attemptBackupOnce(snapshot);
      if (result.status === "saved") await recordBackupOutcome(true);
      return result;
    } catch (err) {
      if (err instanceof ExpiredTokenError) return { status: "expiredToken" };
      if (err instanceof NotConnectedError) return { status: "needsReconnect" };
      if (err instanceof GitHubApiError && err.status === 401) return { status: "needsReconnect" };
      throw err; // a retryable GitHubApiError (403/429/network/5xx): let flush()'s backoff handle it
    }
  }

  const sync = {
    scanArtifact(artifact: Artifact): ScanResult {
      return scanArtifact(artifact);
    },

    async ship(artifact: Artifact): Promise<ShipResult> {
      try {
        const result = await attemptShipOnce(artifact);
        if (result.status === "queued") await queue.enqueueShip(artifact);
        return result;
      } catch (err) {
        if (err instanceof ExpiredTokenError) {
          await queue.enqueueShip(artifact); // B15: refuse before any request, but keep the work queued
          return { status: "expiredToken" };
        }
        if (err instanceof NotConnectedError) return { status: "needsReconnect" };
        if (err instanceof GitHubApiError && err.status === 401) return { status: "needsReconnect" };
        if (err instanceof Error && err.message.startsWith("scanArtifact found secrets")) throw err; // F2: never silently queue a dirty scan
        await queue.enqueueShip(artifact); // network error, 5xx, rate limit: durable queue backstop (F14)
        return { status: "queued" };
      }
    },

    async resolveConflict(artifact: Artifact, choice: ConflictChoice, newFolderPath?: string): Promise<ShipResult> {
      const conn = await requireConnection().catch(() => null);
      if (!conn) return { status: "needsReconnect" };

      if (choice === "shipAsCopy") {
        if (!newFolderPath) throw new Error('resolveConflict("shipAsCopy") requires newFolderPath');
        return sync.ship({ ...artifact, folderPath: newFolderPath });
      }

      if (choice === "keepMine") {
        // Re-ship onto the CURRENT remote head (the same F12 rebuild path); never force-push (R10).
        return sync.ship(artifact);
      }

      // keepRemote: abandon this ship; pull the remote version of the folder into the local
      // project (the `files` Store collection) so local and remote agree, then report it live.
      const gitDeps: GitDataApiDeps = {
        fetch: deps.fetch,
        token: conn.token,
        owner: conn.owner,
        repo: conn.portfolioRepo,
        onResponseHeaders: (h) => void captureHeaders(h),
      };
      const head = await getRefHead(gitDeps, conn.branch);
      if (head === null) return { status: "needsReconnect" };
      const treeSha = await getCommitTreeSha(gitDeps, head);
      const entries = await getTreeRecursive(gitDeps, treeSha);
      const prefix = `${artifact.folderPath}/`;
      for (const entry of entries.filter((e) => e.path.startsWith(prefix))) {
        const base64Content = await getBlob(gitDeps, entry.sha);
        // Ruling 3 wiring: reconcile the raw { base64Content } into a proper FileBlob
        // so the files collection holds exactly one shape.
        const { reconcileKeepRemoteFile } = await import("./keepRemoteReconcile.js");
        const blob = reconcileKeepRemoteFile(entry.path, base64Content);
        await deps.store.put("files", entry.path, blob);
      }
      return { status: "live", url: `https://github.com/${conn.owner}/${conn.portfolioRepo}/tree/${conn.branch}/${artifact.folderPath}` };
    },

    async queueLength(): Promise<number> {
      return queue.length();
    },

    async flushQueue(): Promise<FlushReport> {
      // Deliberately NOT sync.ship()/sync.backupProgress(): those auto-enqueue on failure, which
      // would double-queue an item the flush loop already owns. These "FromQueue" variants let a
      // retryable GitHubApiError propagate so offlineQueue's own Retry-After/backoff engages.
      return queue.flush({
        processShip: (artifact) => processShipFromQueue(artifact),
        processBackup: (snapshot) => processBackupFromQueue(snapshot),
      });
    },

    async regenRootReadme(index: PortfolioIndex): Promise<void> {
      const conn = await requireConnection();
      const contentsDeps: ContentsApiDeps = {
        fetch: deps.fetch,
        token: conn.token,
        owner: conn.owner,
        repo: conn.portfolioRepo,
        onResponseHeaders: (h) => void captureHeaders(h),
      };
      const markdown = renderRootReadme(index);
      const existing = await getFile(contentsDeps, "README.md");
      const result = await putFile(contentsDeps, "README.md", utf8ToBase64(markdown), "Update portfolio index", existing?.sha);
      if (!result.ok) {
        // Stale-sha race on the root README: refetch and retry once (same D12-style discipline).
        const refetched = await getFile(contentsDeps, "README.md");
        const retry = await putFile(contentsDeps, "README.md", utf8ToBase64(markdown), "Update portfolio index", refetched?.sha);
        if (!retry.ok) throw new Error("regenRootReadme: could not overwrite README.md after one retry");
      }
    },

    async firstShipAttributionCheck(): Promise<AttributionStatus> {
      const conn = await requireConnection();
      return deps.vault.useSecret("githubToken", async (token) => {
        const userRes = await deps.fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
        });
        await captureHeaders(userRes.headers);
        const user = (await userRes.json()) as { login: string; email: string | null };

        const emailsRes = await deps.fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
        });
        await captureHeaders(emailsRes.headers);
        const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
        const primary = emails.find((e) => e.primary);

        const gitDeps: GitDataApiDeps = { fetch: deps.fetch, token, owner: conn.owner, repo: conn.portfolioRepo, onResponseHeaders: (h) => void captureHeaders(h) };
        const info = await getRepoInfo(gitDeps);

        if (!primary || !primary.verified) {
          return { willCountTowardGraph: false, authorEmail: user.email ?? "", reason: "primary email is not verified" };
        }
        if (info?.fork) {
          return { willCountTowardGraph: false, authorEmail: primary.email, reason: "repo is a fork" };
        }
        if (info && info.defaultBranch !== conn.branch) {
          // F13: a commit lands on the CONTRIBUTION GRAPH only when it is reachable from the
          // repo's default branch. ship() always commits to conn.branch; if that ever diverges
          // from the repo's actual default branch (e.g. the remote default was renamed), the
          // commit still lands but silently does not paint the graph, exactly the failure GitHub
          // does not surface on its own.
          return {
            willCountTowardGraph: false,
            authorEmail: primary.email,
            reason: `ship() commits to "${conn.branch}", but the repo's default branch is "${info.defaultBranch}"`,
          };
        }
        return { willCountTowardGraph: true, authorEmail: primary.email };
      });
    },

    async backupProgress(snapshot: ProgressBackup): Promise<BackupResult> {
      try {
        const result = await attemptBackupOnce(snapshot);
        if (result.status === "saved") {
          await recordBackupOutcome(true);
        } else if (result.status === "queued") {
          await queue.enqueueBackup(snapshot);
          await recordBackupOutcome(false);
        }
        return result;
      } catch (err) {
        if (err instanceof ExpiredTokenError) {
          await queue.enqueueBackup(snapshot);
          return { status: "expiredToken" };
        }
        if (err instanceof NotConnectedError) return { status: "needsReconnect" };
        if (err instanceof GitHubApiError && err.status === 401) return { status: "needsReconnect" };
        if (err instanceof Error && err.message.startsWith("scanArtifact found secrets")) throw err; // D5: never silently queue a dirty scan
        await queue.enqueueBackup(snapshot);
        await recordBackupOutcome(false);
        return { status: "queued" };
      }
    },

    async restoreProgress(): Promise<ProgressBackup | null> {
      const conn = await requireConnection().catch(() => null);
      if (!conn) return null;
      const backupRepo = await ensureBackupRepo(conn.token, conn.owner);
      const contentsDeps: ContentsApiDeps = {
        fetch: deps.fetch,
        token: conn.token,
        owner: conn.owner,
        repo: backupRepo,
        onResponseHeaders: (h) => void captureHeaders(h),
      };
      const file = await getFile(contentsDeps, PROGRESS_FILE_PATH);
      if (!file) return null; // no snapshot exists yet
      let parsed: unknown;
      try {
        parsed = JSON.parse(atobToUtf8(file.base64Content));
      } catch {
        return null; // corrupt JSON: reject cleanly, nothing changes (D12)
      }
      const validated = parseProgressBackup(parsed);
      if (!validated) return null; // corrupt/partial: reject cleanly, nothing changes (D12)
      try {
        return migrateProgressBackup(validated);
      } catch {
        return null;
      }
    },

    async lastBackup(): Promise<{ at: number; ok: boolean } | null> {
      const meta = await readMeta(deps.store);
      if (meta.lastBackupAt === null || meta.lastBackupOk === null) return null;
      return { at: meta.lastBackupAt, ok: meta.lastBackupOk };
    },
  };

  return sync;
}

function renderRootReadme(index: PortfolioIndex): string {
  const lines: string[] = [];
  lines.push(`# ${escapeForMarkdown(index.title)}`, "", escapeForMarkdown(index.intro), "", "## Projects", "");
  for (const entry of index.entries) {
    const heroTag = entry.hero ? " (hero)" : "";
    const moduleTag = entry.module ? ` - ${escapeForMarkdown(entry.module)}` : "";
    lines.push(`- ${escapeForMarkdown(entry.name)}${moduleTag}${heroTag}`);
  }
  return lines.join("\n") + "\n";
}

function atobToUtf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export { renderRootReadme };
