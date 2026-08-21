import test from 'node:test'
import assert from 'node:assert/strict'
import { createGovernorState, acceptHumanTask } from '../lib/state.js'
import { buildEvidencePacket, parseSemanticVerifierResult, verifierPrompt } from '../lib/verifier.js'

test('independent verifier receives an evidence packet, not the main reasoning narrative', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Analyze src/core.ts', 1)
  const packet = buildEvidencePacket(state)
  assert.ok(packet)
  assert.equal(packet.objective, 'Analyze src/core.ts')
  const prompt = verifierPrompt(packet)
  assert.match(prompt, /Do not continue the main reasoning narrative/)
  assert.match(prompt, /evidence packet/)
})

test('semantic verifier result distinguishes patch from fail_route', () => {
  const patch = parseSemanticVerifierResult(JSON.stringify({decision:'patch',failedObligations:[],contradictions:['H wrong'],nextEvidence:['read B'],patchedHypothesis:'B is responsible',reason:'route inspect remains valid'}))
  assert.equal(patch.decision, 'patch')
  assert.equal(patch.patchedHypothesis, 'B is responsible')
  const fail = parseSemanticVerifierResult(JSON.stringify({decision:'fail_route',failedObligations:[],contradictions:[],nextEvidence:['design new artifact'],reason:'no current artifact exists'}))
  assert.equal(fail.decision, 'fail_route')
})

import { applySemanticVerifierResult, shouldRequireSemanticVerification } from '../lib/verifier.js'
import { completionBlockers } from '../lib/state.js'

test('risk semantic verifier is required for PLAN/EXPLORE and blocks completion until pass', () => {
  const state = createGovernorState()
  const opts = { semanticVerifierMode: 'risk' }
  acceptHumanTask(state, '研究一个未知机制并设计跨模块实验和完整验证', 1, false, opts)
  assert.equal(shouldRequireSemanticVerification(state, 'risk'), true)
  assert.equal(state.episode.semanticVerification.required, true)
  assert.ok(completionBlockers(state, opts).some(x => x.includes('Independent semantic verification')))
  state.episode.acceptance.forEach(x => { x.status = 'satisfied' })
  state.episode.route.explicit = true
  const result = applySemanticVerifierResult(state, {
    decision: 'pass', failedObligations: [], contradictions: [], nextEvidence: [], reason: 'evidence supports the bounded claim',
  })
  assert.equal(result.rerouteAllowed, false)
  assert.equal(state.episode.semanticVerification.status, 'passed')
  assert.equal(state.episode.semanticVerification.verifiedWorkspaceRevision, state.workspace.revision)
})

test('semantic PATCH preserves route while replacing hypothesis; FAIL_ROUTE releases hysteresis', () => {
  const state = createGovernorState()
  const opts = { semanticVerifierMode: 'always' }
  acceptHumanTask(state, '研究未知机制并设计实验', 1, false, opts)
  state.episode.route.explicit = true
  state.episode.route.hypothesis = 'A causes effect'
  const route = state.episode.route.route
  const patched = applySemanticVerifierResult(state, {
    decision: 'patch', failedObligations: [], contradictions: ['A contradicted'], nextEvidence: ['inspect B'], patchedHypothesis: 'B causes effect', reason: 'same exploration route remains valid',
  })
  assert.equal(patched.rerouteAllowed, false)
  assert.equal(state.episode.route.route, route)
  assert.equal(state.episode.route.hypothesis, 'B causes effect')
  const failed = applySemanticVerifierResult(state, {
    decision: 'fail_route', failedObligations: [], contradictions: ['no existing artifact'], nextEvidence: ['design new artifact'], reason: 'inspect route is inappropriate',
  })
  assert.equal(failed.rerouteAllowed, true)
  assert.equal(state.episode.route.epistemic, 'contradicted')
})

test('parser tolerates markdown fences and surrounding prose', () => {
  const passJson = JSON.stringify({ decision: 'pass', failedObligations: [], contradictions: [], nextEvidence: [], reason: 'ok' })
  const fenced = parseSemanticVerifierResult(['```json', passJson, '```'].join(String.fromCharCode(10)))
  assert.equal(fenced.decision, 'pass')
  const wrapped = parseSemanticVerifierResult('independent check: {"decision":"warn","failedObligations":[],"contradictions":[],"nextEvidence":["rerun"],"reason":"weak"}')
  assert.equal(wrapped.decision, 'warn')
  assert.equal(wrapped.nextEvidence[0], 'rerun')
  assert.equal(parseSemanticVerifierResult(''), undefined)
})
