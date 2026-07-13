import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    css: false,
    exclude: ["e2e/**", "node_modules/**"],
    // Engine tests that do not need DOM run fine under jsdom; engine modules never import
    // preact/JSX, so the Preact alias does not interfere.
  },
  resolve: {
    alias: {
      "react": "preact/compat",
      "react-dom": "preact/compat"
    }
  }
});
