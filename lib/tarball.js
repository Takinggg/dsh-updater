/** Incremental npm tarball updates. No arborist, no full `npm install`. */

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { DSH_PKG, npmCommand } from './resolve.js'

export const WORKSPACE_PREFIX = '@deepseek-ai/'
export const NATIVE_PACKAGES = new Set([
  'koffi',
  'node-pty',
  'protobufjs',
  '@deepseek-ai/dsh-subprocess-local',
])

const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

export function encodePkg(name) {
  return String(name).replace('/', '%2f')
}

export function isWorkspacePkg(name) {
  return String(name).startsWith(WORKSPACE_PREFIX)
}

export function isNativePkg(name) {
  return NATIVE_PACKAGES.has(name)
}

export function cacheFileName(name, version) {
  return `${String(name).replace(/^@/, '').replace('/', '-')}-${version}.tgz`
}

export function installDir(seedDir, name) {
  if (name === DSH_PKG) return seedDir
  return join(seedDir, 'node_modules', ...String(name).split('/'))
}

export function stagedPackageDir(stage) {
  return join(stage, 'node_modules', '@deepseek-ai', 'dsh')
}

export function resolveRange(range, packument = null) {
  const raw = String(range || '').trim()
  if (VERSION_RE.test(raw)) return raw
  if (raw === 'latest' || raw === 'next') {
    return packument && packument['dist-tags'] && packument['dist-tags'][raw]
      ? packument['dist-tags'][raw]
      : null
  }
  const stripped = raw.replace(/^[~^>=<\s]+/, '').split(/\s+/)[0]
  if (VERSION_RE.test(stripped)) return stripped
  return null
}

export function registryBase(name, env = process.env) {
  if (String(name).startsWith('@')) {
    const scope = String(name).split('/')[0]
    const scoped = env[`npm_config_${scope}:registry`]
    if (scoped) return String(scoped).replace(/\/$/, '')
  }
  const raw = env.npm_config_registry || env.NPM_CONFIG_REGISTRY || 'https://registry.npmjs.org'
  return String(raw).replace(/\/$/, '')
}

export const ACCEPT_JSON = 'application/json'

export function registryHeaders(env = process.env, accept = ACCEPT_JSON) {
  const headers = {
    Accept: accept,
    'User-Agent': 'dsh-updater',
  }
  const token = env.NPM_TOKEN || env.NODE_AUTH_TOKEN || env.npm_config__authToken
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function readVersion(dir) {
  try {
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    return VERSION_RE.test(pkg.version) ? pkg.version : null
  } catch {
    return null
  }
}

function authFetch(url, env, extra = {}) {
  const ctrl = new AbortController()
  const ms = extra.timeoutMs || 20_000
  const timer = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, {
    signal: ctrl.signal,
    headers: { ...registryHeaders(env, extra.accept), ...extra.headers },
    redirect: 'follow',
  }).finally(() => clearTimeout(timer))
}

export async function fetchRegistryJson(url, env = process.env, fetcher = authFetch) {
  let res = await fetcher(url, env, { timeoutMs: 20_000, accept: ACCEPT_JSON })
  if (res && res.status === 406) {
    res = await fetcher(url, env, {
      timeoutMs: 20_000,
      accept: ACCEPT_JSON,
      headers: { Accept: '*/*' },
    })
  }
  if (!res || !res.ok) {
    const status = res && res.status ? res.status : 'offline'
    throw new Error(`registry ${status} ${url}`)
  }
  return res.json()
}

export async function verifyIntegrity(buffer, integrity) {
  if (!integrity) return true
  const [algo, expected] = String(integrity).split('-')
  if (!expected || !['sha512', 'sha256', 'sha1'].includes(algo)) return true
  const digest = createHash(algo).update(buffer).digest('base64')
  return digest === expected
}

function readTarString(block, start, end) {
  return block.subarray(start, end).toString('utf8').replace(/\0/g, '').trim()
}

