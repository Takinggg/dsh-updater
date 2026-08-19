import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  cacheDir,
  detectInstallKind,
  npmGlobalBinPath,
  npmPrefixFromEngine,
  findPackageRoot,
  modeCatalog,
  npmCommand,
  npmTimeoutMs,
  posix,
  shouldExitToRestart,
  stageDir,
} from './resolve.js'

test('posix normalizes windows paths', () => {
  assert.equal(posix('C:\\Users\\a\\npm\\node_modules\\@deepseek-ai\\dsh'), 'C:/Users/a/npm/node_modules/@deepseek-ai/dsh')
})

test('stageDir lives under DSH_HOME not tmpfs', () => {
  const dir = stageDir({ DSH_HOME: '/home/node/.dsh' })
  assert.match(posix(dir), /\/home\/node\/\.dsh\/update-stage$/)
  assert.equal(npmTimeoutMs({}), 12 * 60_000)
  assert.equal(npmTimeoutMs({ DSH_UPDATE_TIMEOUT_MS: '900000' }), 900_000)
  assert.match(posix(cacheDir({ DSH_HOME: '/home/node/.dsh' })), /\/home\/node\/\.dsh\/update-cache$/)
})

test('npmPrefixFromEngine finds /usr/local and Windows npm prefix', () => {
  assert.equal(npmPrefixFromEngine('/usr/local/lib/node_modules/@deepseek-ai/dsh'), '/usr/local')
  assert.match(posix(npmGlobalBinPath('/usr/local/lib/node_modules/@deepseek-ai/dsh', 'linux')), /\/usr\/local\/bin\/dsh$/)
  assert.match(
    posix(npmPrefixFromEngine('C:/Users/u/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh')),
    /\/npm$/,
  )
})

test('npmCommand is npm.cmd on win32', () => {
  assert.equal(npmCommand('win32'), 'npm.cmd')
  assert.equal(npmCommand('linux'), 'npm')
})

test('detectInstallKind reads npx / pnpm / yarn / global / local', () => {
  assert.equal(detectInstallKind('/home/u/.npm/_npx/123/node_modules/@deepseek-ai/dsh'), 'npx')
  assert.equal(detectInstallKind('/home/u/.local/share/pnpm/global/5/.pnpm/@deepseek-ai+dsh@0.1.0-rc.7/node_modules/@deepseek-ai/dsh'), 'pnpm')
  assert.equal(detectInstallKind('/home/u/.yarn/global/node_modules/@deepseek-ai/dsh'), 'yarn')
  assert.equal(detectInstallKind('/usr/local/lib/node_modules/@deepseek-ai/dsh'), 'npm-global')
  assert.equal(detectInstallKind('/home/u/.nvm/versions/node/v22.11.0/lib/node_modules/@deepseek-ai/dsh'), 'npm-global')
  assert.equal(detectInstallKind('C:/Users/u/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh'), 'npm-global')
  assert.equal(detectInstallKind('/Users/u/code/app/node_modules/@deepseek-ai/dsh'), 'local')
})

test('shouldExitToRestart only in docker / persist / pid 1', () => {
  assert.equal(shouldExitToRestart({ DSH_UPDATE_RESTART: '0' }, { docker: true, pid: 1 }), false)
  assert.equal(shouldExitToRestart({ DSH_ENGINE_PERSIST: '1' }, { docker: false }), true)
  assert.equal(shouldExitToRestart({}, { docker: false, pid: 88 }), false)
  assert.equal(shouldExitToRestart({}, { docker: true }), true)
  assert.equal(shouldExitToRestart({}, { pid: 1, docker: false }), true)
})

test('findPackageRoot walks up to @deepseek-ai/dsh', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-upd-'))
  const pkg = join(root, 'dsh')
  await mkdir(join(pkg, 'lib'), { recursive: true })
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.0-rc.7' }))
  assert.equal(await findPackageRoot(join(pkg, 'lib', 'bin.js')), pkg)
  assert.equal(await findPackageRoot(join(root, 'other')), null)
})

test('modeCatalog enables only the running kind', () => {
  const npx = modeCatalog({ active: 'npx', writable: true }).find((m) => m.id === 'npx')
  const npm = modeCatalog({ active: 'npx', writable: true }).find((m) => m.id === 'npm-global')
  assert.equal(npx.available, true)
  assert.equal(npm.available, false)
  assert.equal(modeCatalog({ active: 'npm-global', writable: false }).find((m) => m.id === 'npm-global').available, false)
})
