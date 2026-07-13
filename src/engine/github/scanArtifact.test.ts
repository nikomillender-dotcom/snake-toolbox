import { describe, expect, it } from "vitest";
import type { Artifact } from "../../contracts.js";
import { scanArtifact, scanSerializedPayload } from "./scanArtifact.js";

function artifact(files: Artifact["files"], readme = "A clean readme.", commitMessage = "Ship module 1"): Artifact {
  return { folderPath: "m1-variables", files, readme, commitMessage };
}

describe("scanArtifact (F2 BLOCKER)", () => {
  it("is clean for ordinary source code", () => {
    const result = scanArtifact(
      artifact([{ path: "main.py", text: "def greet(name):\n    return f'hi {name}'\n", encoding: "utf8" }]),
    );
    expect(result.clean).toBe(true);
    expect(result.hits).toEqual([]);
  });

  it("blocks a planted ghp_ classic PAT", () => {
    const result = scanArtifact(
      artifact([
        {
          path: "leak.py",
          text: "TOKEN = 'ghp_1234567890abcdefghijklmnopqrstuvwxyzAB'",
          encoding: "utf8",
        },
      ]),
    );
    expect(result.clean).toBe(false);
    expect(result.hits).toContainEqual({ path: "leak.py", kind: "ghp_" });
  });

  it("blocks a planted github_pat_ fine-grained PAT", () => {
    const result = scanArtifact(
      artifact([
        {
          path: "leak.py",
          text: "TOKEN = 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmno'",
          encoding: "utf8",
        },
      ]),
    );
    expect(result.clean).toBe(false);
    expect(result.hits).toContainEqual({ path: "leak.py", kind: "github_pat_" });
  });

  it("blocks a planted sk- style LLM key", () => {
    const result = scanArtifact(
      artifact([{ path: "leak.py", text: "OPENAI_KEY = 'sk-abcdefghijklmnopqrstuvwxyz0123456789'", encoding: "utf8" }]),
    );
    expect(result.clean).toBe(false);
    expect(result.hits).toContainEqual({ path: "leak.py", kind: "sk-" });
  });

  it("flags a generic high-entropy string even without a known prefix", () => {
    const result = scanArtifact(
      artifact([{ path: "leak.py", text: "SECRET = 'aZ9k2mQ8pXw3vB7nR4tY6uL1sD0fG5hJ2kM'", encoding: "utf8" }]),
    );
    expect(result.hits.some((h) => h.kind === "entropy")).toBe(true);
  });

  it("does NOT flag ordinary prose, even long paragraphs", () => {
    const result = scanArtifact(
      artifact([
        {
          path: "README-body.md",
          text: "This module teaches variables and assignment through a series of small guided exercises with plenty of practice.",
          encoding: "utf8",
        },
      ]),
    );
    expect(result.clean).toBe(true);
  });

  it("scans the README and commit message too, not just files", () => {
    const withReadmeLeak = artifact([], "Here is a stray key: ghp_1234567890abcdefghijklmnopqrstuvwxyzAB");
    expect(scanArtifact(withReadmeLeak).clean).toBe(false);

    const withCommitLeak = artifact([], "clean", "oops committed ghp_1234567890abcdefghijklmnopqrstuvwxyzAB");
    expect(scanArtifact(withCommitLeak).clean).toBe(false);
  });

  it("also scans bytes-encoded file content, not only text", () => {
    const bytes = new TextEncoder().encode("ghp_1234567890abcdefghijklmnopqrstuvwxyzAB");
    const result = scanArtifact(artifact([{ path: "leak.bin", bytes, encoding: "binary" }]));
    expect(result.clean).toBe(false);
  });

  // B1 fix (Frederick full-gate blocker): entropy scoped to TEXT content only, both layers.
  it("does NOT flag an entropy hit on bytes-sourced content, even the SAME run of characters that trips entropy as text", () => {
    // This exact string is the one used above in "flags a generic high-entropy string..."; as
    // `.text` it trips entropy (proven below), but a real binary FileBlob is stored as `.bytes`,
    // and raw binary bytes routinely produce a run like this by pure chance, so entropy must not
    // fire on the bytes-sourced path (only the literal-prefix checks stay active there).
    const highEntropyLooking = "aZ9k2mQ8pXw3vB7nR4tY6uL1sD0fG5hJ2kM";
    const bytes = new TextEncoder().encode(highEntropyLooking);

    const asBytes = scanArtifact(artifact([{ path: "resource.bin", bytes, encoding: "binary" }]));
    expect(asBytes.hits.some((h) => h.kind === "entropy")).toBe(false);
    expect(asBytes.clean).toBe(true);

    const asText = scanArtifact(artifact([{ path: "resource.py", text: highEntropyLooking, encoding: "utf8" }]));
    expect(asText.hits.some((h) => h.kind === "entropy")).toBe(true);
  });
});

describe("scanSerializedPayload (D5 runtime gate for backupProgress)", () => {
  it("catches a token planted inside an open settings bag", () => {
    const payload = JSON.stringify({
      schemaVersion: 2,
      savedAt: 1,
      completedNodes: [],
      reviews: [],
      settings: { accidentallyPlantedToken: "ghp_1234567890abcdefghijklmnopqrstuvwxyzAB" },
      profile: { name: "Niko", epithet: "the Curious", lastViewedAt: 0 },
    });
    const result = scanSerializedPayload(payload);
    expect(result.clean).toBe(false);
  });

  it("is clean for an ordinary progress snapshot", () => {
    const payload = JSON.stringify({
      schemaVersion: 2,
      savedAt: 1,
      completedNodes: [{ nodeId: "m1", kind: "module", moduleId: "m1", timestamp: 1 }],
      reviews: [],
      settings: { theme: "dark" },
      profile: { name: "Niko", epithet: "the Curious", lastViewedAt: 0 },
    });
    expect(scanSerializedPayload(payload).clean).toBe(true);
  });
});
