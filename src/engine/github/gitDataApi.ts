// gitDataApi: low-level Git Data API calls (backend B8). Every call goes through a single `request`
// helper so token-expiry header capture (B15) and Retry-After parsing (F14) happen in ONE place.
import type { FetchFn } from "./fetchTypes.js";
import { GITHUB_API_BASE, TOKEN_EXPIRATION_HEADER } from "./fetchTypes.js";
import { GitHubApiError, parseRetryAfter, safeMessage } from "./gitHubApiError.js";

export interface GitDataApiDeps {
  fetch: FetchFn;
  token: string;
  owner: string;
  repo: string;
  onResponseHeaders?: (headers: Headers) => void;
}

export interface TreeEntryInput {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string;
}

async function request(deps: GitDataApiDeps, path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await deps.fetch(`${GITHUB_API_BASE}/repos/${deps.owner}/${deps.repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${deps.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch (err) {
    // A genuine network failure (offline, DNS, etc.): the caller queues the work (F14).
    throw new GitHubApiError(0, `network error: ${(err as Error).message}`);
  }
  deps.onResponseHeaders?.(res.headers);
  if (res.status === 403 || res.status === 429) {
    throw new GitHubApiError(res.status, await safeMessage(res), parseRetryAfter(res));
  }
  return res;
}

export async function getRefHead(deps: GitDataApiDeps, branch: string): Promise<string | null> {
  const res = await request(deps, `/git/ref/heads/${branch}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new GitHubApiError(res.status, await safeMessage(res));
  const data = (await res.json()) as { object: { sha: string } };
  return data.object.sha;
}

export async function getCommitTreeSha(deps: GitDataApiDeps, commitSha: string): Promise<string> {
  const res = await request(deps, `/git/commits/${commitSha}`);
  if (!res.ok) throw new GitHubApiError(res.status, await safeMessage(res));
  const data = (await res.json()) as { tree: { sha: string } };
  return data.tree.sha;
}

export async function createBlob(deps: GitDataApiDeps, base64Content: string): Promise<string> {
  const res = await request(deps, "/git/blobs", {
    method: "POST",
    body: JSON.stringify({ content: base64Content, encoding: "base64" }),
  });
  if (!res.ok) throw new GitHubApiError(res.status, await safeMessage(res));
  return ((await res.json()) as { sha: string }).sha;
}

export async function createTree(
  deps: GitDataApiDeps,
  baseTree: string,
  entries: TreeEntryInput[],
): Promise<string> {
  const res = await request(deps, "/git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTree, tree: entries }),
  });
  if (!res.ok) throw new GitHubApiError(res.status, await safeMessage(res));
  return ((await res.json()) as { sha: string }).sha;
}

export async function createCommit(
  deps: GitDataApiDeps,
  message: string,
  treeSha: string,
  parents: string[],
  author?: { name: string; email: string; date: string },
): Promise<string> {
  const res = await request(deps, "/git/commits", {
    method: "POST",
    body: JSON.stringify({ message, tree: treeSha, parents, ...(author ? { author } : {}) }),
  });
  if (!res.ok) throw new GitHubApiError(res.status, await safeMessage(res));
  return ((await res.json()) as { sha: string }).sha;
}

export type UpdateRefResult = { ok: true } | { ok: false; movedHead: true };

export async function updateRefNonForce(
  deps: GitDataApiDeps,
  branch: string,
  sha: string,
): Promise<UpdateRefResult> {
  const res = await request(deps, `/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha, force: false }), // R10: never force-push
  });
  if (res.status === 422) return { ok: false, movedHead: true };
  if (!res.ok) throw new GitHubApiError(res.status, await safeMessage(res));
  return { ok: true };
}

export interface TreeEntryOutput {
  path: string;
  sha: string;
  type: string;
}

export async function getTreeRecursive(deps: GitDataApiDeps, treeSha: string): Promise<TreeEntryOutput[]> {
  const res = await request(deps, `/git/trees/${treeSha}?recursive=1`);
  if (!res.ok) throw new GitHubApiError(res.status, await safeMessage(res));
  const data = (await res.json()) as { tree: TreeEntryOutput[] };
  return data.tree;
}

export async function getBlob(deps: GitDataApiDeps, blobSha: string): Promise<string> {
  const res = await request(deps, `/git/blobs/${blobSha}`);
  if (!res.ok) throw new GitHubApiError(res.status, await safeMessage(res));
  const data = (await res.json()) as { content: string };
  return data.content; // base64
}

export async function getRepoInfo(
  deps: GitDataApiDeps,
): Promise<{ defaultBranch: string; private: boolean; fork: boolean } | null> {
  const res = await request(deps, "");
  if (res.status === 404) return null;
  if (!res.ok) throw new GitHubApiError(res.status, await safeMessage(res));
  const data = (await res.json()) as { default_branch: string; private: boolean; fork: boolean };
  return { defaultBranch: data.default_branch, private: data.private, fork: data.fork };
}

export { TOKEN_EXPIRATION_HEADER };
