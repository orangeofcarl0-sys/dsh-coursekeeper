import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SessionModeStore } from '../lib/session-mode-store.js'

test('session mode store persists latest mode per session and reloads', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ck-mode-'))
  const path = join(dir, 'session-modes.jsonl')
  const store = new SessionModeStore({ enabled: true, path, maxInMemory: 100 })
  store.set('s1', 'active')
  store.set('s2', 'shadow')
  store.set('s1', 'off')
  await store.close()

  const reloaded = new SessionModeStore({ enabled: true, path, maxInMemory: 100 })
  await reloaded.ready()
  assert.equal(reloaded.get('s1'), 'off')
  assert.equal(reloaded.get('s2'), 'shadow')
  assert.equal(reloaded.get('missing'), undefined)

  await rm(dir, { recursive: true, force: true })
})
import { registerSessionHandle, getSessionHandle, unregisterSessionHandle } from '../lib/runtime-registry.js'

test('runtime registry registers, reads, and unregisters session handles', () => {
  const handle = { getMode: () => 'active', setMode: () => {}, getStatus: () => ({ ok: true }) }
  registerSessionHandle('s-test', handle)
  assert.equal(getSessionHandle('s-test'), handle)
  unregisterSessionHandle('s-test')
  assert.equal(getSessionHandle('s-test'), undefined)
})
