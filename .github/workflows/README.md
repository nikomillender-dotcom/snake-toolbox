# Canary workflows, status note

Authored and reviewed by Hubert (backend), 2026-07-12. These files cannot run in GitHub Actions yet
because this workspace has no git remote (no repo pushed to GitHub), which is expected at this
build stage: the wing is building in parallel, and Edelgard's integration pass is what creates the
real repo and the Vercel deployment these workflows watch. Ship these files as REVIEWED, ready
shapes now, per the launch instructions, rather than waiting to author them until a remote exists.

## What is real today

- `canary.yml`'s `engine-verify` job is fully real: it runs `npm ci`, `npm run typecheck`,
  `npm test`, and `npm run worker-guard` against THIS repo, exactly the commands proven locally in
  BUILD-REPORT.md. Once this workspace is pushed anywhere with Actions enabled, this job runs
  today, no changes needed.
- The failure-alarm job (`alarm-on-failure`) is fully real and self-contained: it only needs
  `issues: write` and the ambient `GITHUB_TOKEN`, no external state.
- `canary-keepalive.yml` is fully real and self-contained: it only needs `contents: write` and the
  ambient `GITHUB_TOKEN` (implicit for `git push` over HTTPS in Actions).

## What is pending (not a gap in this deliverable, a sequencing fact)

- `canary.yml`'s `live-smoke` job is gated behind `vars.DEPLOYED_URL` (an Actions repository
  variable, not a secret, since a URL is not sensitive) being set. Until Edelgard's integration
  produces a deployed Vercel URL, this job reports `skipped`, never a false red X. Once the URL
  exists:
  1. Set the repository variable `DEPLOYED_URL` (Settings -> Secrets and variables -> Actions ->
     Variables) to the deployed URL.
  2. Replace the placeholder `echo` steps with a real Playwright script that performs the four
     checks listed in integration-overview.md I13: boot self-check, `crossOriginIsolated === true`,
     a trivial `print("ok")` run, and a MOCK ship dry-run through the GitHubSync path (build tree
     and commit objects in memory, assert their shape, never publish, never touch a real PAT).
  3. This is Edelgard's/the composition root's script to author (it needs the real DOM, service
     worker, and worker runtime wired together); Hubert's engine-side contract for it is that
     `GitHubSyncClient` already supports the SAME mocked-`fetch` pattern this repo's own tests use
     (`src/fixtures/fakeGitHubApi.ts`), so a live "dry-run ship" can inject a fetch that builds Git
     Data API objects without ever calling the real `api.github.com`.

## Hard rule this file exists to keep visible

The canary NEVER holds the real fine-grained PAT. No step in either workflow reads a PAT from an
Actions secret, and none should ever be added. If a future change seems to need "the token this app
already uses" inside CI, that is the exact forbidden thing (integration-overview.md I13); route it
through the Manager to Simbo instead of adding it locally.