function readTarName(block) {
  const name = readTarString(block, 0, 100)
  const prefix = readTarString(block, 345, 500)
  return prefix ? `${prefix}/${name}` : name
}

function safeJoin(dest, rel) {
  const clean = String(rel).replace(/\\/g, '/').replace(/^\/+/, '')
  if (!clean || clean === '.' || clean.split('/').includes('..')) {
    throw new Error(`unsafe tar path ${rel}`)
  }
  const out = resolve(dest, clean)
  const root = resolve(dest)
  if (out !== root && !out.startsWith(root + '/') && !out.startsWith(root + '\\')) {
    throw new Error(`unsafe tar path ${rel}`)
  }
  return out
}

export async function extractTgzNode(buffer, dest) {
  const tar = Buffer.isBuffer(buffer) && buffer[0] === 0x1f ? gunzipSync(buffer) : buffer
  await mkdir(dest, { recursive: true })
  let offset = 0
  let longName = null
  let paxPath = null
  while (offset + 512 <= tar.length) {
    const block = tar.subarray(offset, offset + 512)
    offset += 512
    if (block.every((byte) => byte === 0)) break
    const size = Number.parseInt(readTarString(block, 124, 136), 8) || 0
    const type = String.fromCharCode(block[156] || 48)
    const linkname = readTarString(block, 157, 257)
    const padded = Math.ceil(size / 512) * 512
    if (type === 'L') {
      longName = tar.subarray(offset, offset + size).toString('utf8').replace(/\0/g, '')
      offset += padded
      continue
    }
    if (type === 'x' || type === 'g') {
      const text = tar.subarray(offset, offset + size).toString('utf8')
      const match = text.match(/(?:^|\n)\d+ path=([^\n]+)/) || text.match(/path=([^\n]+)/)
      if (match && type === 'x') paxPath = match[1].trim()
      offset += padded
      continue
    }
    const name = (longName || paxPath || readTarName(block)).replace(/\\/g, '/')
    longName = null
    paxPath = null
    let rel = name.replace(/^package\//, '')
    if (!rel || rel === 'package') {
      offset += padded
      continue
    }
    const out = safeJoin(dest, rel)
    if (type === '5') {
      await mkdir(out, { recursive: true })
    } else if (type === '2') {
      await mkdir(dirname(out), { recursive: true })
      await rm(out, { force: true }).catch(() => {})
      try {
        await symlink(linkname, out)
      } catch {
        // Windows without symlink privilege: skip, optional bins still work
      }
    } else if (type === '0' || type === '' || type === '7') {
      await mkdir(dirname(out), { recursive: true })
      await writeFile(out, tar.subarray(offset, offset + size))
    }
    offset += padded
  }
}

function runSilent(cmd, args, timeoutMs, cwd, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) reject(new Error(stderr.trim() || `${cmd} exit ${code}`))
      else resolveRun(stdout)
    })
  })
}

export async function extractTgzFile(file, dest) {
  await mkdir(dest, { recursive: true })
  const raw = await readFile(file)
  await extractTgzNode(raw, dest)
}

export async function overlayTarball(file, dest, keepModules) {
  if (keepModules) {
    await extractTgzFile(file, dest)
    return
  }
  const nm = join(dest, 'node_modules')
  const hold = existsSync(nm) ? `${dest}.nm-hold` : null
  if (hold) {
    await rm(hold, { recursive: true, force: true })
    await cp(nm, hold, { recursive: true })
  }
  await rm(dest, { recursive: true, force: true })
  await mkdir(dest, { recursive: true })
  await extractTgzFile(file, dest)
  if (hold) {
    await rm(join(dest, 'node_modules'), { recursive: true, force: true }).catch(() => {})
    await cp(hold, join(dest, 'node_modules'), { recursive: true })
    await rm(hold, { recursive: true, force: true })
  }
}

