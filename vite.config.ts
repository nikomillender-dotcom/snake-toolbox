import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Snake ToolBox, integrated build. Self-hosted assets only, no CDN fetch (offline + require-corp).
// COOP/COEP headers mirrored on both dev and preview so the degraded-boot path (P1) is honestly
// testable locally. The production deploy layer (Vercel) carries the same headers via vercel.json.
//
// Lysithea's esbuild dev-only advisory: Vite 5.x uses esbuild for dev transforms. npm audit
// flags a moderate/high chain in esbuild's dev-server request forwarding (dev-only, never shipped
// in dist/). A Vite 8 beta major bump is available but carries its own compatibility risk for a
// Preact + CodeMirror + Web Worker project. DECISION: stay on Vite 5 for this integration. The
// advisory is dev-server-only (not in the shipped build), and a major Vite bump mid-integration
// is default-NO per the task instructions unless trivial. Revisit for a dedicated Vite-bump pass
// after integration is stable, or once Vite 8 reaches stable GA.
export default defineConfig({
  plugins: [preact()],
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      // S2: mirror the vercel.json CSP on dev/preview so the E2E genuinely tests wasm-unsafe-eval
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://api.github.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    }
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      // S2: mirror the vercel.json CSP on dev/preview so the E2E genuinely tests wasm-unsafe-eval
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://api.github.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
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
