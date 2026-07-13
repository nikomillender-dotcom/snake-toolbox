import { describe, expect, it } from "vitest";
import { createSecretsVault, defaultSecretStorageBackend, type SecretStorageBackend } from "./secretsVault.js";
import { scanForForbiddenImports } from "./workerBoundaryGuard.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

function memoryBackend(): SecretStorageBackend & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

describe("SecretsVault (F1 BLOCKER, F6)", () => {
  it("has no secret until setSecret is called", async () => {
    const vault = createSecretsVault(memoryBackend());
    expect(await vault.hasSecret("githubToken")).toBe(false);
  });

  it("round-trips a secret through setSecret / hasSecret / useSecret / clearSecret", async () => {
    const vault = createSecretsVault(memoryBackend());
    await vault.setSecret("githubToken", "github_pat_fake_test_token_do_not_use");
    expect(await vault.hasSecret("githubToken")).toBe(true);

    const seenInsideClosure = await vault.useSecret("githubToken", async (value) => {
      expect(value).toBe("github_pat_fake_test_token_do_not_use");
      return "ok";
    });
    expect(seenInsideClosure).toBe("ok");

    await vault.clearSecret("githubToken");
    expect(await vault.hasSecret("githubToken")).toBe(false);
  });

  it("useSecret throws rather than silently handing back an empty/undefined token", async () => {
    const vault = createSecretsVault(memoryBackend());
    await expect(vault.useSecret("githubToken", async (v) => v)).rejects.toThrow(/No secret set/);
  });

  it("never persists the raw value anywhere but the backend's own storage (F6)", async () => {
    const backend = memoryBackend();
    const vault = createSecretsVault(backend);
    await vault.setSecret("githubToken", "github_pat_fake_test_token_do_not_use");
    // The ONLY place the raw string may live is the injected backend's own store.
    expect(Array.from(backend.store.values())).toEqual(["github_pat_fake_test_token_do_not_use"]);
  });

  // This test verifies the Worker-context fact that localStorage is absent. In jsdom (our
  // integrated test environment) localStorage exists, so this test is structurally incorrect
  // there. The real boundary is proven by the worker-boundary-guard (no import of secrets/ from
  // worker/) and by the defaultSecretStorageBackend's throw when localStorage is absent. Skipped
  // under jsdom; runs correctly in the backend wing's Node-only suite.
  it.skipIf(typeof (globalThis as { localStorage?: unknown }).localStorage !== "undefined")(
    "refuses to construct against an environment with no localStorage (the Worker-context fact)", () => {
    expect(typeof (globalThis as { localStorage?: unknown }).localStorage).toBe("undefined");
    expect(() => defaultSecretStorageBackend()).toThrow(/localStorage/);
  });
});

describe("Worker boundary guard (F1 BLOCKER, I3, I9 item 10)", () => {
  it("no file under src/worker/** imports anything from src/secrets/**", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const workerDir = join(here, "..", "worker");
    const violations = scanForForbiddenImports(workerDir, "secrets/");
    expect(violations).toEqual([]);
  });

  it("the guard itself actually detects a violation when one is planted (proves it is not vacuous)", () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "worker-guard-fixture-"));
    try {
      writeFileSync(
        join(scratchDir, "workerEntry.ts"),
        `import { createSecretsVault } from "../secrets/secretsVault.js";\nexport const x = createSecretsVault;\n`,
        "utf8",
      );
      const violations = scanForForbiddenImports(scratchDir, "secrets/");
      expect(violations).toEqual([{ file: "workerEntry.ts", importSpecifier: "../secrets/secretsVault.js" }]);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });
});
