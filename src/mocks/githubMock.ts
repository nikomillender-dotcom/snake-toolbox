// githubMock.ts, L11 + L8 + L14: "Mock GitHubSync.ship to resolve live / queued / conflict /
// needsReconnect, and mock resolveConflict to complete each ConflictChoice" plus the v0.4 surfaces
// (restoreProgress / lastBackup / tokenExpiry across captured=false / 6-days / 36-hours / expired,
// and ship/backupProgress resolving "expiredToken"). All offline, no real api.github.com call ever.

import type {
  Artifact,
  BackupResult,
  ConflictChoice,
  ConnectResult,
  FlushReport,
  GitHubAuth,
  GitHubSync,
  ProgressBackup,
  RepoSpec,
  ScanResult,
  ShipResult,
  TokenExpiry
} from "../contracts";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export type ShipScenario = "live" | "queued" | "conflict" | "needsReconnect" | "expiredToken";
export type TokenExpiryScenario = "notCaptured" | "sixDays" | "thirtySixHours" | "expired";

export interface MockGitHubConfig {
  initialStatus?: "connected" | "needsReconnect" | "disconnected";
  shipScenario?: ShipScenario;
  tokenExpiryScenario?: TokenExpiryScenario;
  restoreSnapshot?: ProgressBackup | null;
  lastBackupAt?: { at: number; ok: boolean } | null;
}

const SECRET_PATTERNS: Array<{ re: RegExp; kind: ScanResult["hits"][number]["kind"] }> = [
  { re: /ghp_[A-Za-z0-9]{20,}/, kind: "ghp_" },
  { re: /github_pat_[A-Za-z0-9_]{20,}/, kind: "github_pat_" },
  { re: /sk-[A-Za-z0-9]{20,}/, kind: "sk-" }
];

export function scanArtifactForSecrets(artifact: Artifact): ScanResult {
  const hits: ScanResult["hits"] = [];
  for (const file of artifact.files) {
    const text = file.text ?? "";
    for (const { re, kind } of SECRET_PATTERNS) {
      if (re.test(text)) hits.push({ path: file.path, kind });
    }
  }
  return { clean: hits.length === 0, hits };
}

export function createMockGitHubAuth(config: MockGitHubConfig = {}): GitHubAuth {
  let status = config.initialStatus ?? "disconnected";
  return {
    async status() {
      return status;
    },
    async isConnected() {
      return status === "connected";
    },
    async connectWithToken(token: string, repo: RepoSpec): Promise<ConnectResult> {
      void repo;
      if (!token || token.trim().length < 10) {
        return { ok: false, error: "invalidToken" };
      }
      if (config.tokenExpiryScenario === "expired") {
        return { ok: false, error: "expired" };
      }
      status = "connected";
      return { ok: true, repoUrl: `https://github.com/niko/${repo.name}` };
    },
    async disconnect() {
      status = "disconnected";
    },
    async tokenExpiry(): Promise<TokenExpiry | null> {
      switch (config.tokenExpiryScenario) {
        case "sixDays":
          return { expiresAt: Date.now() + 6 * DAY, daysLeft: 6, captured: true };
        case "thirtySixHours":
          return { expiresAt: Date.now() + 36 * HOUR, daysLeft: 1, captured: true };
        case "expired":
          return { expiresAt: Date.now() - 2 * DAY, daysLeft: -2, captured: true };
        case "notCaptured":
        default:
          // D3: also covers the capture-time sanity guard; the UI shows nothing here, never a
          // fake countdown or a permanent "0 days" alarm.
          return { expiresAt: null, daysLeft: null, captured: false };
      }
    }
  };
}

export function createMockGitHubSync(config: MockGitHubConfig = {}): GitHubSync {
  let queue: Artifact[] = [];

  return {
    scanArtifact(artifact: Artifact): ScanResult {
      return scanArtifactForSecrets(artifact);
    },
    async ship(artifact: Artifact): Promise<ShipResult> {
      const scan = scanArtifactForSecrets(artifact);
      if (!scan.clean) {
        // F2: scanArtifact must be clean or ship() refuses. Never ship a planted secret.
        queue.push(artifact);
        return { status: "queued" };
      }
      switch (config.shipScenario) {
        case "conflict":
          return { status: "conflict", conflict: ["keepMine", "keepRemote", "shipAsCopy"] as ConflictChoice[] };
        case "needsReconnect":
          return { status: "needsReconnect" };
        case "expiredToken":
          queue.push(artifact);
          return { status: "expiredToken" };
        case "queued":
          queue.push(artifact);
          return { status: "queued" };
        case "live":
        default:
          return { status: "live", url: `https://github.com/niko/portfolio/tree/main/${artifact.folderPath}` };
      }
    },
    async resolveConflict(artifact: Artifact, choice: ConflictChoice, newFolderPath?: string): Promise<ShipResult> {
      if (choice === "shipAsCopy") {
        if (!newFolderPath) {
          throw new Error("resolveConflict: shipAsCopy requires newFolderPath");
        }
        return { status: "live", url: `https://github.com/niko/portfolio/tree/main/${newFolderPath}` };
      }
      // keepMine (re-ship onto moved head) and keepRemote (adopt remote) both resolve to the same
      // "it's up now" honesty-split truth once the round trip completes.
      return { status: "live", url: `https://github.com/niko/portfolio/tree/main/${artifact.folderPath}` };
    },
    async queueLength(): Promise<number> {
      return queue.length;
    },
    async flushQueue(): Promise<FlushReport> {
      const shipped = queue.length;
      queue = [];
      return { shipped, queued: 0, failed: 0 };
    },
    async regenRootReadme(): Promise<void> {
      // tiny single-file write, no-op in the mock
    },
    async firstShipAttributionCheck() {
      return { willCountTowardGraph: true, authorEmail: "niko@example.com" };
    },
    async backupProgress(snapshot: ProgressBackup): Promise<BackupResult> {
      void snapshot;
      switch (config.shipScenario) {
        case "expiredToken":
          return { status: "expiredToken" };
        case "needsReconnect":
          return { status: "needsReconnect" };
        case "queued":
        case "conflict":
          return { status: "queued" };
        default:
          return { status: "saved", url: "https://github.com/niko/snake-toolbox-save", at: Date.now() };
      }
    },
    async restoreProgress(): Promise<ProgressBackup | null> {
      return config.restoreSnapshot ?? null;
    },
    async lastBackup() {
      return config.lastBackupAt ?? null;
    }
  };
}

export const FIXTURE_RESTORE_SNAPSHOT: ProgressBackup = {
  schemaVersion: 2,
  savedAt: Date.now() - 3 * DAY,
  completedNodes: [
    { nodeId: "m01-l1-s2", kind: "fillBlank", moduleId: "m01", strand: "core", timestamp: Date.now() - 20 * DAY }
  ],
  reviews: [],
  settings: { theme: "dark", consoleTheme: "cli" },
  profile: { name: "Niko", epithet: "the coder", lastViewedAt: Date.now() - 3 * DAY }
};
