#!/usr/bin/env node
// Seed-less local demo: no Docker, no npm -g. Prints a fake update snapshot.

import {
  buildCommand,
  detectMode,
  modeCatalog,
  parseNpmProgress,
  pickTarget,
  resetJob,
  toSnapshot,
} from '../lib/engine.js'

const tags = { next: '0.1.0-rc.8', latest: '0.1.0-rc.7' }
const current = '0.1.0-rc.7'
const target = pickTarget(tags, current)
resetJob({
  busy: true,
  phase: 'downloading',
  from: current,
  to: target,
  command: buildCommand(target),
  download: 42,
  install: 0,
  logs: [
    'Start 0.1.0-rc.7 → 0.1.0-rc.8',
    'Backup 0.1.0-rc.7',
    'npm http fetch GET 200 …/dsh-0.1.0-rc.8.tgz',
  ],
})
const progress = parseNpmProgress('reify:extract: @deepseek-ai/dsh', { download: 42, install: 0 })
const snap = toSnapshot({
  current,
  latest: tags.latest,
  next: tags.next,
  target,
  update: true,
  writable: true,
  persist: true,
  locked: false,
  mode: detectMode({ DSH_ENGINE_PERSIST: '1' }),
  modes: modeCatalog(detectMode({ DSH_ENGINE_PERSIST: '1' })),
  command: buildCommand(target),
  notes: {
    version: target,
    title: `${target}`,
    body: 'Demo notes. Real checks use GitHub releases, then npm description.',
    source: 'demo',
  },
  error: null,
  hint: 'demo',
}, { phase: 'downloading' })

console.log(JSON.stringify({
  tagline: snap.tagline,
  disclaimer: snap.disclaimer,
  current,
  target,
  command: snap.command,
  progress,
  modes: snap.modes.map((mode) => `${mode.active ? '*' : ' '} ${mode.id}`),
}, null, 2))
