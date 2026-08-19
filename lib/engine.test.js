import test from 'node:test'
import assert from 'node:assert/strict'
import {
  allowedTarget,
  buildCommand,
  cmpVersion,
  detectMode,
  modeCatalog,
  parseNpmProgress,
  parseVersion,
  pickTarget,
  resetJob,
  scheduleRestart,
  toSnapshot,
} from './engine.js'

test('parseVersion accepts rc pins', () => {
  assert.equal(parseVersion('0.1.0-rc.8'), '0.1.0-rc.8')
  assert.equal(parseVersion(' 0.1.0 '), '0.1.0')
  assert.equal(parseVersion('latest'), null)
  assert.equal(parseVersion('$(reboot)'), null)
})

test('pickTarget prefers next over latest when newer', () => {
  assert.equal(cmpVersion('0.1.0-rc.8', '0.1.0-rc.7'), 1)
  assert.equal(pickTarget({ next: '0.1.0-rc.8', latest: '0.1.0-rc.7' }, '0.1.0-rc.7'), '0.1.0-rc.8')
  assert.equal(pickTarget({ next: '0.1.0-rc.7', latest: '0.1.0-rc.7' }, '0.1.0-rc.7'), null)
  assert.equal(pickTarget({ latest: '0.2.0' }, '0.1.0-rc.7'), '0.2.0')
  assert.equal(pickTarget({ next: '0.1.0-rc.8', latest: '0.1.0-rc.7' }, '0.1.0-rc.8'), null)
})

test('toSnapshot success phase is not an update offer', () => {
  resetJob()
  const snap = toSnapshot({
    current: '0.1.0-rc.8',
    latest: '0.1.0-rc.7',
    next: '0.1.0-rc.8',
    target: null,
    update: false,
    writable: true,
    persist: true,
    locked: false,
    mode: detectMode({}),
    modes: modeCatalog(detectMode({})),
    command: [],
    notes: null,
    error: null,
    hint: 'Updated 0.1.0-rc.7 → 0.1.0-rc.8.',
  }, { phase: 'success', success: { from: '0.1.0-rc.7', to: '0.1.0-rc.8' } })
  assert.equal(snap.phase, 'success')
  assert.equal(snap.updateAvailable, false)
  assert.equal(snap.successFrom, '0.1.0-rc.7')
  assert.equal(snap.successTo, '0.1.0-rc.8')
})

test('allowedTarget only accepts published tags', () => {
  const tags = { next: '0.1.0-rc.8', latest: '0.1.0-rc.7' }
  assert.equal(allowedTarget('0.1.0-rc.8', tags), '0.1.0-rc.8')
  assert.equal(allowedTarget('0.1.0-rc.7', tags), '0.1.0-rc.7')
  assert.equal(allowedTarget('9.9.9', tags), null)
  assert.equal(allowedTarget('$(id)', tags), null)
})

test('buildCommand is incremental tarballs and never sudo or npm -g', () => {
  const cmd = buildCommand('0.1.0-rc.8')
  assert.equal(cmd[0], 'incremental-tarballs')
  assert.ok(cmd.includes('--reuse-engine'))
  assert.ok(!cmd.includes('-g'))
  assert.ok(!cmd.includes('install'))
  assert.ok(cmd.includes('@deepseek-ai/dsh@0.1.0-rc.8'))
  assert.ok(!cmd.some((part) => /sudo|su\b|curl|bash/.test(part)))
})

test('detectMode defaults to npm-global and honors lock', () => {
  const detected = detectMode({ DSH_ENGINE_PERSIST: '1', DSH_UPDATE: '0' })
  assert.equal(detected.active, 'npm-global')
  assert.equal(detected.persist, true)
  assert.equal(detected.locked, true)
  assert.equal(detectMode({ DSH_UPDATE_MODE: 'npx' }).active, 'npx')
})

test('modeCatalog enables only the running kind', () => {
  const idle = modeCatalog(detectMode({}))
  assert.equal(idle.find((mode) => mode.id === 'npx').recommended, true)
  assert.equal(idle.find((mode) => mode.id === 'npx').available, false)
  assert.equal(idle.find((mode) => mode.id === 'npm-global').available, true)
  assert.equal(idle.find((mode) => mode.id === 'source').available, false)
})

test('parseNpmProgress climbs download then install', () => {
  let progress = { download: 0, install: 0 }
  progress = parseNpmProgress('Fetched 2/8 @deepseek-ai/dsh-tools@0.1.0-rc.8', progress)
  assert.equal(progress.download, 25)
  assert.equal(progress.install, 0)
  progress = parseNpmProgress('Extracted 4/8 @deepseek-ai/dsh-tools@0.1.0-rc.8', progress)
  assert.equal(progress.download, 100)
  assert.equal(progress.install, 50)
  progress = parseNpmProgress('added 12 packages', progress)
  assert.ok(progress.install >= 72)
})

test('toSnapshot marks the plugin as community', () => {
  resetJob()
  const snap = toSnapshot({
    current: '0.1.0-rc.7',
    latest: '0.1.0-rc.7',
    next: '0.1.0-rc.8',
    target: '0.1.0-rc.8',
    update: true,
    writable: true,
    persist: true,
    locked: false,
    mode: detectMode({}),
    modes: modeCatalog(detectMode({})),
    command: buildCommand('0.1.0-rc.8'),
    notes: null,
    error: null,
    hint: 'go',
  })
  assert.equal(snap.community, true)
  assert.match(snap.disclaimer, /not official/i)
  assert.equal(snap.target, '0.1.0-rc.8')
})

test('scheduleRestart calls exit after the delay', async () => {
  let code = null
  scheduleRestart((n) => {
    code = n
  }, 5)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(code, 0)
})
