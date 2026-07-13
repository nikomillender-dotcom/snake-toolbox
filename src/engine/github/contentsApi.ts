// contentsApi: the Contents API (backend B8/B14), used for tiny single-file writes:
// regenRootReadme and the progress.json backup, both "one file, overwrite via PUT with the
// current sha." Same request/error discipline as gitDataApi.ts.
import type { FetchFn } from "./fetchTypes.js";
import { GITHUB_API_BASE } from "./fetchTypes.js";
import { GitHubApiError, parseRetryAfter, safeMessage } from "./gitHubApiError.js";

export interface ContentsApiDeps {
  fetch: FetchFn;
  token: string;
  owner: string;
  repo: string;
  onResponseHeaders?: (headers: Headers) => void;
}

async function request(deps: ContentsApiDeps, path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await deps.fetch(`${GITHUB_API_BASE}/repos/${deps.owner}/${deps.repo}/contents/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${deps.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch (err) {
    throw new GitHubApiError(0, `network error: ${(err as Error).message}`);
  }
  deps.onResponseHeaders?.(res.headers);
  if (res.status === 403 || res.status === 429) {
    throw new GitHubApiError(res.status, await safeMessage(res), parseRetryAfter(res));
  }
  return res;
}

export interface ExistingFile {
  sha: string;
  base64Content: string;
}

export async function getFile(deps: ContentsApiDeps, path: string): Promise<ExistingFile | null> {
  const res = await request(deps, path);
  if (res.status === 404) return null;
  if (!res.ok) throw new GitHubApiError(res.status, await safeMessage(res));
  const data = (await res.json()) as { sha: string; content: string };
  return { sha: data.sha, base64Content: data.content };
}

export type PutFileResult = { ok: true } | { ok: false; staleSha: true };

/**
 * Overwrites (or creates) a single file. Pass `expectedSha` when overwriting an existing file (the
 * Contents API rejects a write with a 409 if the sha does not match the current remote content,
 * D12's stale-sha race). Omit it only when the file is known not to exist yet.
 */
export async function putFile(
  deps: ContentsApiDeps,
  path: string,
  base64Content: string,
  message: string,
  expectedSha?: string,
): Promise<PutFileResult> {
  const res = await request(deps, path, {
    method: "PUT",
    body: JSON.stringify({ message, content: base64Content, ...(expectedSha ? { sha: expectedSha } : {}) }),
  });
  if (res.status === 409) return { ok: false, staleSha: true };
  if (!res.ok) throw new GitHubApiError(res.status, await safeMessage(res));
  return { ok: true };
}
