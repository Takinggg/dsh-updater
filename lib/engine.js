/** Community DSH updater. Only @deepseek-ai/dsh, published dist-tags, no sudo. */

import { access, constants, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  FALLBACK_ENGINE,
  cacheDir as resolveCacheDir,
  detectInstallKind,
  dshHome,
  ensureGlobalBin,
  modeCatalog,
  npmCommand,
  npmTimeoutMs,
  resolveRuntime,
  shouldExitToRestart,
  stageDir as resolveStageDir,
  successFile,
} from './resolve.js'
import {
  applyPlan,
  createRegistry,
  describeUpdate,
  planUpdate,
  seedEngine,
  stagedPackageDir,
} from './tarball.js'

export { modeCatalog, resolveRuntime } from './resolve.js'
export const DSH_PKG = '@deepseek-ai/dsh'
export const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
export const ENGINE_DIR = FALLBACK_ENGINE
export const GITHUB_REPO = 'deepseek-ai/deepseek-harness'
export const MODES = ['npx', 'npm-global', 'pnpm', 'yarn', 'local', 'source']

const ALLOWED_SCRIPTS = [
  '@deepseek-ai/dsh-subprocess-local',
  'koffi',
  'node-pty',
  '@google/genai',
  'protobufjs',
]

const TAG_TTL_MS = 45_000
const NOTES_TTL_MS = 10 * 60_000
const LOG_CAP = 140

const emptyJob = () => ({
  busy: false,
  phase: 'idle',
  download: 0,
  install: 0,
  logs: [],
  from: null,
  to: null,
  error: null,
  command: [],
  rollbackAvailable: false,
  restarting: false,
  message: '',
  updatedAt: 0,
})

let job = emptyJob()
let tagCache = { at: 0, tags: null, error: null }
let notesCache = { at: 0, version: null, notes: null }

function now() {
  return Date.now()
}

function setJob(partial) {
  job = { ...job, ...partial, updatedAt: now() }
  return job
}

function appendLog(line) {
  const text = String(line || '').replace(/\s+/g, ' ').trim()
  if (!text) return
  const logs = [...job.logs, text].slice(-LOG_CAP)
  setJob({ logs })
}

export function resetJob(next = {}) {
  job = { ...emptyJob(), ...next, updatedAt: now() }
  return job
}

export function getJob() {
  return job
}

export function parseVersion(raw) {
  const v = String(raw || '').trim()
  return VERSION_RE.test(v) ? v : null
}

export function cmpVersion(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return 0
  const parts = (v) => {
    const match = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/)
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      pre: match[4] || null,
    }
  }
  const va = parts(pa)
  const vb = parts(pb)
  if (va.major !== vb.major) return va.major - vb.major
  if (va.minor !== vb.minor) return va.minor - vb.minor
  if (va.patch !== vb.patch) return va.patch - vb.patch
  if (va.pre === vb.pre) return 0
  if (!va.pre) return 1
  if (!vb.pre) return -1
  return va.pre.localeCompare(vb.pre, undefined, { numeric: true })
}

export function pickTarget(distTags, current) {
  const candidates = [parseVersion(distTags && distTags.next), parseVersion(distTags && distTags.latest)]
    .filter(Boolean)
  let best = null
  for (const version of candidates) {
    if (cmpVersion(version, current) <= 0) continue
    if (!best || cmpVersion(version, best) > 0) best = version
  }
  return best
}

export function allowedTarget(requested, distTags) {
  const want = parseVersion(requested)
  if (!want || !distTags) return null
  const tags = [distTags.next, distTags.latest].map(parseVersion).filter(Boolean)
  return tags.includes(want) ? want : null
}

export function parseNpmProgress(line, prev = { download: 0, install: 0 }) {
  return parseUpdateProgress(line, prev)
}

