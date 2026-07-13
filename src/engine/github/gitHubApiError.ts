// Shared error type for every GitHub REST call. Carries enough for callers to distinguish "queue
// this and retry later" (network/5xx/rate-limit) from "ask the user to reconnect" (401/403 auth)
// from "this specific 422/409 has its own retry protocol" (handled by the caller, not thrown as a
// generic error).
export class GitHubApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export function parseRetryAfter(res: Response): number | null {
  const header = res.headers.get("Retry-After");
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds;
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, Math.round((dateMs - Date.now()) / 1000));
  return null;
}

export async function safeMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string };
    return data.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
