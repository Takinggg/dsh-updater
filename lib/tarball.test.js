import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import {
  encodePkg,
  extractTgzNode,
  fetchRegistryJson,
  installDir,
  isWorkspacePkg,
  planUpdate,
  registryHeaders,
  resolveRange,
} from './tarball.js'

function tarHeader(name, size, type = '0') {
  const buf = Buffer.alloc(512)
  Buffer.from(name).copy(buf, 0)
  buf.write('0000644\0', 100, 8, 'utf8')
  buf.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'utf8')
  buf[156] = type.charCodeAt(0)
  buf.write('ustar\0', 257, 6, 'utf8')
  buf.write('00', 263, 2, 'utf8')
  buf.write('        ', 148, 8, 'utf8')
  let sum = 0
  for (let i = 0; i < 512; i += 1) sum += buf[i]
  buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8')
  return buf
}

function makeTar(files) {
  const parts = []
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content)
    parts.push(tarHeader(name, data.length))
    parts.push(data)
    const pad = (512 - (data.length % 512)) % 512
    if (pad) parts.push(Buffer.alloc(pad))
  }
  parts.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(parts))
}

test('registry JSON accept avoids 406 on version URLs', async () => {
  assert.equal(registryHeaders({}).Accept, 'application/json')
  const calls = []
  const doc = await fetchRegistryJson('https://registry.npmjs.org/@deepseek-ai%2fdsh/0.1.0-rc.8', {}, async (_url, _env, extra) => {
    calls.push(extra)
    if (calls.length === 1) return { ok: false, status: 406 }
    return { ok: true, json: async () => ({ version: '0.1.0-rc.8', dist: { tarball: 'https://example.test/dsh.tgz' } }) }
  })
  assert.equal(doc.version, '0.1.0-rc.8')
  assert.equal(calls.length, 2)
  assert.equal(calls[1].headers.Accept, '*/*')
})

test('encodePkg and workspace detection', () => {
  assert.equal(encodePkg('@deepseek-ai/dsh'), '@deepseek-ai%2fdsh')
  assert.equal(isWorkspacePkg('@deepseek-ai/dsh-tools'), true)
  assert.equal(isWorkspacePkg('commander'), false)
})

test('resolveRange reads exact and caret pins', () => {
  assert.equal(resolveRange('0.1.0-rc.8'), '0.1.0-rc.8')
  assert.equal(resolveRange('^0.1.0-rc.8'), '0.1.0-rc.8')
  assert.equal(resolveRange('~1.2.3'), '1.2.3')
  assert.equal(resolveRange('latest', { 'dist-tags': { latest: '0.2.0' } }), '0.2.0')
})

test('installDir puts dsh at the seed root', () => {
  assert.equal(installDir('/seed', '@deepseek-ai/dsh'), '/seed')
  assert.match(installDir('/seed', '@deepseek-ai/dsh-tools').replace(/\\/g, '/'), /\/seed\/node_modules\/@deepseek-ai\/dsh-tools$/)
  assert.match(installDir('/seed', 'commander').replace(/\\/g, '/'), /\/seed\/node_modules\/commander$/)
})

test('extractTgzNode strips package/ and rejects traversal', async () => {
  const dest = await mkdtemp(join(tmpdir(), 'dsh-tar-'))
  await extractTgzNode(makeTar({ 'package/hello.txt': 'ok' }), dest)
  assert.equal(await readFile(join(dest, 'hello.txt'), 'utf8'), 'ok')
  await assert.rejects(
    () => extractTgzNode(makeTar({ 'package/../../evil.txt': 'nope' }), dest),
    /unsafe tar path/,
  )
})

test('planUpdate reuses third-party and only queues changed workspace pkgs', async () => {
  const seed = await mkdtemp(join(tmpdir(), 'dsh-seed-'))
  await writeFile(join(seed, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.0-rc.7' }))
  await mkdir(join(seed, 'node_modules', '@deepseek-ai', 'dsh-tools'), { recursive: true })
  await mkdir(join(seed, 'node_modules', 'commander'), { recursive: true })
  await writeFile(join(seed, 'node_modules', '@deepseek-ai', 'dsh-tools', 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-tools',
    version: '0.1.0-rc.7',
  }))
  await writeFile(join(seed, 'node_modules', 'commander', 'package.json'), JSON.stringify({
    name: 'commander',
    version: '12.1.0',
  }))
  const manifests = {
    '@deepseek-ai/dsh': {
      version: '0.1.0-rc.8',
      dist: { tarball: 'https://example.test/dsh.tgz', integrity: '' },
      dependencies: {
        '@deepseek-ai/dsh-tools': '^0.1.0-rc.8',
        commander: '^12.0.0',
      },
    },
    '@deepseek-ai/dsh-tools': {
      version: '0.1.0-rc.8',
      dist: { tarball: 'https://example.test/tools.tgz', integrity: '' },
      dependencies: {},
    },
  }
  const registry = {
    fetchManifest: async (name) => {
      if (!manifests[name]) throw new Error(`missing ${name}`)
      return manifests[name]
    },
  }
  const plan = await planUpdate(seed, '0.1.0-rc.8', registry)
  assert.deepEqual(plan.download.map((item) => item.name).sort(), [
    '@deepseek-ai/dsh',
    '@deepseek-ai/dsh-tools',
  ])
  assert.ok(plan.reused.some((item) => item.name === 'commander' && item.version === '12.1.0'))
})
