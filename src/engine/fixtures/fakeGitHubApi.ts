// FakeGitHubApi: an in-memory simulation of the subset of the GitHub REST API the engine needs
// (Git Data API for ship's commit pipeline, Contents API for the tiny single-file writes, plus
// /user, /user/emails, and /repos/:owner/:repo for the attribution check). Implements a FetchFn so
// GitHubSyncClient/GitHubAuth can be driven end to end against a MOCKED api.github.com, zero live
// network (B11). Deliberately not a full git implementation: trees are flat path->entry maps
// (matching how the real Git Data API layers a partial `tree` array onto `base_tree`), which is
// exactly the semantics ship() depends on.
import { base64ToUtf8, utf8ToBase64 } from "../github/base64.js";

export interface FakeBlob {
  sha: string;
  base64Content: string;
}

export interface FakeTreeEntry {
  path: string;
  mode: string;
  type: "blob";
  sha: string;
}

export interface FakeTree {
  sha: string;
  entries: Map<string, FakeTreeEntry>; // path -> entry, the FLATTENED effective tree
}

export interface FakeCommit {
  sha: string;
  treeSha: string;
  parents: string[];
  message: string;
  author: { name: string; email: string; date: string };
}

export interface FakeContentsFile {
  sha: string;
  base64Content: string;
}

export interface FakeRepo {
  owner: string;
  name: string;
  visibility: "public" | "private";
  isFork: boolean;
  defaultBranch: string;
  branches: Map<string, string>; // branch name -> head commit sha
  commits: Map<string, FakeCommit>;
  trees: Map<string, FakeTree>;
  blobs: Map<string, FakeBlob>;
  contents: Map<string, FakeContentsFile>; // path -> file (Contents API view, independent of Data API trees for simplicity)
}

export interface FakeUser {
  login: string;
  primaryEmail: string;
  primaryEmailVerified: boolean;
}

let shaCounter = 0;
function nextSha(prefix: string): string {
  shaCounter += 1;
  return `${prefix}${String(shaCounter).padStart(8, "0")}`;
}

export class FakeGitHubApi {
  repos = new Map<string, FakeRepo>(); // key: "owner/name"
  user: FakeUser = { login: "niko", primaryEmail: "niko@example.com", primaryEmailVerified: true };
  validToken = "github_pat_fixture_valid_token_do_not_use_in_prod";
  tokenExpirationHeader: string | null = null; // set per-test to simulate the header
  requestLog: Array<{ method: string; url: string }> = [];

  /** Injectable failure hooks for tests (rate limiting, network errors, moved-head races).
   * `respond` returning `null` falls through to the normal handler (or the next forced hook),
   * which lets a test intercept only the FIRST N calls to a route and let later calls behave
   * normally. */
  forcedResponses: Array<{ match: (method: string, url: string) => boolean; respond: () => Response | null }> = [];

  createRepo(owner: string, name: string, visibility: "public" | "private" = "public", isFork = false): FakeRepo {
    const repo: FakeRepo = {
      owner,
      name,
      visibility,
      isFork,
      defaultBranch: "main",
      branches: new Map(),
      commits: new Map(),
      trees: new Map(),
      blobs: new Map(),
      contents: new Map(),
    };
    // auto_init: true equivalent: seed an initial empty commit on main.
    const rootTreeSha = nextSha("tree");
    repo.trees.set(rootTreeSha, { sha: rootTreeSha, entries: new Map() });
    const initialCommitSha = nextSha("commit");
    repo.commits.set(initialCommitSha, {
      sha: initialCommitSha,
      treeSha: rootTreeSha,
      parents: [],
      message: "Initial commit",
      author: { name: this.user.login, email: this.user.primaryEmail, date: new Date(0).toISOString() },
    });
    repo.branches.set("main", initialCommitSha);
    this.repos.set(`${owner}/${name}`, repo);
    return repo;
  }

  private getRepo(owner: string, name: string): FakeRepo | undefined {
    return this.repos.get(`${owner}/${name}`);
  }

  fetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    this.requestLog.push({ method, url });

    for (const forced of this.forcedResponses) {
      if (forced.match(method, url)) {
        const response = forced.respond();
        if (response !== null) return response;
      }
    }

    const headers = new Headers(init?.headers);
    const auth = headers.get("Authorization");
    const token = auth?.replace(/^Bearer\s+/i, "").replace(/^token\s+/i, "");

    const path = url.replace("https://api.github.com", "");

    if (token !== this.validToken) {
      return this.json({ message: "Bad credentials" }, 401);
    }

    if (path === "/user" && method === "GET") {
      return this.json({ login: this.user.login, email: this.user.primaryEmail }, 200);
    }

    if (path === "/user/emails" && method === "GET") {
      return this.json(
        [{ email: this.user.primaryEmail, primary: true, verified: this.user.primaryEmailVerified }],
        200,
      );
    }

    let m: RegExpMatchArray | null;

