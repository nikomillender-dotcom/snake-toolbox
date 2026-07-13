import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { execSync } from "node:child_process";

// Derive cache version from the build: git short hash or timestamp fallback.
// This is injected via Vite define so the SW and the version stamp read it.
let buildHash = "dev";
try {
  buildHash = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
} catch {
  buildHash = `t${Date.now()}`;
}

const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://api.github.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

export default defineConfig({
  plugins: [preact()],
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash),
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Content-Security-Policy": CSP,
    }
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Content-Security-Policy": CSP,
    }
  },
  build: {
    target: "es2022",
    sourcemap: true
  },
  worker: {
    format: "es"
  }
});