export function parseUpdateProgress(line, prev = { download: 0, install: 0 }) {
  const text = String(line || '')
  const fetched = text.match(/Fetched (\d+)\/(\d+)/i)
  if (fetched) {
    const total = Number(fetched[2]) || 1
    return { download: Math.min(99, Math.round((100 * Number(fetched[1])) / total)), install: prev.install }
  }
  const extracted = text.match(/Extracted (\d+)\/(\d+)/i)
  if (extracted) {
    const total = Number(extracted[2]) || 1
    return { download: 100, install: Math.min(99, Math.round((100 * Number(extracted[1])) / total)) }
  }
  if (/Reusing current engine|Copying current engine|Comparing packages/i.test(text)) {
    return { download: Math.max(prev.download, 6), install: prev.install }
  }
  if (/http fetch|download|tarball|\.tgz|reify:download/i.test(text)) {
    return { download: Math.min(95, Math.max(12, prev.download + 10)), install: prev.install }
  }
  if (/extract|reify:extract|unpack|integrity/i.test(text)) {
    return { download: Math.max(prev.download, 100), install: Math.min(90, Math.max(18, prev.install + 12)) }
  }
  if (/reify:link|added \d|changed \d|audited|rebuild/i.test(text)) {
    return { download: 100, install: Math.min(98, Math.max(prev.install, 72)) }
  }
  return { download: prev.download, install: prev.install }
}

export function detectMode(env = process.env, probes = {}) {
  const forced = String(env.DSH_UPDATE_MODE || '').trim()
  const active = MODES.includes(forced)
    ? forced
    : (probes.kind || detectInstallKind(probes.engineDir || ENGINE_DIR) || 'npm-global')
  return {
    active,
    forced: MODES.includes(forced),
    persist: env.DSH_ENGINE_PERSIST === '1',
    locked: env.DSH_UPDATE === '0',
    engineDir: probes.engineDir || ENGINE_DIR,
    restartKind: shouldExitToRestart(env, probes) ? 'exit' : 'manual',
    writable: probes.writable,
  }
}

export function buildCommand(version, stage = resolveStageDir()) {
  return describeUpdate(version, stage)
}

export async function prepareStage(stage = resolveStageDir()) {
  await rm(stage, { recursive: true, force: true })
  await mkdir(stage, { recursive: true })
  const allowScripts = Object.fromEntries(ALLOWED_SCRIPTS.map((name) => [name, true]))
  await writeFile(join(stage, 'package.json'), JSON.stringify({
    name: 'dsh-update-stage',
    private: true,
    allowScripts,
  }, null, 2))
  await writeFile(join(stage, '.npmrc'), 'ignore-scripts=false\n')
}

export async function currentVersion(dir = ENGINE_DIR) {
  const pkg = JSON.parse(await readFile(`${dir}/package.json`, 'utf8'))
  return parseVersion(pkg.version)
}