    if ((m = path.match(/^\/repos\/([^/]+)\/([^/]+)$/)) && method === "GET") {
      const repo = this.getRepo(m[1]!, m[2]!);
      if (!repo) return this.json({ message: "Not Found" }, 404);
      return this.json(
        { default_branch: repo.defaultBranch, private: repo.visibility === "private", fork: repo.isFork },
        200,
      );
    }

    if ((m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/ref\/heads\/(.+)$/)) && method === "GET") {
      const repo = this.getRepo(m[1]!, m[2]!);
      const branch = m[3]!;
      if (!repo) return this.json({ message: "Not Found" }, 404);
      const sha = repo.branches.get(branch);
      if (!sha) return this.json({ message: "Not Found" }, 404);
      return this.json({ ref: `refs/heads/${branch}`, object: { sha } }, 200);
    }

    if ((m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/trees\/([^/?]+)/)) && method === "GET") {
      const repo = this.getRepo(m[1]!, m[2]!);
      if (!repo) return this.json({ message: "Not Found" }, 404);
      const tree = repo.trees.get(m[3]!);
      if (!tree) return this.json({ message: "Not Found" }, 404);
      return this.json(
        { sha: tree.sha, tree: Array.from(tree.entries.values()).map((e) => ({ path: e.path, mode: e.mode, type: e.type, sha: e.sha })) },
        200,
      );
    }

    if ((m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/blobs\/([^/]+)$/)) && method === "GET") {
      const repo = this.getRepo(m[1]!, m[2]!);
      if (!repo) return this.json({ message: "Not Found" }, 404);
      const blob = repo.blobs.get(m[3]!);
      if (!blob) return this.json({ message: "Not Found" }, 404);
      return this.json({ sha: blob.sha, content: blob.base64Content, encoding: "base64" }, 200);
    }

    if ((m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/commits\/([^/]+)$/)) && method === "GET") {
      const repo = this.getRepo(m[1]!, m[2]!);
      if (!repo) return this.json({ message: "Not Found" }, 404);
      const commit = repo.commits.get(m[3]!);
      if (!commit) return this.json({ message: "Not Found" }, 404);
      return this.json({ sha: commit.sha, tree: { sha: commit.treeSha }, parents: commit.parents.map((p) => ({ sha: p })) }, 200);
    }

    if ((m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/blobs$/)) && method === "POST") {
      const repo = this.getRepo(m[1]!, m[2]!);
      if (!repo) return this.json({ message: "Not Found" }, 404);
      const body = JSON.parse((init?.body as string) ?? "{}") as { content: string; encoding: string };
      const sha = nextSha("blob");
      repo.blobs.set(sha, { sha, base64Content: body.content });
      return this.json({ sha }, 201);
    }

    if ((m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/trees$/)) && method === "POST") {
      const repo = this.getRepo(m[1]!, m[2]!);
      if (!repo) return this.json({ message: "Not Found" }, 404);
      const body = JSON.parse((init?.body as string) ?? "{}") as {
        base_tree?: string;
        tree: Array<{ path: string; mode: string; type: string; sha: string }>;
      };
      const baseEntries = new Map<string, FakeTreeEntry>();
      if (body.base_tree) {
        const baseTree = repo.trees.get(body.base_tree);
        if (!baseTree) return this.json({ message: "Not Found (bad base_tree)" }, 404);
        for (const [p, e] of baseTree.entries) baseEntries.set(p, e);
      }
      for (const entry of body.tree) {
        baseEntries.set(entry.path, { path: entry.path, mode: entry.mode, type: "blob", sha: entry.sha });
      }
      const sha = nextSha("tree");
      repo.trees.set(sha, { sha, entries: baseEntries });
      return this.json({ sha }, 201);
    }

    if ((m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/commits$/)) && method === "POST") {
      const repo = this.getRepo(m[1]!, m[2]!);
      if (!repo) return this.json({ message: "Not Found" }, 404);
      const body = JSON.parse((init?.body as string) ?? "{}") as {
        message: string;
        tree: string;
        parents: string[];
        author?: { name: string; email: string; date: string };
      };
      const sha = nextSha("commit");
      repo.commits.set(sha, {
        sha,
        treeSha: body.tree,
        parents: body.parents,
        message: body.message,
        author: body.author ?? { name: this.user.login, email: this.user.primaryEmail, date: new Date().toISOString() },
      });
      return this.json({ sha }, 201);
    }

    if ((m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/refs\/heads\/(.+)$/)) && method === "PATCH") {
      const repo = this.getRepo(m[1]!, m[2]!);
      if (!repo) return this.json({ message: "Not Found" }, 404);
      const branch = m[3]!;
      const body = JSON.parse((init?.body as string) ?? "{}") as { sha: string; force?: boolean };
      const currentHead = repo.branches.get(branch);
      const commit = repo.commits.get(body.sha);
      if (!commit) return this.json({ message: "Not Found (bad commit sha)" }, 404);
      // Non-force update requires the new commit's parent to be the CURRENT head (fast-forward).
      const isFastForward = currentHead !== undefined && commit.parents.includes(currentHead);
      if (!body.force && currentHead !== undefined && !isFastForward) {
        return this.json({ message: "Update is not a fast forward" }, 422);
      }
      repo.branches.set(branch, body.sha);
      return this.json({ ref: `refs/heads/${branch}`, object: { sha: body.sha } }, 200);
    }

    if ((m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/)) && method === "GET") {
      const repo = this.getRepo(m[1]!, m[2]!);
      if (!repo) return this.json({ message: "Not Found" }, 404);
      const file = repo.contents.get(decodeURIComponent(m[3]!));
      if (!file) return this.json({ message: "Not Found" }, 404);
      return this.json({ sha: file.sha, content: file.base64Content, encoding: "base64" }, 200);
    }

    if ((m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/)) && method === "PUT") {
      const repo = this.getRepo(m[1]!, m[2]!);
      if (!repo) return this.json({ message: "Not Found" }, 404);
      const filePath = decodeURIComponent(m[3]!);
      const body = JSON.parse((init?.body as string) ?? "{}") as { message: string; content: string; sha?: string };
      const existing = repo.contents.get(filePath);
      if (existing && existing.sha !== body.sha) {
        return this.json({ message: "sha does not match" }, 409);
      }
      if (!existing && body.sha) {
        return this.json({ message: "sha does not match (file does not exist)" }, 409);
      }
      const sha = nextSha("content");
      repo.contents.set(filePath, { sha, base64Content: body.content });
      return this.json({ content: { sha, path: filePath }, commit: { sha: nextSha("commit") } }, 200);
    }

    if ((m = path.match(/^\/user\/repos$/)) && method === "POST") {
      const body = JSON.parse((init?.body as string) ?? "{}") as { name: string; private?: boolean };
      const repo = this.createRepo(this.user.login, body.name, body.private ? "private" : "public");
      return this.json({ name: repo.name, private: repo.visibility === "private", default_branch: repo.defaultBranch }, 201);
    }

    return this.json({ message: `FakeGitHubApi: no route for ${method} ${path}` }, 404);
  };

  private json(data: unknown, status: number): Response {
    const headers = new Headers({ "content-type": "application/json" });
    if (this.tokenExpirationHeader !== null) {
      headers.set("GitHub-Authentication-Token-Expiration", this.tokenExpirationHeader);
    }
    return new Response(JSON.stringify(data), { status, headers });
  }

  /** Test helper: read back the current (decoded) content at a Contents-API path. */
  readContentsAsText(owner: string, name: string, path: string): string | null {
    const repo = this.getRepo(owner, name);
    const file = repo?.contents.get(path);
    return file ? base64ToUtf8(file.base64Content) : null;
  }

  /** Test helper: write a Contents-API file directly (simulating a pre-existing remote file). */
  seedContents(owner: string, name: string, path: string, text: string): void {
    const repo = this.getRepo(owner, name);
    if (!repo) throw new Error(`no fake repo ${owner}/${name}`);
    repo.contents.set(path, { sha: nextSha("content"), base64Content: utf8ToBase64(text) });
  }

  /** Test helper: read back the effective flattened tree at a branch's HEAD. */
  readHeadTree(owner: string, name: string, branch = "main"): Map<string, FakeTreeEntry> {
    const repo = this.getRepo(owner, name);
    if (!repo) throw new Error(`no fake repo ${owner}/${name}`);
    const headSha = repo.branches.get(branch);
    if (!headSha) return new Map();
    const commit = repo.commits.get(headSha);
    if (!commit) return new Map();
    const tree = repo.trees.get(commit.treeSha);
    return tree ? tree.entries : new Map();
  }

  /** Test helper: simulates a concurrent push by another actor moving the branch head directly. */
  simulateConcurrentPush(owner: string, name: string, branch: string, files: Record<string, string>): void {
    const repo = this.getRepo(owner, name);
    if (!repo) throw new Error(`no fake repo ${owner}/${name}`);
    const currentHead = repo.branches.get(branch);
    if (!currentHead) throw new Error("no head to branch from");
    const currentCommit = repo.commits.get(currentHead)!;
    const baseTree = repo.trees.get(currentCommit.treeSha)!;
    const newEntries = new Map(baseTree.entries);
    for (const [filePath, content] of Object.entries(files)) {
      const blobSha = nextSha("blob");
      repo.blobs.set(blobSha, { sha: blobSha, base64Content: utf8ToBase64(content) });
      newEntries.set(filePath, { path: filePath, mode: "100644", type: "blob", sha: blobSha });
    }
    const newTreeSha = nextSha("tree");
    repo.trees.set(newTreeSha, { sha: newTreeSha, entries: newEntries });
    const newCommitSha = nextSha("commit");
    repo.commits.set(newCommitSha, {
      sha: newCommitSha,
      treeSha: newTreeSha,
      parents: [currentHead],
      message: "concurrent push by someone else",
      author: { name: "someone-else", email: "someone-else@example.com", date: new Date().toISOString() },
    });
    repo.branches.set(branch, newCommitSha);
  }
}
