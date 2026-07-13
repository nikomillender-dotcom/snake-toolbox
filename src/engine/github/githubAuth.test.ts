import { describe, expect, it } from "vitest";
import { createSecretsVault } from "../secrets/secretsVault.js";
import { makeInMemoryStore } from "../fixtures/inMemoryStore.fixture.js";
import { FakeGitHubApi } from "../fixtures/fakeGitHubApi.js";
import { createGitHubAuth } from "./githubAuth.js";

function memoryBackend() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

function setup() {
  const api = new FakeGitHubApi();
  api.createRepo("niko", "snake-toolbox-portfolio", "public");
  const store = makeInMemoryStore();
  const vault = createSecretsVault(memoryBackend());
  let now = new Date("2026-01-01T00:00:00.000Z").getTime();
  const auth = createGitHubAuth({ store, vault, fetch: api.fetch, now: () => now });
  return { api, store, vault, auth, setNow: (n: number) => (now = n) };
}

describe("GitHubAuth (CONTRACT 3)", () => {
  it("starts disconnected", async () => {
    const { auth } = setup();
    expect(await auth.status()).toBe("disconnected");
    expect(await auth.isConnected()).toBe(false);
    expect(await auth.tokenExpiry()).toBeNull();
  });

  it("connectWithToken succeeds against a valid token and an existing repo", async () => {
    const { api, auth } = setup();
    const result = await auth.connectWithToken(api.validToken, { name: "snake-toolbox-portfolio", visibility: "public" });
    expect(result).toEqual({ ok: true, repoUrl: "https://github.com/niko/snake-toolbox-portfolio" });
    expect(await auth.status()).toBe("connected");
    expect(await auth.isConnected()).toBe(true);
  });

  it("connectWithToken creates the repo if it does not exist yet", async () => {
    const { api, auth } = setup();
    const result = await auth.connectWithToken(api.validToken, { name: "brand-new-repo", visibility: "private" });
    expect(result.ok).toBe(true);
    expect(api.repos.has("niko/brand-new-repo")).toBe(true);
  });

  it("rejects an invalid token", async () => {
    const { auth } = setup();
    const result = await auth.connectWithToken("totally-wrong-token", { name: "snake-toolbox-portfolio", visibility: "public" });
    expect(result).toEqual({ ok: false, error: "invalidToken" });
  });

  it("disconnect() clears the token and status returns to disconnected", async () => {
    const { api, auth } = setup();
    await auth.connectWithToken(api.validToken, { name: "snake-toolbox-portfolio", visibility: "public" });
    await auth.disconnect();
    expect(await auth.status()).toBe("disconnected");
  });

  it("captures the token-expiry header and surfaces it via tokenExpiry()", async () => {
    const { api, auth, setNow } = setup();
    const future = new Date("2026-06-01T00:00:00.000Z");
    api.tokenExpirationHeader = future.toISOString();
    await auth.connectWithToken(api.validToken, { name: "snake-toolbox-portfolio", visibility: "public" });
    const expiry = await auth.tokenExpiry();
    expect(expiry?.captured).toBe(true);
    expect(expiry?.expiresAt).toBe(future.getTime());
    void setNow;
  });

  it("captured:false when the header is absent (classic PAT / no signal, D10)", async () => {
    const { api, auth } = setup();
    api.tokenExpirationHeader = null;
    await auth.connectWithToken(api.validToken, { name: "snake-toolbox-portfolio", visibility: "public" });
    const expiry = await auth.tokenExpiry();
    expect(expiry?.captured).toBe(false);
  });

  it("status() is needsReconnect once a captured expiry is in the past", async () => {
    const { api, auth, setNow } = setup();
    const past = new Date("2025-01-01T00:00:00.000Z");
    api.tokenExpirationHeader = past.toISOString();
    await auth.connectWithToken(api.validToken, { name: "snake-toolbox-portfolio", visibility: "public" });
    setNow(new Date("2026-01-01T00:00:00.000Z").getTime());
    expect(await auth.status()).toBe("needsReconnect");
  });
});
