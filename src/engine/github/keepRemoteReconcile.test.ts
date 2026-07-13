// Tests for keepRemoteReconcile (S5): proves the reconciler handles every case
// Frederick named without data corruption.
import { describe, expect, it } from "vitest";
import { reconcileKeepRemoteFile } from "./keepRemoteReconcile.js";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function textToBase64(text: string): string {
  return toBase64(new TextEncoder().encode(text));
}

describe("keepRemoteReconcile (S5)", () => {
  it("stores valid UTF-8 text as { text, encoding: 'utf8' }", () => {
    const content = "print('hello')\n";
    const blob = reconcileKeepRemoteFile("main.py", textToBase64(content));
    expect(blob.encoding).toBe("utf8");
    expect(blob.text).toBe(content);
    expect(blob.bytes).toBeUndefined();
    expect(blob.path).toBe("main.py");
  });

  it("binary-as-.txt: a binary file with a .txt extension stores as binary, not corrupted text", () => {
    // Craft bytes that are NOT valid UTF-8
    const bytes = new Uint8Array([0x00, 0x01, 0x80, 0xFE, 0xFF, 0x90, 0xAB]);
    const blob = reconcileKeepRemoteFile("data.txt", toBase64(bytes));
    expect(blob.encoding).toBe("binary");
    expect(blob.bytes).toBeDefined();
    // Round-trip: the stored bytes are identical to the original
    expect(Array.from(blob.bytes!)).toEqual(Array.from(bytes));
  });

  it("no-extension text file: stores as text when the content is valid UTF-8", () => {
    const content = "MIT License\n\nPermission is hereby granted...";
    const blob = reconcileKeepRemoteFile("LICENSE", textToBase64(content));
    expect(blob.encoding).toBe("utf8");
    expect(blob.text).toBe(content);
  });

  it("BOM'd file: preserves the BOM (does not strip it)", () => {
    const bom = "﻿";
    const content = bom + "# coding: utf-8\nprint('hi')\n";
    const blob = reconcileKeepRemoteFile("script.py", textToBase64(content));
    expect(blob.encoding).toBe("utf8");
    expect(blob.text).toBe(content);
    expect(blob.text!.startsWith("﻿")).toBe(true);
  });

  it("all-zeroes binary round-trips losslessly", () => {
    const bytes = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    // Note: all-zeroes IS valid UTF-8 (U+0000 = null), but the re-encode check catches
    // the difference if TextEncoder handles it differently. In practice this should
    // round-trip as text since \0 is valid UTF-8.
    const blob = reconcileKeepRemoteFile("nulls.bin", toBase64(bytes));
    // Either encoding is acceptable as long as bytes are preserved
    if (blob.encoding === "binary") {
      expect(Array.from(blob.bytes!)).toEqual(Array.from(bytes));
    } else {
      const reEncoded = new TextEncoder().encode(blob.text!);
      expect(Array.from(reEncoded)).toEqual(Array.from(bytes));
    }
  });
});
