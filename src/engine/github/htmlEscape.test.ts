import { describe, expect, it } from "vitest";
import { escapeForMarkdown } from "./htmlEscape.js";

describe("escapeForMarkdown (P13)", () => {
  it("escapes raw HTML tags so they cannot render", () => {
    const evil = "<script>alert(1)</script>";
    const escaped = escapeForMarkdown(evil);
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
  });

  it("escapes markdown heading/emphasis/link syntax", () => {
    expect(escapeForMarkdown("# Not a heading")).not.toMatch(/^# /);
    expect(escapeForMarkdown("[click me](javascript:alert(1))")).not.toContain("[click me](");
  });

  it("leaves an ordinary name unrecognizable-as-different only by the intended escapes", () => {
    const plain = "Niko the Curious";
    expect(escapeForMarkdown(plain)).toBe(plain); // no active characters, nothing to escape
  });

  it("escapes an image injection attempt", () => {
    const evil = "![alt](https://evil.example/x.png)";
    const escaped = escapeForMarkdown(evil);
    expect(escaped).not.toContain("![alt](");
  });
});
