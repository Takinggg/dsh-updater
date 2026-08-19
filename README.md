<p align="center">
  <img src="docs/logo.png" width="96" height="96" alt="dsh-updater — circular refresh icon for DeepSeek Harness">
</p>

<h1 align="center">dsh-updater</h1>

<p align="center">
  <strong>One-click updates for DeepSeek Harness (DSH)</strong><br>
  Community plugin · incremental npm tarballs · backup &amp; rollback · like Codex
</p>

<p align="center">
  <a href="https://github.com/Takinggg/dsh-updater/actions/workflows/test.yml"><img src="https://github.com/Takinggg/dsh-updater/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-white.svg" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@deepseek-ai/dsh"><img src="https://img.shields.io/badge/engine-%40deepseek--ai%2Fdsh-111.svg" alt="Updates @deepseek-ai/dsh"></a>
  <a href="README.fr.md"><img src="https://img.shields.io/badge/docs-français-blue.svg" alt="Documentation en français"></a>
  <img src="https://img.shields.io/badge/community-not%20official%20DeepSeek-important.svg" alt="Community plugin, not official DeepSeek software">
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#config">Config</a> ·
  <a href="#security">Security</a> ·
  <a href="README.fr.md">Français</a>
</p>

![Hero: HARNESS DSH UPDATER — community plugin for DeepSeek Harness](docs/hero.png)

**dsh-updater** adds a Settings → **Updates** panel and a sidebar button to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`@deepseek-ai/dsh`). It checks npm `next` / `latest`, copies your current engine, downloads **only packages that changed**, swaps the running engine, then restarts — or tells you to quit DSH on a laptop.

It is **not official DeepSeek software**. It does not fork DSH, does not `git pull` the source, and never runs `sudo` or `curl | bash`.

## Why this exists

A full `npm install @deepseek-ai/dsh` rebuilds a 200-package monorepo in memory and can **OOM** (we hit a 1 GB heap in Docker). Claude Code / Codex-style tools do not re-resolve the universe on every bump.

This plugin:

1. **Reuses** the engine already on disk (`node_modules`, native addons).
2. **Fetches** changed `@deepseek-ai/*` tarballs from the npm registry.
3. **Keeps** third-party deps (commander, koffi, …) when the version matches.
4. **Backs up** to `$DSH_HOME/engine-bak` and **rolls back** on failure.
5. Works **everywhere** the process is writable: Docker volume, `npm -g`, nvm, Windows `%APPDATA%\npm`, pnpm/yarn global, local `node_modules`, npx cache.

## Install

Never `dsh plugin add github:…` (unpinned). Clone this repo, then add the **absolute path**:

```bash
git clone https://github.com/Takinggg/dsh-updater.git
dsh plugin --profile web add /absolute/path/to/dsh-updater
```

Windows:

```powershell
dsh plugin --profile web add C:\absolute\path\to\dsh-updater
```

Open **Settings → Updates**, or the **Updates** control next to Settings.

## Screenshots

| Confirm & fetch | Success |
| --- | --- |
| ![Update overlay: fetch changed packages from rc.7 to rc.8](docs/overlay-update.png) | ![Success popup after a DeepSeek Harness update](docs/overlay-success.png) |

## How it works

1. Resolves `@deepseek-ai/dsh` by walking up from `process.argv[1]` (`DSH_ENGINE_DIR` override).
2. Reads npm dist-tags **`next`** and **`latest`**. Offers a target only if it is **newer** than the running engine (no accidental downgrade).
3. Backup → `$DSH_HOME/engine-bak`.
4. Stage on **`$DSH_HOME/update-stage`** (never Docker `/tmp` tmpfs).
5. Incremental tarballs into `$DSH_HOME/update-cache`. Registry `Accept: application/json` (avoids npm 406 on version URLs). `npm view` / `npm pack` fallbacks for odd registries.
6. Overlay, optional `npm rebuild` for native addons that actually changed.
7. Restores the `dsh` PATH shim when the install is a classic npm global prefix.
8. **Docker / PID 1 / `DSH_ENGINE_PERSIST=1`:** process exits 0 so Compose restarts it. A success popup is shown after reload.
9. **Laptop:** you quit DSH and start it again. The UI does not kill your session.

```text
incremental-tarballs @deepseek-ai/dsh@<version> --reuse-engine --stage $DSH_HOME/update-stage
```

## Config

| Variable | Effect |
|---|---|
| `DSH_ENGINE_DIR` | Force the engine folder. |
| `DSH_HOME` | Backup / stage / cache root (default `~/.dsh`). |
| `DSH_UPDATE=0` | Lock updates. |
| `DSH_UPDATE_RESTART=1` / `0` | Force process-exit restart, or never. |
| `DSH_ENGINE_PERSIST=1` | Supervised container (exit to restart). |
| `DSH_UPDATE_STAGE` | Staging directory. |
| `DSH_UPDATE_CACHE` | Tarball cache. |
| `DSH_UPDATE_TIMEOUT_MS` | Whole-job budget (default 12 minutes). |
| `DSH_UPDATE_MODE` | Display override only. |

Honors `npm_config_registry`, scoped `npm_config_@deepseek-ai:registry`, `NPM_TOKEN` / `NODE_AUTH_TOKEN` for private registries.

## Security

- Host RPC requires `{ confirm: true }` before install.
- Target must be a published `next` or `latest` dist-tag.
- No sudo, no live `npm -g` into a Docker engine volume (that can empty the prefix).
- Tarball paths are checked against traversal.
- Auto-rollback from `engine-bak` if verify fails.

## Development

```bash
npm test
npm run demo
```

Node 20+. Zero runtime dependencies.

## Disclaimer

Community plugin — **not official DeepSeek software**. DeepSeek and DeepSeek Harness are marks of their owners. This repo only installs versions already published on npm as `@deepseek-ai/dsh`.

## License

[MIT](LICENSE)
