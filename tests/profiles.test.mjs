import test from 'node:test'
import assert from 'node:assert/strict'
import { applyRouterAssist, jspaceAssistKernel } from '../lib/profiles.js'

test('jspace assist preserves optional lite and legacy modes without dynamic ledger', () => {
  assert.equal(jspaceAssistKernel('off'), '')
  assert.match(jspaceAssistKernel('lite'), /confidence in execution, not certainty of belief/i)
  const legacy = jspaceAssistKernel('legacy')
  assert.match(legacy, /Goal, Core, Verified, Open, Next/)
  assert.match(legacy, /epistemic confidence/i)
  assert.ok(legacy.length < 1200)
})

test('router assist is explicitly optional and first-request-only', () => {
  const assembled = {
    sections: [
      { name: 'identity', text: 'official' },
      { name: 'persona', text: 'official persona' },
      { name: 'plan-mode', text: 'plan' },
    ],
    tools: [
      { name: 'bash' }, { name: 'read' }, { name: 'write' }, { name: 'edit' }, { name: 'str_replace_editor' }, { name: 'web_search' },
    ],
  }
  const untouched = applyRouterAssist(assembled, 'inspect', 'off', false)
  assert.equal(untouched.changed, false)
  assert.equal(untouched.tools.length, assembled.tools.length)

  const minimal = applyRouterAssist(assembled, 'inspect', 'minimal-first', false)
  assert.equal(minimal.changed, true)
  assert.deepEqual(minimal.tools.map(x => x.name).sort(), ['bash', 'str_replace_editor'])
  assert.ok(minimal.sections.some(x => x.name === 'plan-mode'))
  assert.ok(minimal.sections.some(x => /helpful software engineer/.test(x.text)))

  const promoted = applyRouterAssist(assembled, 'inspect', 'minimal-first', true)
  assert.equal(promoted.changed, false)
  assert.equal(promoted.tools.length, assembled.tools.length)
})

test('task-aware router assist follows governor route rather than build/fix persona labels', () => {
  const assembled = {
    sections: [{ name: 'persona', text: 'official' }, { name: 'runtime', text: 'keep' }],
    tools: [{ name: 'bash' }, { name: 'read' }, { name: 'write' }, { name: 'edit' }, { name: 'glob' }, { name: 'grep' }, { name: 'web_search' }],
  }
  const plan = applyRouterAssist(assembled, 'plan', 'task-aware', false)
  assert.match(plan.sections.at(-1).text, /systems software engineer/i)
  assert.ok(plan.tools.some(x => x.name === 'read'))
  assert.ok(!plan.tools.some(x => x.name === 'write'))
})

import {
  NATIVE_CANONICAL_PERSONA,
  applyNativeCanonicalProfile,
  observeRequestProtocol,
} from '../lib/profiles.js'

test('native-canonical mode pins exact persona and bash-read prefix without removing tools', () => {
  const bash = { name: 'bash', description: 'shell', parameters: { command: { type: 'string' } } }
  const read = { name: 'read', description: 'read', parameters: { path: { type: 'string' } } }
  const edit = { name: 'edit' }
  const status = { name: 'coursekeeper_status' }
  const assembled = {
    sections: [
      { name: 'runtime', text: 'runtime policy', order: 5 },
      { name: 'persona', text: 'custom persona', order: 10 },
    ],
    tools: [status, read, edit, bash],
  }
  const result = applyNativeCanonicalProfile(assembled)
  assert.equal(result.sections[0].text, NATIVE_CANONICAL_PERSONA)
  assert.equal(result.sections.filter(x => /persona/i.test(x.name)).length, 1)
  assert.deepEqual(result.tools.map(x => x.name), ['bash', 'read', 'edit', 'coursekeeper_status'])
  assert.equal(result.tools.length, assembled.tools.length)
  assert.equal(result.tools.find(x => x.name === 'bash'), bash)
  assert.equal(result.tools.find(x => x.name === 'read'), read)
  assert.equal(result.personaExact, true)
  assert.equal(result.personaFirst, true)
  assert.equal(result.toolPrefixMatch, true)
  assert.equal(result.auxiliaryToolsAtEnd, true)
  assert.deepEqual(result.deviations, [])
})

test('native-canonical mode reports missing candidate canonical tools rather than fabricating them', () => {
  const result = applyNativeCanonicalProfile({
    sections: [{ name: 'persona', text: 'other' }],
    tools: [{ name: 'read' }, { name: 'edit' }],
  })
  assert.equal(result.personaExact, true)
  assert.equal(result.toolPrefixMatch, false)
  assert.ok(result.deviations.includes('missing-tool:bash'))
  assert.ok(!result.tools.some(x => x.name === 'bash'))
})

test('protocol observation distinguishes retained reasoning and linked native tool results structurally', () => {
  const observed = observeRequestProtocol([
    { role: 'assistant', content: [{ type: 'reasoning', text: 'inspect parser first' }] },
    { role: 'tool', source: { callId: 'c1' }, content: [{ type: 'tool-result', source: { callId: 'c1' }, content: [{ type: 'text', text: 'output' }] }] },
  ])
  assert.equal(observed.reasoningRetention, 'observed')
  assert.equal(observed.nativeObservationSemantics, 'observed')
  assert.equal(observed.reasoningBlocks, 1)
  assert.equal(observed.toolResultBlocks, 1)
  assert.equal(observed.linkedToolResults, 1)

  const lossy = observeRequestProtocol([
    { role: 'user', content: [{ type: 'text', text: 'command output: ok' }] },
  ])
  assert.equal(lossy.reasoningRetention, 'not-applicable')
  assert.equal(lossy.nativeObservationSemantics, 'not-applicable')
})
