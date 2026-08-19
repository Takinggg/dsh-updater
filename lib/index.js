// Community DSH updater host. Job-based so the UI can poll progress.

import { dismissSuccess, releaseNotes, rollback, startUpdate, status as engineStatus } from './engine.js'

export const name = 'dsh-updater'
export const inject = ['connection']

const CHANNEL = '/dsh-update'

function ok(value) {
  return { ok: true, value }
}

function failure(error) {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

function bad(message) {
  return { ok: false, error: { code: 'bad-request', message, details: { issues: [] } } }
}

function payloadOf(payload) {
  if (!payload || typeof payload !== 'object') return {}
  return payload
}

export function apply(ctx) {
  ctx.inject(['connection'], (wired) => {
    const connection = wired.get('connection')
    wired.effect(
      () => connection.rpc.handle(
        CHANNEL,
        async (endpoint, payload) => {
          try {
            const body = payloadOf(payload)
            switch (endpoint) {
              case 'status':
                return ok(await engineStatus())
              case 'check':
                return ok(await engineStatus({ force: true, notes: true }))
              case 'notes':
                return ok(await releaseNotes(body.version) || { body: '', source: 'none' })
              case 'update':
                return ok(await startUpdate({
                  confirm: body.confirm === true,
                  version: body.version,
                }))
              case 'rollback':
                await rollback()
                return ok(await engineStatus())
              case 'dismiss':
                return ok(await dismissSuccess())
              default:
                return bad(`unknown endpoint ${endpoint}`)
            }
          } catch (error) {
            return failure(error)
          }
        },
        { authority: 'trusted-host' },
      ),
      'dsh-updater: /dsh-update rpc',
    )
  })
}