export async function npmPackToCache(name, version, cache, env = process.env) {
  await mkdir(cache, { recursive: true })
  const before = new Set(await readdir(cache).catch(() => []))
  await runSilent(
    npmCommand(),
    ['pack', `${name}@${version}`, '--pack-destination', cache],
    90_000,
    cache,
    {
      npm_config_update_notifier: 'false',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  )
  const guess = cacheFileName(name, version)
  const guessed = join(cache, guess)
  if (existsSync(guessed)) return guessed
  const after = (await readdir(cache)).filter((file) => file.endsWith('.tgz') && !before.has(file))
  if (after[0]) return join(cache, after[0])
  throw new Error(`npm pack produced no tarball for ${name}@${version}`)
}

export async function npmViewManifest(name, version, env = process.env) {
  const raw = await runSilent(
    npmCommand(),
    ['view', `${name}@${version}`, '--json'],
    30_000,
    undefined,
    {
      npm_config_update_notifier: 'false',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  )
  const doc = JSON.parse(String(raw || '').trim() || '{}')
  if (!doc.dist || !doc.dist.tarball) throw new Error(`npm view missing tarball for ${name}@${version}`)
  return doc
}

export function createRegistry(options = {}) {
  const env = options.env || process.env
  const cache = options.cacheDir
  const fetchJson = options.fetchJson
  const fetchBuffer = options.fetchBuffer
  const packuments = new Map()
  const manifests = new Map()

  async function getJson(url) {
    if (fetchJson) return fetchJson(url)
    return fetchRegistryJson(url, env)
  }

  async function getBuffer(url) {
    if (fetchBuffer) return fetchBuffer(url)
    const res = await authFetch(url, env, {
      timeoutMs: 90_000,
      headers: { Accept: 'application/octet-stream', 'User-Agent': 'dsh-updater' },
    })
    if (!res.ok) throw new Error(`tarball ${res.status} ${url}`)
    return Buffer.from(await res.arrayBuffer())
  }

  async function packument(name) {
    if (packuments.has(name)) return packuments.get(name)
    const url = `${registryBase(name, env)}/${encodePkg(name)}`
    const doc = await getJson(url)
    packuments.set(name, doc)
    return doc
  }

  async function resolveVersion(name, range) {
    const exact = resolveRange(range)
    if (exact && VERSION_RE.test(String(range).trim())) return exact
    let doc = null
    try {
      doc = await packument(name)
    } catch {
      doc = null
    }
    const fromRange = resolveRange(range, doc)
    if (fromRange && doc && doc.versions && doc.versions[fromRange]) return fromRange
    if (fromRange) return fromRange
    if (doc && doc['dist-tags'] && doc['dist-tags'].latest) return doc['dist-tags'].latest
    throw new Error(`cannot resolve ${name}@${range}`)
  }

  async function fetchManifest(name, range) {
    const version = await resolveVersion(name, range)
    const key = `${name}@${version}`
    if (manifests.has(key)) return manifests.get(key)
    const url = `${registryBase(name, env)}/${encodePkg(name)}/${encodeURIComponent(version)}`
    let doc
    try {
      doc = await getJson(url)
    } catch {
      doc = await npmViewManifest(name, version, env)
    }
    if (!doc || !doc.dist || !doc.dist.tarball) throw new Error(`no tarball for ${key}`)
    manifests.set(key, doc)
    return doc
  }

  async function downloadTarball(item) {
    const file = join(cache, cacheFileName(item.name, item.version))
    await mkdir(cache, { recursive: true })
    if (existsSync(file)) {
      const cached = await readFile(file)
      if (await verifyIntegrity(cached, item.integrity)) return file
    }
    try {
      const body = await getBuffer(item.tarball)
      if (!(await verifyIntegrity(body, item.integrity))) {
        throw new Error(`integrity mismatch ${item.name}@${item.version}`)
      }
      await writeFile(file, body)
      return file
    } catch {
      return npmPackToCache(item.name, item.version, cache, env)
    }
  }

  return {
    env,
    cacheDir: cache,
    packument,
    resolveVersion,
    fetchManifest,
    downloadTarball,
  }
}

export async function seedEngine(engineDir, stagedDsh) {
  await mkdir(dirname(stagedDsh), { recursive: true })
  await rm(stagedDsh, { recursive: true, force: true })
  await cp(engineDir, stagedDsh, { recursive: true })
}

async function mapPool(items, limit, worker) {
  if (!items.length) return
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index]
      index += 1
      await worker(current)
    }
  })
  await Promise.all(workers)
}

