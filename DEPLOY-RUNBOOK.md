# DEPLOY-RUNBOOK.md, Snake ToolBox

The ten-minute arming checklist for the first Vercel deploy and the canary.

## 1. Deploy to Vercel

- Push the `integration` branch to a GitHub repo (or merge to `main`).
- Connect the repo to Vercel. The `vercel.json` carries the COOP/COEP/CSP headers.
- Vercel runs `npm install` (which runs `postinstall` -> copies Pyodide assets to public/)
  then `npm run build`.
- Confirm the live URL serves `crossOriginIsolated === true` (open DevTools console).
- Confirm Pyodide boots and `print("ok")` produces real output.

## 2. Set the DEPLOYED_URL repository variable

The canary's `live-smoke` job reads `vars.DEPLOYED_URL` to know where to point Playwright.

- Go to the repo's Settings -> Secrets and variables -> Actions -> Variables.
- Create a repository variable named `DEPLOYED_URL` with the full Vercel URL
  (e.g. `https://snake-toolbox.vercel.app`).
- Without this variable, the live-smoke job reports "skipped" instead of testing.

## 3. Arm the canary

- Go to Actions -> "Canary (weekly smoke + keepalive)".
- Click "Run workflow" (the `workflow_dispatch` trigger).
- Confirm the canary runs green and does NOT open an issue.

## 4. Force one failure to see the issue open

- Temporarily break something (e.g. set DEPLOYED_URL to a bad URL).
- Run the canary again via `workflow_dispatch`.
- Confirm it opens a `canary-failure` labelled issue.
- Fix the URL back, re-run, confirm it COMMENTS on the existing issue instead of opening a new one.

## 5. Confirm the keepalive

- Go to Actions -> "Canary keepalive".
- Confirm it committed a `canary-heartbeat` file on the default branch.
- This keeps the cron alive past 60 days of no commit activity.

## 6. iPad Safari verification (deploy-phase checklist)

- Open the live URL on a real iPad.
- Confirm `crossOriginIsolated === true` (requires Safari 16.4+).
- Test `input()` in a program: the InputRequest UI should appear and typing a value should
  resume the program.
- Test `Stop` on a `while True` loop: should raise KeyboardInterrupt, not hang.
- Test CodeMirror 6 with VoiceOver: read/edit/navigate, autocomplete announced.
  If CM6 fails VoiceOver, the textarea fallback ships (F17).

## 7. PAT expiry verification (checklist item 27)

- Connect Niko's real fine-grained PAT.
- Confirm the `GitHub-Authentication-Token-Expiration` header behavior.
- Confirm the sanity guard shows nothing on a bad/missing header (captured:false),
  never a permanent "0 days" alarm.

## The PYODIDE_VERSION constant

The pinned Pyodide version lives in ONE place: `src/pyodideManifest.ts`.
A version bump is one change there. The boot message, the postinstall copy script,
and the hash manifest all read from it.

## The vercel.json header posture (I5)

This note used to live as a `$comment` inside `vercel.json`, but Vercel's strict schema
rejects unknown top-level keys, so it lives here now. Deploy posture: `require-corp` is
the ONLY supported COEP value (iPad Safari has no `credentialless`). CSP `script-src`
uses `wasm-unsafe-eval`; add `unsafe-eval` ONLY if the pinned Pyodide 314.0.2 genuinely
requires it (hands-on verify at deploy, checklist item 2).
