// FetchFn: the injectable fetch dependency every GitHub API call goes through. Production code
// passes the real global `fetch` (main thread only, F1/I3: this module and everything that uses it
// must never be imported by worker code, see secrets/workerBoundaryGuard.ts for the analogous
// static proof on the secrets vault; GitHubSync additionally never touches raw tokens outside a
// SecretsVault.useSecret closure, see githubSyncClient.ts). Tests inject a FakeGitHubApi's fetch
// implementation instead, so the entire ship/backup/restore pipeline is proven against a MOCKED
// api.github.com, zero live network (B11).
export type FetchFn = typeof fetch;

export const GITHUB_API_BASE = "https://api.github.com";

export const TOKEN_EXPIRATION_HEADER = "github-authentication-token-expiration";