export async function writable(dir = ENGINE_DIR) {
  try {
    await access(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

function run(cmd, args, timeoutMs, onChunk, cwd) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const home = process.env.HOME || process.env.USERPROFILE || homedir()
    const cache = process.env.npm_config_cache || join(dshHome(), 'npm-cache')
    const child = spawn(cmd, args, {
      cwd: cwd || undefined,
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        HOME: home,
        npm_config_cache: cache,
        npm_config_update_notifier: 'false',
        npm_config_progress: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let lastBeat = 0
    const tick = setInterval(() => {
      const elapsed = Date.now() - started
      if (elapsed >= timeoutMs) {
        child.kill('SIGKILL')
        return
      }
      if (onChunk && elapsed - lastBeat >= 10_000) {
        lastBeat = elapsed
        onChunk(`[npm still running… ${Math.round(elapsed / 1000)}s / ${Math.round(timeoutMs / 1000)}s]\n`)
      }
    }, 2000)
    const handle = (chunk, sink) => {
      const text = String(chunk)
      if (sink === 'out') stdout += text
      else stderr += text
      if (onChunk) onChunk(text)
    }
    child.stdout.on('data', (chunk) => handle(chunk, 'out'))
    child.stderr.on('data', (chunk) => handle(chunk, 'err'))
    child.on('error', (error) => {
      clearInterval(tick)
      reject(error)
    })
    child.on('close', (code) => {
      clearInterval(tick)
      if (code !== 0) {
        const why = Date.now() - started >= timeoutMs
          ? `${cmd} timeout after ${Math.round(timeoutMs / 1000)}s`
          : (stderr.trim() || stdout.trim() || `${cmd} exit ${code}`)
        reject(new Error(why))
        return
      }
      resolve(stdout)
    })
  })
}

async function distTags(force = false) {
  if (!force && tagCache.tags && now() - tagCache.at < TAG_TTL_MS) {
    return tagCache
  }
  try {
    const tags = JSON.parse(await run(npmCommand(), ['view', DSH_PKG, 'dist-tags', '--json'], 20000))
    tagCache = { at: now(), tags, error: null }
  } catch (error) {
    tagCache = {
      at: now(),
      tags: tagCache.tags,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  return tagCache
}

async function fetchGithubNotes(version) {
  const tags = [`v${version}`, version]
  for (const tag of tags) {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${encodeURIComponent(tag)}`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-updater' },
      })
      if (!res.ok) continue
      const json = await res.json()
      const body = String(json.body || '').trim()
      if (!body && !json.name) continue
      return {
        version,
        title: json.name || tag,
        body: body || json.name || '',
        url: json.html_url || `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`,
        source: 'github',
      }
    } catch {
      // try next tag / npm fallback
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

async function fetchNpmNotes(version) {
  const raw = JSON.parse(await run(
    npmCommand(),
    ['view', `${DSH_PKG}@${version}`, 'description', 'version', 'gitHead', '--json'],
    15000,
  ))
  const description = typeof raw === 'string' ? raw : (raw && raw.description) || ''
  return {
    version,
    title: `${DSH_PKG}@${version}`,
    body: description || `Published ${DSH_PKG}@${version} on npm.`,
    url: `https://www.npmjs.com/package/${DSH_PKG}/v/${version}`,
    source: 'npm',
  }
}

export async function releaseNotes(version, force = false) {
  const ver = parseVersion(version)
  if (!ver) return null
  if (!force && notesCache.notes && notesCache.version === ver && now() - notesCache.at < NOTES_TTL_MS) {
    return notesCache.notes
  }
  let notes = await fetchGithubNotes(ver)
  if (!notes) {
    try {
      notes = await fetchNpmNotes(ver)
    } catch (error) {
      notes = {
        version: ver,
        title: `${DSH_PKG}@${ver}`,
        body: error instanceof Error ? error.message : String(error),
        url: `https://www.npmjs.com/package/${DSH_PKG}/v/${ver}`,
        source: 'error',
      }
    }
  }
  notesCache = { at: now(), version: ver, notes }
  return notes
}

export async function status(options = {}) {
  const force = options.force === true
  const includeNotes = options.notes === true
  if (force && job.phase === 'confirm' && !job.busy) {
    resetJob()
  }
  if (job.busy || job.restarting || job.phase === 'done') {
    return toSnapshot(null, { notes: includeNotes ? notesCache.notes : null })
  }
  const runtime = await resolveRuntime()
  const current = await currentVersion(runtime.engineDir)
  const canWrite = await writable(runtime.engineDir)
  const detected = {
    ...runtime,
    writable: canWrite,
  }
  const cached = await distTags(force)
  const tags = cached.tags || {}
  const recorded = await readSuccess()
  const success = recorded && recorded.to === current ? recorded : null
  if (recorded && !success) {
    await rm(successFile(), { force: true })
  }
  const target = pickTarget(tags, current)
  const notes = includeNotes && target ? await releaseNotes(target, force) : (includeNotes ? notesCache.notes : null)
  const base = {
    current,
    latest: parseVersion(tags.latest),
    next: parseVersion(tags.next),
    target,
    update: Boolean(target) && canWrite && !runtime.locked,
    writable: canWrite,
    persist: runtime.persist,
    locked: runtime.locked,
    restartKind: runtime.restartKind,
    mode: detected,
    modes: modeCatalog(detected),
    command: target ? buildCommand(target, runtime.stageDir) : [],
    notes,
    error: cached.error,
    hint: runtime.locked
      ? 'DSH_UPDATE=0 — updates locked.'
      : !canWrite
        ? `DSH is not writable at ${runtime.engineDir}. Fix ownership or use a user npm prefix.`
        : target
          ? runtime.restartKind === 'exit'
            ? `Update ${current} → ${target} (changed tarballs only), then the process exits and the supervisor restarts it.`
            : `Update ${current} → ${target} (changed tarballs only), then quit DSH and start it again.`
          : 'Up to date.',
  }
  if (success && success.to === current) {
    return toSnapshot({
      ...base,
      target: null,
      update: false,
      hint: `Updated ${success.from || ''} → ${success.to}.`,
    }, { phase: 'success', success })
  }
  if (job.phase === 'confirm' && !job.busy) {
    if (!target || (job.to && cmpVersion(job.to, current) <= 0)) {
      resetJob()
      return toSnapshot(base)
    }
    return toSnapshot(base, { phase: 'confirm' })
  }
  return toSnapshot(base)
}

export async function readSuccess() {
  try {
    const raw = JSON.parse(await readFile(successFile(), 'utf8'))
    const to = parseVersion(raw && raw.to)
    if (!to) return null
    return { from: parseVersion(raw.from), to, at: Number(raw.at) || 0 }
  } catch {
    return null
  }
}

export async function writeSuccess(info) {
  await writeFile(successFile(), JSON.stringify({
    from: info.from || null,
    to: info.to,
    at: Date.now(),
  }))
}

export async function dismissSuccess() {
  await rm(successFile(), { force: true })
  return status({ force: true })
}

async function backup(runtime, current) {
  setJob({ phase: 'backing-up', download: 0, install: 0 })
  appendLog(`Backup ${current} → ${runtime.backupDir}`)
  await rm(runtime.backupDir, { recursive: true, force: true })
  await cp(runtime.engineDir, runtime.backupDir, { recursive: true })
  await writeFile(join(runtime.backupDir, '.dsh-updater-from'), `${current}\n`)
  setJob({ rollbackAvailable: true })
  appendLog('Backup ready')
}

export async function rollback() {
  const runtime = await resolveRuntime()
  try {
    await access(runtime.backupDir, constants.R_OK)
  } catch {
    throw new Error('No backup to restore')
  }
  appendLog('Restoring previous engine')
  await rm(runtime.engineDir, { recursive: true, force: true })
  await cp(runtime.backupDir, runtime.engineDir, { recursive: true })
  const restored = await currentVersion(runtime.engineDir)
  setJob({
    busy: false,
    phase: 'rolled-back',
    download: 0,
    install: 0,
    restarting: false,
    rollbackAvailable: true,
    error: null,
  })
  appendLog(`Restored ${restored}`)
  return { ok: true, current: restored }
}

async function restoreOnFailure(error) {
  const message = error instanceof Error ? error.message : String(error)
  appendLog(`FAILED ${message}`)
  try {
    await rollback()
    setJob({
      busy: false,
      phase: 'error',
      error: `${message} — rolled back to the previous engine.`,
      restarting: false,
    })
  } catch (rollbackError) {
    setJob({
      busy: false,
      phase: 'error',
      error: `${message} — rollback failed: ${rollbackError instanceof Error ? rollbackError.message : rollbackError}`,
      restarting: false,
    })
  }
}

async function runUpdate(target) {
  const runtime = await resolveRuntime()
  const current = await currentVersion(runtime.engineDir)
  try {
    await backup(runtime, current)
    await prepareStage(runtime.stageDir)
    const staged = stagedPackageDir(runtime.stageDir)
    const command = buildCommand(target, runtime.stageDir)
    setJob({
      phase: 'seeding',
      download: 4,
      install: 0,
      command,
      message: 'Copying the current engine so unchanged packages are not re-downloaded.',
    })
    appendLog(`Reusing current engine at ${runtime.engineDir}`)
    appendLog('This is not a full npm install — only packages that changed are fetched.')
    await seedEngine(runtime.engineDir, staged)

    setJob({
      phase: 'planning',
      download: 8,
      install: 0,
      message: `Comparing installed packages to ${DSH_PKG}@${target}.`,
    })
    appendLog(`Comparing packages to ${DSH_PKG}@${target}`)
    const registry = createRegistry({
      cacheDir: runtime.cacheDir || resolveCacheDir(),
    })
    const plan = await planUpdate(staged, target, registry, appendLog)
    appendLog(`Reuse ${plan.reused.length} packages. Fetch ${plan.download.length} updated tarballs.`)
    if (!plan.download.length) {
      appendLog('Nothing new to fetch — engine files already match the target tree.')
    }

    setJob({
      phase: 'downloading',
      download: plan.download.length ? 10 : 100,
      install: 0,
      message: plan.download.length
        ? `Downloading ${plan.download.length} updated packages (keeping ${plan.reused.length}).`
        : 'No new tarballs.',
    })
    const applied = await applyPlan(plan, registry, {
      onLog: appendLog,
      onItem: (done, total, item) => {
        const download = Math.min(99, Math.round((100 * done) / Math.max(total, 1)))
        const install = Math.min(96, Math.round((100 * done) / Math.max(total, 1)))
        appendLog(`Fetched ${done}/${total} ${item.name}@${item.version}`)
        setJob({
          phase: done < total ? 'downloading' : 'installing',
          download,
          install,
          message: `Updated ${done}/${total} packages — ${item.name}@${item.version}`,
        })
      },
    })

    if (applied.rebuilt.length) {
      setJob({
        phase: 'rebuilding',
        download: 100,
        install: 90,
        message: `Rebuilding native addons: ${applied.rebuilt.join(', ')}`,
      })
      appendLog(`npm rebuild ${applied.rebuilt.join(' ')}`)
      await run(
        npmCommand(),
        ['rebuild', ...applied.rebuilt, '--omit=dev', '--no-audit', '--no-fund', '--foreground-scripts'],
        180_000,
        (chunk) => {
          const line = String(chunk).trim()
          if (line) appendLog(line.split(/\r?\n/).pop())
        },
        staged,
      )
    }

    const stagedVersion = await currentVersion(staged)
    if (stagedVersion !== target) {
      throw new Error(`staged engine is ${stagedVersion || 'missing'}, expected ${target}`)
    }
    setJob({
      phase: 'installing',
      download: 100,
      install: 92,
      message: 'Replacing the running engine.',
    })
    appendLog(`Replacing ${runtime.engineDir}`)
    await rm(runtime.engineDir, { recursive: true, force: true })
    await cp(staged, runtime.engineDir, { recursive: true })
    setJob({ phase: 'verifying', download: 100, install: 96, message: 'Checking the installed version.' })
    const installed = await currentVersion(runtime.engineDir)
    if (installed !== target) {
      throw new Error(`expected ${target}, engine reports ${installed || 'unknown'}`)
    }
    appendLog(`Installed ${installed}`)
    if (await ensureGlobalBin(runtime.engineDir)) {
      appendLog('Restored the dsh command on PATH')
    }
    await writeSuccess({ from: current, to: installed })
    await rm(runtime.stageDir, { recursive: true, force: true })
    if (runtime.restartKind === 'exit') {
      setJob({
        busy: false,
        phase: 'restarting',
        download: 100,
        install: 100,
        restarting: true,
        error: null,
        message: 'Engine installed. Harness is restarting.',
      })
      scheduleRestart()
      return
    }
    setJob({
      busy: false,
      phase: 'done',
      download: 100,
      install: 100,
      restarting: false,
      error: null,
      message: 'Quit DSH and start it again to load the new engine.',
    })
    appendLog('Quit DSH and start it again to load the new engine.')
  } catch (error) {
    await restoreOnFailure(error)
  }
}

export async function startUpdate(options = {}) {
  if (process.env.DSH_UPDATE === '0') {
    throw new Error('Updates locked (DSH_UPDATE=0)')
  }
  if (job.busy) return toSnapshot()
  const runtime = await resolveRuntime()
  const detected = { ...runtime, writable: await writable(runtime.engineDir) }
  if (!(detected.writable)) {
    throw new Error(`DSH is not writable at ${runtime.engineDir}`)
  }
  const current = await currentVersion(runtime.engineDir)
  const cached = await distTags(true)
  if (!cached.tags) throw new Error(cached.error || 'Could not read npm dist-tags')
  const version = options.version
    ? allowedTarget(options.version, cached.tags)
    : pickTarget(cached.tags, current)
  if (version && cmpVersion(version, current) <= 0) {
    return toSnapshot({
      current,
      latest: parseVersion(cached.tags.latest),
      next: parseVersion(cached.tags.next),
      target: null,
      update: false,
      writable: true,
      persist: runtime.persist,
      locked: false,
      restartKind: runtime.restartKind,
      mode: detected,
      modes: modeCatalog(detected),
      command: [],
      notes: notesCache.notes,
      error: null,
      hint: 'Already up to date.',
    })
  }
  if (!version) {
    return toSnapshot({
      current,
      latest: parseVersion(cached.tags.latest),
      next: parseVersion(cached.tags.next),
      target: null,
      update: false,
      writable: true,
      persist: runtime.persist,
      locked: false,
      restartKind: runtime.restartKind,
      mode: detected,
      modes: modeCatalog(detected),
      command: [],
      notes: notesCache.notes,
      error: null,
      hint: 'Already up to date.',
    })
  }
  const command = buildCommand(version, runtime.stageDir)
  if (options.confirm !== true) {
    const notes = await releaseNotes(version)
    setJob({
      busy: false,
      phase: 'confirm',
      from: current,
      to: version,
      command,
      logs: [],
      error: null,
      restarting: false,
    })
    return toSnapshot({
      current,
      latest: parseVersion(cached.tags.latest),
      next: parseVersion(cached.tags.next),
      target: version,
      update: true,
      writable: true,
      persist: runtime.persist,
      locked: false,
      restartKind: runtime.restartKind,
      mode: detected,
      modes: modeCatalog(detected),
      command,
      notes,
      error: null,
      hint: `Confirm ${DSH_PKG}@${version}. Incremental tarballs, no sudo, no full npm install.`,
    }, { phase: 'confirm' })
  }
  resetJob({
    busy: true,
    phase: 'backing-up',
    from: current,
    to: version,
    command,
    logs: [`Start ${current} → ${version}`],
  })
  runUpdate(version)
  return toSnapshot()
}

export function scheduleRestart(exitFn = process.exit, delayMs = 2200) {
  setTimeout(() => exitFn(0), delayMs)
}

export function toSnapshot(st, extras = {}) {
  const base = st || {
    current: job.from,
    latest: job.to,
    next: job.to,
    target: job.to,
    update: !job.restarting && job.phase !== 'done',
    writable: true,
    persist: process.env.DSH_ENGINE_PERSIST === '1',
    locked: process.env.DSH_UPDATE === '0',
    restartKind: shouldExitToRestart() ? 'exit' : 'manual',
    mode: detectMode(),
    modes: modeCatalog(detectMode()),
    command: job.command,
    notes: extras.notes || notesCache.notes,
    error: job.error,
    hint: job.error || job.phase,
  }
  const phase = extras.phase
    || (job.busy || job.restarting || job.phase === 'confirm' || job.phase === 'done' || job.phase === 'success' ? job.phase : null)
    || (base.error && !base.update ? 'error' : 'idle')
  const success = extras.success || null
  return {
    phase,
    current: base.current,
    latest: base.target || base.next || base.latest || base.current,
    target: phase === 'success' ? (success && success.to) || base.current : (base.target || job.to),
    updateAvailable: phase === 'success' ? false : base.update === true,
    successFrom: success && success.from ? success.from : null,
    successTo: success && success.to ? success.to : null,
    pendingRestart: job.restarting === true || extras.pendingRestart === true || phase === 'done',
    installed: extras.installed || (job.restarting ? job.to : null),
    error: extras.error || job.error || base.error || null,
    detail: extras.detail || job.message || base.hint || '',
    checkedAt: now(),
    download: job.download,
    install: job.install,
    logs: job.logs,
    command: base.command || job.command || [],
    mode: base.mode || detectMode(),
    modes: base.modes || modeCatalog(detectMode()),
    notes: extras.notes !== undefined ? extras.notes : base.notes,
    persist: base.persist === true,
    writable: base.writable === true,
    locked: base.locked === true,
    restartKind: base.restartKind || (shouldExitToRestart() ? 'exit' : 'manual'),
    engineDir: (base.mode && base.mode.engineDir) || job.engineDir || null,
    rollbackAvailable: job.rollbackAvailable === true,
    community: true,
    tagline: 'One-click updates for DeepSeek Harness, like Codex.',
    disclaimer: 'Community plugin — not official DeepSeek software.',
  }
}
