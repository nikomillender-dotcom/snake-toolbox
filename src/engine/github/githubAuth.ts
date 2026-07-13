// GitHubAuth (CONTRACT 3, backend B7/B15). v1 = fine-grained PAT, single repo scope. The token
// itself lives ONLY in the SecretsVault (F1/F6); this module never returns or logs it, only ever
// passes it through vault.useSecret's closure.
import type { ConnectResult, GitHubAuth, RepoSpec, SecretsVault, Store, TokenExpiry } from "../../contracts.js";
import { GITHUB_API_BASE, type FetchFn } from "./fetchTypes.js";
import { captureTokenExpiryHeaders, emptyMeta, readMeta, trackerFromMeta, writeMeta } from "./githubConnectionMeta.js";
import { GitHubApiError } from "./gitHubApiError.js";

export interface GitHubAuthDeps {
  store: Store;
  vault: SecretsVault;
  fetch: FetchFn;
  now(): number;
}

async function validateTokenAndGetLogin(
  fetchFn: FetchFn,
  token: string,
  onHeaders: (h: Headers) => void,
): Promise<{ login: string } | { error: "invalidToken" | "network" }> {
  try {
    const res = await fetchFn(`${GITHUB_API_BASE}/user`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    onHeaders(res.headers);
    if (res.status === 401) return { error: "invalidToken" };
    if (!res.ok) return { error: "network" };
    const data = (await res.json()) as { login: string };
    return { login: data.login };
  } catch {
    return { error: "network" };
  }
}

async function ensureRepoExists(
  fetchFn: FetchFn,
  token: string,
  owner: string,
  repo: RepoSpec,
  onHeaders: (h: Headers) => void,
): Promise<{ ok: true } | { ok: false; error: "network" | "scope" }> {
  try {
    const getRes = await fetchFn(`${GITHUB_API_BASE}/repos/${owner}/${repo.name}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    onHeaders(getRes.headers);
    if (getRes.ok) return { ok: true };
    if (getRes.status !== 404) return { ok: false, error: "scope" };

    const createRes = await fetchFn(`${GITHUB_API_BASE}/user/repos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: repo.name, private: repo.visibility === "private", auto_init: true }),
    });
    onHeaders(createRes.headers);
    if (!createRes.ok) return { ok: false, error: "scope" };
    return { ok: true };
  } catch {
    return { ok: false, error: "network" };
  }
}

export function createGitHubAuth(deps: GitHubAuthDeps): GitHubAuth {
  const captureHeaders = (headers: Headers): Promise<void> => captureTokenExpiryHeaders(deps.store, headers, deps.now());

  return {
    async status() {
      const hasToken = await deps.vault.hasSecret("githubToken");
      if (!hasToken) return "disconnected";
      const meta = await readMeta(deps.store);
      if (!meta.connected) return "disconnected";
      const tracker = trackerFromMeta(meta);
      const snapshot = tracker.current(deps.now());
      if (snapshot.captured && snapshot.expiresAt !== null && snapshot.expiresAt <= deps.now()) {
        return "needsReconnect";
      }
      return "connected";
    },

    async isConnected() {
      return (await this.status()) === "connected";
    },

    async connectWithToken(token: string, repo: RepoSpec): Promise<ConnectResult> {
      const validation = await validateTokenAndGetLogin(deps.fetch, token, (h) => void captureHeaders(h));
      if ("error" in validation) {
        return { ok: false, error: validation.error === "invalidToken" ? "invalidToken" : "network" };
      }

      const repoCheck = await ensureRepoExists(deps.fetch, token, validation.login, repo, (h) => void captureHeaders(h));
      if (!repoCheck.ok) {
        return { ok: false, error: repoCheck.error };
      }

      await deps.vault.setSecret("githubToken", token);
      const meta = await readMeta(deps.store);
      meta.connected = true;
      meta.owner = validation.login;
      meta.portfolioRepo = repo.name;
      await writeMeta(deps.store, meta);

      return { ok: true, repoUrl: `https://github.com/${validation.login}/${repo.name}` };
    },

    async disconnect() {
      await deps.vault.clearSecret("githubToken");
      const meta = await readMeta(deps.store);
      await writeMeta(deps.store, { ...emptyMeta(), tokenExpiry: meta.tokenExpiry }); // keep expiry history for honesty; drop connection
    },

    async tokenExpiry(): Promise<TokenExpiry | null> {
      const hasToken = await deps.vault.hasSecret("githubToken");
      if (!hasToken) return null;
      const meta = await readMeta(deps.store);
      const tracker = trackerFromMeta(meta);
      return tracker.current(deps.now());
    },
  };
}

export { GitHubApiError };