export async function planUpdate(seedDir, target, registry, onLog = () => {}) {
  const reused = []
  const download = []
  const seen = new Set()
  const pending = [{ name: DSH_PKG, range: target, optional: false }]

  const visit = async (item) => {
    if (seen.has(item.name)) return
    seen.add(item.name)
    if (!isWorkspacePkg(item.name)) {
      const dest = installDir(seedDir, item.name)
      const have = await readVersion(dest)
      if (have) {
        reused.push({ name: item.name, version: have, dest, reused: true })
        return
      }
    }
    let manifest
    try {
      manifest = await registry.fetchManifest(item.name, item.range)
    } catch (error) {
      if (item.optional) {
        onLog(`skip optional ${item.name}: ${error instanceof Error ? error.message : error}`)
        return
      }
      throw error
    }
    const dest = installDir(seedDir, item.name)
    const have = await readVersion(dest)
    const entry = {
      name: item.name,
      version: manifest.version,
      dest,
      tarball: manifest.dist.tarball,
      integrity: manifest.dist.integrity,
      optional: item.optional === true,
      native: isNativePkg(item.name),
    }
    if (have === manifest.version) reused.push({ ...entry, reused: true })
    else download.push(entry)

    const next = []
    for (const [dep, range] of Object.entries(manifest.dependencies || {})) {
      next.push({ name: dep, range, optional: false })
    }
    for (const [dep, range] of Object.entries(manifest.optionalDependencies || {})) {
      next.push({ name: dep, range, optional: true })
    }
    if (next.length) pending.push(...next)
  }

  while (pending.length) {
    const wave = []
    const waveNames = new Set()
    while (pending.length && wave.length < 8) {
      const item = pending.shift()
      if (seen.has(item.name) || waveNames.has(item.name)) continue
      waveNames.add(item.name)
      wave.push(item)
    }
    if (!wave.length) continue
    await mapPool(wave, 6, visit)
  }

  return { reused, download }
}

export async function applyPlan(plan, registry, hooks = {}) {
  const total = plan.download.length
  let done = 0
  const rebuilt = []
  await mapPool(plan.download, 3, async (item) => {
    try {
      const file = await registry.downloadTarball(item)
      await overlayTarball(file, item.dest, item.name === DSH_PKG)
      done += 1
      if (hooks.onItem) hooks.onItem(done, total, item)
      if (item.native) rebuilt.push(item.name)
    } catch (error) {
      if (item.optional) {
        if (hooks.onLog) {
          hooks.onLog(`skip optional ${item.name}: ${error instanceof Error ? error.message : error}`)
        }
        done += 1
        return
      }
      throw error
    }
  })
  return { rebuilt }
}

export async function rebuildNative(stagedDsh, names, run) {
  if (!names.length) return
  const unique = [...new Set(names)]
  await run(
    npmCommand(),
    ['rebuild', ...unique, '--omit=dev', '--no-audit', '--no-fund', '--foreground-scripts'],
    180_000,
    stagedDsh,
  )
}

export function describeUpdate(version, stage) {
  return [
    'incremental-tarballs',
    `${DSH_PKG}@${version}`,
    '--reuse-engine',
    '--stage',
    stage,
  ]
}

