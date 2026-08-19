/** Locate the running @deepseek-ai/dsh and decide how to restart. */

import { existsSync } from 'node:fs'
import { readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const DSH_PKG = '@deepseek-ai/dsh'
export const FALLBACK_ENGINE = '/usr/local/lib/node_modules/@deepseek-ai/dsh'

const KIND = ['npx', 'pnpm', 'yarn', 'local', 'npm-global']

export function posix(path) {
  return String(path || '').replace(/\\/g, '/')
}

export function npmCommand(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm'
}

export function npmPrefixFromEngine(engineDir) {
  const norm = posix(engineDir)
  const needle = '/node_modules/@deepseek-ai/dsh'
  const index = norm.toLowerCase().lastIndexOf(needle)
  if (index === -1) return null
  const before = norm.slice(0, index)
  if (before.endsWith('/lib')) return before.slice(0, -4)
  return before
}

export function npmGlobalBinPath(engineDir, platform = process.platform) {
  const prefix = npmPrefixFromEngine(engineDir)
  if (!prefix) return null
  if (platform === 'win32') return join(prefix, 'dsh.cmd')
  return join(prefix, 'bin', 'dsh')
}

export async function ensureGlobalBin(engineDir, platform = process.platform) {
  const dest = npmGlobalBinPath(engineDir, platform)
  const binJs = join(engineDir, 'lib', 'bin.js')
  if (!dest || !existsSync(binJs)) return false
  try {
    if (platform === 'win32') {
      await writeFile(dest, `@echo off\r\nnode "${binJs}" %*\r\n`)
    } else {
      await rm(dest, { force: true })
      await symlink(binJs, dest)
    }
    return true
  } catch {
    return false
  }
}

export function dshHome(env = process.env) {
  return env.DSH_HOME
    || join(env.HOME || env.USERPROFILE || homedir(), '.dsh')
}

export function backupDir(env = process.env) {
  return join(dshHome(env), 'engine-bak')
}

export function stageDir(env = process.env) {
  // Never default to os.tmpdir(): in Docker that is often a 512MB tmpfs,
  // too small for @deepseek-ai/dsh + native addons, and npm then "hangs".
  return env.DSH_UPDATE_STAGE || join(dshHome(env), 'update-stage')
}

export function cacheDir(env = process.env) {
  return env.DSH_UPDATE_CACHE || join(dshHome(env), 'update-cache')
}

export function successFile(env = process.env) {
  return env.DSH_UPDATE_OK || join(dshHome(env), 'update-ok.json')
}

export function npmTimeoutMs(env = process.env) {
  const raw = Number(env.DSH_UPDATE_TIMEOUT_MS)
  return Number.isFinite(raw) && raw >= 30_000 ? raw : 12 * 60_000
}

export function detectInstallKind(engineDir) {
  const p = posix(engineDir).toLowerCase()
  if (!p) return 'npm-global'
  if (p.includes('/_npx/') || p.includes('/npm/_npx') || p.includes('/.npm/_npx')) return 'npx'
  if (p.includes('/.pnpm/') || p.includes('/pnpm/global')) return 'pnpm'
  if (p.includes('/.yarn/') || p.includes('/yarn/global')) return 'yarn'
  if (p.includes('/node_modules/@deepseek-ai/dsh') && !p.includes('/lib/node_modules/') && !p.includes('/roaming/npm/')) {
    const parts = p.split('/node_modules/@deepseek-ai/dsh')[0]
    if (parts && !/\/(nvm|fnm|volta|nodenv|n\/)/.test(parts) && !parts.endsWith('/usr/local') && !parts.endsWith('/usr')) {
      return 'local'
    }
  }
  return 'npm-global'
}

export function shouldExitToRestart(env = process.env, probes = {}) {
  if (env.DSH_UPDATE_RESTART === '0') return false
  if (env.DSH_UPDATE_RESTART === '1') return true
  if (env.DSH_ENGINE_PERSIST === '1') return true
  if (probes.pid === 1 || process.pid === 1) return true
  if (probes.docker === true) return true
  if (probes.docker === false) return false
  return existsSync('/.dockerenv')
}

export async function findPackageRoot(start) {
  let dir = start
  for (let i = 0; i < 10; i += 1) {
    if (!dir) return null
    try {
      const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
      if (pkg && pkg.name === DSH_PKG) return dir
    } catch {
      // keep walking
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

export async function resolveEngineDir(env = process.env, probes = {}) {
  const override = env.DSH_ENGINE_DIR
  if (override) {
    const fromEnv = await findPackageRoot(override)
    if (fromEnv) return fromEnv
    return override
  }
  const starts = [
    probes.argv1,
    probes.bin,
    process.argv[1],
    FALLBACK_ENGINE,
  ].filter(Boolean)
  for (const start of starts) {
    const root = await findPackageRoot(start)
    if (root) return root
  }
  return FALLBACK_ENGINE
}

export function modeCatalog(detected) {
  const active = detected.active
  const writable = detected.writable !== false
  return [
    {
      id: 'npx',
      label: 'npx',
      recommended: true,
      available: active === 'npx' && writable,
      active: active === 'npx',
      reason: active === 'npx'
        ? 'This process is the npx cache copy. The plugin replaces it in place. The next `npx dsh` may refetch; install a global pin if you want it sticky.'
        : 'Not how this DSH is running.',
    },
    {
      id: 'npm-global',
      label: 'npm -g',
      recommended: false,
      available: active === 'npm-global' && writable,
      active: active === 'npm-global',
      reason: 'Global npm prefix (nvm, Homebrew, Windows %APPDATA%\\npm, or a Docker volume).',
    },
    {
      id: 'pnpm',
      label: 'pnpm',
      recommended: false,
      available: active === 'pnpm' && writable,
      active: active === 'pnpm',
      reason: active === 'pnpm'
        ? 'Engine lives in the pnpm store/global. Files are replaced in place; no `pnpm add -g`.'
        : 'Not how this DSH is running.',
    },
    {
      id: 'yarn',
      label: 'yarn',
      recommended: false,
      available: active === 'yarn' && writable,
      active: active === 'yarn',
      reason: active === 'yarn'
        ? 'Engine lives in the Yarn global. Files are replaced in place.'
        : 'Not how this DSH is running.',
    },
    {
      id: 'local',
      label: 'local node_modules',
      recommended: false,
      available: active === 'local' && writable,
      active: active === 'local',
      reason: active === 'local'
        ? 'Project-local install. The plugin replaces that folder only.'
        : 'Not how this DSH is running.',
    },
    {
      id: 'source',
      label: 'source (git)',
      recommended: false,
      available: false,
      active: false,
      reason: 'Disabled. Community plugin — no git pull / rebuild of DeepSeek Harness.',
    },
  ]
}

export async function resolveRuntime(env = process.env, probes = {}) {
  const engineDir = await resolveEngineDir(env, probes)
  const active = KIND.includes(env.DSH_UPDATE_MODE) ? env.DSH_UPDATE_MODE : detectInstallKind(engineDir)
  const exitRestart = shouldExitToRestart(env, probes)
  return {
    engineDir,
    active,
    forced: KIND.includes(String(env.DSH_UPDATE_MODE || '')),
    persist: env.DSH_ENGINE_PERSIST === '1',
    locked: env.DSH_UPDATE === '0',
    restartKind: exitRestart ? 'exit' : 'manual',
    dshHome: dshHome(env),
    backupDir: backupDir(env),
    stageDir: stageDir(env),
    cacheDir: cacheDir(env),
    npm: npmCommand(probes.platform || process.platform),
  }
}
