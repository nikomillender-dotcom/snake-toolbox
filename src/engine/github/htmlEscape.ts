// htmlEscape (backend B8, P13). characterName / characterEpithet / project names / any user
// string embedded in a generated README or regenRootReadme output render as PLAIN TEXT, never
// markup. Escapes Markdown/HTML-active characters so a name cannot inject headings, links, images,
// or scripts into the PUBLIC portfolio README.
const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
  "`": "&#96;",
  "*": "&#42;",
  "_": "&#95;",
  "[": "&#91;",
  "]": "&#93;",
  "#": "&#35;",
  "|": "&#124;",
};

const ESCAPE_PATTERN = /[&<>"'`*_[\]#|]/g;

/**
 * Escapes a user-controlled string for safe embedding into generated Markdown (READMEs). Neutralizes
 * both HTML-active characters (so raw HTML/script tags cannot render) AND Markdown-active
 * characters (so the string cannot open a heading, emphasis run, link, image, or table cell it
 * does not own).
 */
export function escapeForMarkdown(input: string): string {
  return input.replace(ESCAPE_PATTERN, (ch) => ESCAPES[ch] ?? ch);
}
