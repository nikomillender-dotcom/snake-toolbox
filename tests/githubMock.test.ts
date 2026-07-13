import { describe, expect, it } from "vitest";
import { createMockGitHubAuth, createMockGitHubSync, FIXTURE_RESTORE_SNAPSHOT, scanArtifactForSecrets } from "../src/mocks/githubMock";
import type { Artifact } from "../src/contracts";

const cleanArtifact: Artifact = {
  folderPath: "m03-receipt-printer",
  files: [{ path: "receipt.py", text: "print('hello')", encoding: "utf8" }],
  readme: "# Receipt printer",
  commitMessage: "ship module 3"
};

describe("mock GitHubSync.ship (L11: live / queued / conflict / needsReconnect / expiredToken)", () => {
  it("resolves live with a URL", async () => {
    const sync = createMockGitHubSync({ shipScenario: "live" });
    const result = await sync.ship(cleanArtifact);
    expect(result.status).toBe("live");
    expect(result.url).toMatch(/^https:\/\//);
  });

  it("resolves queued (offline)", async () => {
    const sync = createMockGitHubSync({ shipScenario: "queued" });
    const result = await sync.ship(cleanArtifact);
    expect(result.status).toBe("queued");
  });

  it("resolves conflict and carries the ConflictChoice[] to resolve against", async () => {
    const sync = createMockGitHubSync({ shipScenario: "conflict" });
    const result = await sync.ship(cleanArtifact);
    expect(result.status).toBe("conflict");
    expect(result.conflict).toEqual(["keepMine", "keepRemote", "shipAsCopy"]);
  });

  it("resolves needsReconnect", async () => {
    const sync = createMockGitHubSync({ shipScenario: "needsReconnect" });
    const result = await sync.ship(cleanArtifact);
    expect(result.status).toBe("needsReconnect");
  });

  it("resolves expiredToken as a SPECIFIC status distinct from needsReconnect (O)", async () => {
    const sync = createMockGitHubSync({ shipScenario: "expiredToken" });
    const result = await sync.ship(cleanArtifact);
    expect(result.status).toBe("expiredToken");
  });

  it("F2: scanArtifact blocks a planted secret before any ship, artifact stays queued not shipped", async () => {
    const dirty: Artifact = { ...cleanArtifact, files: [{ path: "leak.py", text: "TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz012345'", encoding: "utf8" }] };
    const scan = scanArtifactForSecrets(dirty);
    expect(scan.clean).toBe(false);
    expect(scan.hits[0]?.kind).toBe("ghp_");
    const sync = createMockGitHubSync({ shipScenario: "live" });
    const result = await sync.ship(dirty);
    expect(result.status).not.toBe("live"); // never ships a dirty artifact even in "live" scenario mode
  });

  it("resolveConflict: shipAsCopy REQUIRES a newFolderPath and throws without one", async () => {
    const sync = createMockGitHubSync({ shipScenario: "conflict" });
    await expect(sync.resolveConflict(cleanArtifact, "shipAsCopy")).rejects.toThrow(/newFolderPath/);
    const result = await sync.resolveConflict(cleanArtifact, "shipAsCopy", "m03-receipt-printer-copy");
    expect(result.status).toBe("live");
    expect(result.url).toContain("m03-receipt-printer-copy");
  });

  it("resolveConflict: keepMine and keepRemote both resolve to a live URL (the honesty split holds through the conflict branch)", async () => {
    const sync = createMockGitHubSync({ shipScenario: "conflict" });
    const mine = await sync.resolveConflict(cleanArtifact, "keepMine");
    const remote = await sync.resolveConflict(cleanArtifact, "keepRemote");
    expect(mine.status).toBe("live");
    expect(remote.status).toBe("live");
  });

  it("restoreProgress returns the configured snapshot, or null when none exists", async () => {
    const withSnapshot = createMockGitHubSync({ restoreSnapshot: FIXTURE_RESTORE_SNAPSHOT });
    const withoutSnapshot = createMockGitHubSync({});
    expect(await withSnapshot.restoreProgress()).toEqual(FIXTURE_RESTORE_SNAPSHOT);
    expect(await withoutSnapshot.restoreProgress()).toBeNull();
  });
});

describe("mock GitHubAuth.tokenExpiry (L14, D3 sanity guard)", () => {
  it("captured:false shows nothing, never a fake countdown, for the notCaptured scenario", async () => {
    const auth = createMockGitHubAuth({ tokenExpiryScenario: "notCaptured" });
    const expiry = await auth.tokenExpiry();
    expect(expiry?.captured).toBe(false);
    expect(expiry?.daysLeft).toBeNull();
    expect(expiry?.expiresAt).toBeNull();
  });

  it("sixDays scenario surfaces a real future daysLeft", async () => {
    const auth = createMockGitHubAuth({ tokenExpiryScenario: "sixDays" });
    const expiry = await auth.tokenExpiry();
    expect(expiry?.captured).toBe(true);
    expect(expiry?.daysLeft).toBe(6);
  });

  it("thirtySixHours scenario is the sticky-escalation window (<= 48h)", async () => {
    const auth = createMockGitHubAuth({ tokenExpiryScenario: "thirtySixHours" });
    const expiry = await auth.tokenExpiry();
    expect(expiry?.captured).toBe(true);
    expect(expiry!.expiresAt!).toBeGreaterThan(Date.now());
    expect(expiry!.expiresAt! - Date.now()).toBeLessThanOrEqual(48 * 60 * 60 * 1000);
  });

  it("connectWithToken on an expired token returns error:'expired', not a generic invalidToken", async () => {
    const auth = createMockGitHubAuth({ tokenExpiryScenario: "expired" });
    const result = await auth.connectWithToken("a-token-thats-long-enough", { name: "x", visibility: "public" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("expired");
  });

  it("a too-short token is rejected as invalidToken regardless of expiry scenario", async () => {
    const auth = createMockGitHubAuth({});
    const result = await auth.connectWithToken("short", { name: "x", visibility: "public" });
    expect(result.error).toBe("invalidToken");
  });
});
