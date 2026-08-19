# Contributing to dsh-updater

Community plugin — **not an official DeepSeek project**.

## Rules

- No `sudo`, no `curl | bash`, no unpinned `github:` plugin specs.
- Only install `@deepseek-ai/dsh` at published npm `next` / `latest`.
- Do not rebuild DSH from source.
- Host logic: `lib/engine.js`, `lib/tarball.js`, `lib/resolve.js`. UI: `lib/client.js` (ModuleLoader).
- `npm test` must stay green. Do not hardcode `/usr/local` except as a last-resort fallback.

## Workflow

1. Change engine or client.
2. Run `npm test` and `npm run demo`.
3. Open a PR against `main`.
