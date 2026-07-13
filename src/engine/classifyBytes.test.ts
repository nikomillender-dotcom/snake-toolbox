// Tests for classifyBytes: proves the shared text/binary classification handles
// all the attack cases Frederick named (S5/S6 convergence).
import { describe, expect, it } from "vitest";
import { classifyBytes } from "./classifyBytes.js";

describe("classifyBytes (shared S5/S6 helper)", () => {
  it("valid UTF-8 text -> { kind: 'text', text }", () => {
    const bytes = new TextEncoder().encode("print('hello')\n");
    const result = classifyBytes(bytes);
    expect(result.kind).toBe("text");
    if (result.kind === "text") expect(result.text).toBe("print('hello')\n");
  });

  it("binary bytes (invalid UTF-8) -> { kind: 'binary' }", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x80, 0xFE, 0xFF, 0x90, 0xAB]);
    const result = classifyBytes(bytes);
    expect(result.kind).toBe("binary");
  });

  it("UTF-8 with BOM -> { kind: 'text' } with BOM preserved", () => {
    const bom = "﻿";
    const content = bom + "# coding: utf-8\n";
    const bytes = new TextEncoder().encode(content);
    const result = classifyBytes(bytes);
    expect(result.kind).toBe("text");
    if (result.kind === "text") {
      expect(result.text.startsWith("﻿")).toBe(true);
      expect(result.text).toBe(content);
    }
  });

  it("no-extension text content (like LICENSE) -> { kind: 'text' }", () => {
    const bytes = new TextEncoder().encode("MIT License\n\nPermission is hereby granted...");
    const result = classifyBytes(bytes);
    expect(result.kind).toBe("text");
  });

  it("a gzip file masquerading as .json -> { kind: 'binary' }", () => {
    // gzip magic bytes: 1f 8b
    const bytes = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const result = classifyBytes(bytes);
    expect(result.kind).toBe("binary");
  });

  it("empty bytes -> { kind: 'text', text: '' }", () => {
    const result = classifyBytes(new Uint8Array(0));
    expect(result.kind).toBe("text");
    if (result.kind === "text") expect(result.text).toBe("");
  });
});
