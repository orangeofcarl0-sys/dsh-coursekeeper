import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  buildTaskSignature,
  simHash64,
  hammingSimilarity64,
  taskSimilarity,
  ageWeight,
  domainWeight,
  decideAdaptiveRoute,
  deterministicRoutePrior,
  bayesianCalibration,
  calibratedEscalationThresholds,
  suggestEscalation,
  routeSignalsFromState,
  ExperienceStore,
  parseRouteChallenge,
} from '../lib/adaptive/index.js'
import {
  classifyTaskContract,
  routeContractForRoute,
} from '../lib/core.js'
import {
  createGovernorState,
  acceptHumanTask,
  applyAdaptiveInitialRoute,
} from '../lib/state.js'

const domain = {
  providerFamily: 'deepseek',
  modelFamily: 'pro',
  modelRevision: 'r1',
  augmentationProfile: 'governor',
  harnessVersion: 'rc7',
  policySchemaVersion: 'coursekeeper-adaptive-v1',
}

const defaultOptions = {
  mode: 'active',
  memoryTopK: 8,
  memoryMinSimilarity: 0.60,
  halfLifeDays: 90,
  priorStrength: 6,
  memoryWeight: 0.10,
  bayesianWeight: 0.10,
  maxAdjustment: 0.15,
  minEffectiveSupport: 3,
  marginThreshold: 0.08,
  safeExplorationRate: 0,
  explorationSample: 1,
  crossProfileWeight: 0.25,
  crossModelWeight: 0,
  stalePolicyWeight: 0.5,
}

function borderlineFixContract(objective = 'Fix the existing parser and serializer interaction.') {
  return {
    objective,
    relation: 'new',
    kind: 'fix',
    complexity: 0.55,
    risk: 'low',
    artifacts: ['src/parser.ts'],
    acceptanceHints: [],
    evidencePolicy: [],
    vector: {
      uncertainty: 0.30,
      horizon: 0.50,
      coupling: 0.50,
      observability: 0.60,
      risk: 0.30,
      novelty: 0.40,
    },
  }
}

function experience(task, { id, routeSignals, initialRoute = 'inspect', finalRoute = 'plan', transitions = [], completion = 'success', at = new Date().toISOString(), experienceDomain = domain, externalFailure = false, verifierDecision } = {}) {
  return {
    schemaVersion: 1,
    id: id ?? Math.random().toString(36).slice(2),
    at,
    domain: experienceDomain,
    task,
    initialRoute,
    finalRoute,
    transitions,
    completion,
    ...(verifierDecision ? { verifierDecision } : {}),
    obligations: { acceptanceCleared: completion === 'success', verificationCleared: completion === 'success', benchmarkCleared: true },
    metrics: { requests: 2, steps: 2, toolCalls: 2, evidenceActions: 2, verifierCalls: 0, routeChallenges: 0, reroutes: transitions.length, recoveries: 0 },
    routeSignals: routeSignals ?? {},
    externalFailure,
  }
}

test('TaskSignature is privacy-minimized and Chinese SimHash is deterministic', () => {
  const contract = classifyTaskContract('继续分析 src/router.ts 的路由回归问题，并检查缓存命中。')
  const sig = buildTaskSignature(contract, ['src/router.ts'])
  assert.equal('objective' in sig, false)
  assert.match(sig.objectiveHash, /^[0-9a-f]{64}$/)
  assert.match(sig.objectiveSimHash, /^[0-9a-f]{16}$/)
  assert.equal(simHash64(contract.objective), simHash64(contract.objective))
  const near = simHash64('继续分析 src/router.ts 的路由回归问题并检查缓存命中')
  const far = simHash64('创建一个完全不同的网页按钮组件')
  assert.ok(hammingSimilarity64(sig.objectiveSimHash, near) > hammingSimilarity64(sig.objectiveSimHash, far))
})

test('zero experience preserves deterministic v0.6 route in shadow and active modes', () => {
  const contract = borderlineFixContract()
  const sig = buildTaskSignature(contract)
  const prior = deterministicRoutePrior(contract)
  const shadow = decideAdaptiveRoute(contract, sig, domain, [], { ...defaultOptions, mode: 'shadow' })
  const active = decideAdaptiveRoute(contract, sig, domain, [], { ...defaultOptions, mode: 'active' })
  assert.equal(shadow.appliedRoute, prior.preferred)
  assert.equal(active.appliedRoute, prior.preferred)
  assert.equal(active.effectiveSupport, 0)
})

test('one anecdote cannot override deterministic routing', () => {
  const contract = borderlineFixContract()
  const sig = buildTaskSignature(contract)
  const rows = [experience(sig, { id: 'one', routeSignals: { inspect: -1, plan: 0.8 } })]
  const decision = decideAdaptiveRoute(contract, sig, domain, rows, { ...defaultOptions, minEffectiveSupport: 3 })
  assert.equal(decision.appliedRoute, decision.baseRoute)
  assert.ok(decision.effectiveSupport < 3)
})

test('repeated attributable reroutes can calibrate a borderline task toward the successful route', () => {
  const contract = borderlineFixContract()
  const sig = buildTaskSignature(contract)
  const rows = Array.from({ length: 12 }, (_, i) => experience(sig, {
    id: `r${i}`,
    routeSignals: { inspect: -1, plan: 0.8 },
    transitions: [{ from: 'inspect', to: 'plan', reason: 'fail-route', sequence: i + 1, evidenceActions: 2 }],
  }))
  const decision = decideAdaptiveRoute(contract, sig, domain, rows, defaultOptions)
  assert.equal(decision.baseRoute, 'inspect')
  assert.equal(decision.adaptiveRoute, 'plan')
  assert.equal(decision.appliedRoute, 'plan')
  for (const route of decision.eligible) {
    assert.ok(Math.abs(decision.fusedScores[route] - decision.baseScores[route]) <= defaultOptions.maxAdjustment + 1e-12)
  }
})

test('cross-model experience is ignored by default and cross-profile transfer is bounded', () => {
  const contract = borderlineFixContract()
  const sig = buildTaskSignature(contract)
  const otherModel = { ...domain, modelFamily: 'flash' }
  const otherProfile = { ...domain, augmentationProfile: 'jspace-assist' }
  const modelRows = Array.from({ length: 10 }, (_, i) => experience(sig, { id: `m${i}`, experienceDomain: otherModel, routeSignals: { inspect: -1, plan: 1 } }))
  const modelDecision = decideAdaptiveRoute(contract, sig, domain, modelRows, defaultOptions)
  assert.equal(modelDecision.effectiveSupport, 0)
  assert.equal(modelDecision.appliedRoute, modelDecision.baseRoute)

  const profileRows = Array.from({ length: 10 }, (_, i) => experience(sig, { id: `p${i}`, experienceDomain: otherProfile, routeSignals: { inspect: -1, plan: 1 } }))
  const transferred = decideAdaptiveRoute(contract, sig, domain, profileRows, defaultOptions)
  const isolated = decideAdaptiveRoute(contract, sig, domain, profileRows, { ...defaultOptions, crossProfileWeight: 0 })
  assert.ok(transferred.effectiveSupport > 0)
  assert.equal(isolated.effectiveSupport, 0)
})

test('experience decays with age and policy-domain mismatches are discounted', () => {
  assert.ok(Math.abs(ageWeight(new Date(Date.now() - 90 * 86400000).toISOString(), 90) - 0.5) < 0.02)
  assert.equal(domainWeight(domain, { ...domain, modelFamily: 'flash' }, defaultOptions), 0)
  assert.equal(domainWeight(domain, { ...domain, augmentationProfile: 'jspace-assist' }, defaultOptions), 0.25)
  assert.equal(domainWeight(domain, { ...domain, policySchemaVersion: 'old' }, defaultOptions), 0.5)
})

test('Bayesian calibration ignores external infrastructure failures', () => {
  const contract = borderlineFixContract()
  const sig = buildTaskSignature(contract)
  const bad = experience(sig, { id: 'infra', routeSignals: { inspect: -1 }, externalFailure: true })
  const estimates = bayesianCalibration([bad], sig, domain, defaultOptions)
  assert.equal(estimates.inspect.effectiveN, 0)
  assert.equal(estimates.inspect.mean, 0.5)
})

test('calibrated escalation only learns earlier thresholds from repeated inspect failures', () => {
  const contract = borderlineFixContract()
  const sig = { ...buildTaskSignature(contract), coupling: 0.60, uncertainty: 0.62 }
  const rows = Array.from({ length: 10 }, (_, i) => experience(sig, {
    id: `e${i}`,
    transitions: [{ from: 'inspect', to: 'plan', reason: 'fail-route', sequence: 1, evidenceActions: 2 }],
    routeSignals: { inspect: -1, plan: 0.8 },
  }))
  const calibrated = calibratedEscalationThresholds(rows, domain, defaultOptions)
  assert.ok(calibrated.planCoupling < 0.72)
  assert.ok(calibrated.planCoupling >= 0.52)
  assert.ok(calibrated.exploreUncertainty <= 0.75)
})

test('event-driven escalation promotes DIRECT after no progress and INSPECT after discovered coupling', () => {
  const direct = createGovernorState()
  acceptHumanTask(direct, 'Create src/x.ts exporting x.', 1)
  direct.noInformationStreak = 1
  const d = suggestEscalation(direct, [], domain, { ...defaultOptions, noInformationLimit: 3, calibrated: false })
  assert.deepEqual({ from: d.from, to: d.to }, { from: 'direct', to: 'inspect' })

  const inspect = createGovernorState()
  acceptHumanTask(inspect, 'Fix src/a.ts and src/b.ts across their integration boundary.', 1)
  inspect.episode.route = routeContractForRoute(inspect.episode.contract, 'inspect')
  inspect.episode.route.evidenceActions = 1
  inspect.episode.contract.vector.coupling = 0.85
  const p = suggestEscalation(inspect, [], domain, { ...defaultOptions, noInformationLimit: 3, calibrated: false })
  assert.equal(p.to, 'plan')
})

test('supported EXPLORE converges to PLAN instead of being learned as route failure', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Research the unknown interaction across src/a.ts and src/b.ts.', 1)
  state.episode.route = routeContractForRoute(state.episode.contract, 'explore')
  state.episode.route.epistemic = 'supported'
  state.episode.contract.vector.coupling = 0.8
  const suggestion = suggestEscalation(state, [], domain, { ...defaultOptions, noInformationLimit: 3, calibrated: false })
  assert.equal(suggestion.to, 'plan')
  assert.equal(suggestion.reason, 'converged')
})

test('PATCH plus success rewards the route; external failure yields no route signal', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Analyze src/a.ts carefully.', 1)
  state.episode.semanticVerification.decision = 'patch'
  const signals = routeSignalsFromState(state, 'success', false)
  assert.ok((signals[state.episode.route.route] ?? 0) > 0)
  assert.deepEqual(routeSignalsFromState(state, 'blocked', true), {})
})

test('ExperienceStore tolerates corrupt JSONL and persists privacy-minimized experiences', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coursekeeper-exp-'))
  const path = join(dir, 'experiences.jsonl')
  try {
    const contract = borderlineFixContract()
    const sig = buildTaskSignature(contract)
    const row = experience(sig, { id: 'valid', routeSignals: { inspect: 0.5 } })
    await writeFile(path, `${JSON.stringify(row)}\n{not-json}\n`, 'utf8')
    const store = new ExperienceStore({ enabled: true, path, maxInMemory: 16 })
    await store.ready()
    assert.equal(store.values().length, 1)
    assert.equal((await store.status()).invalidLines, 1)
    const next = experience(sig, { id: 'next', routeSignals: { plan: 0.5 } })
    store.append(next)
    await store.close()
    assert.match(await readFile(path, 'utf8'), /"id":"next"/)
    assert.equal('objective' in next.task, false)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('route challenger parser accepts strict eligible JSON and rejects ineligible route', () => {
  const ok = parseRouteChallenge('{"decision":"challenge","route":"plan","reason":"coupling"}', ['inspect', 'plan'])
  assert.equal(ok.route, 'plan')
  assert.equal(parseRouteChallenge('{"decision":"challenge","route":"direct","reason":"cheap"}', ['inspect', 'plan']), undefined)
})

test('adaptive initial routing does not rewrite the original episode route on later human continuation', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Fix src/a.ts.', 1)
  const original = state.episode.initialRoute
  const firstDecision = {
    mode: 'active', bucket: 'x', baseRoute: original, adaptiveRoute: 'plan', appliedRoute: 'plan',
    baseScores: { direct: 0, inspect: 1, plan: 0.9, explore: 0 }, fusedScores: { direct: 0, inspect: 0.8, plan: 1, explore: 0 },
    eligible: ['direct', 'inspect', 'plan', 'explore'], margin: 0.2, effectiveSupport: 5,
    memoryAdjustment: {}, bayesianAdjustment: {}, bayesian: {}, challengerEligible: false, challenged: false, reason: 'test',
  }
  applyAdaptiveInitialRoute(state, firstDecision)
  assert.equal(state.episode.initialRoute, 'plan')
  acceptHumanTask(state, '继续修复这个文件，并检查另一个边界条件。', 2)
  const secondDecision = { ...firstDecision, adaptiveRoute: 'explore', appliedRoute: 'explore' }
  applyAdaptiveInitialRoute(state, secondDecision)
  assert.equal(state.episode.initialRoute, 'plan')
})

test('task similarity combines structured state and SimHash rather than raw prompt storage', () => {
  const a = buildTaskSignature(classifyTaskContract('分析 src/a.ts 的并发回归问题'))
  const b = buildTaskSignature(classifyTaskContract('继续分析 src/a.ts 的并发回归'))
  const c = buildTaskSignature(classifyTaskContract('创建一个 CSS 按钮'))
  assert.ok(taskSimilarity(a, b) > taskSimilarity(a, c))
})

test('durable Coursekeeper control packet restores current adaptive course after process replay', async () => {
  const { rebuildStateFromEvents } = await import('../lib/state.js')
  const events = [
    { type: 'user/message', seq: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Fix src/a.ts.' }], turn: 1 } },
    { type: 'user/message', seq: 2, data: { source: { kind: 'plugin', plugin: 'coursekeeper/policy' }, content: [{ type: 'text', text: '<ck>\nrel=new kind=fix route=plan phase=recover risk=low\ncommit=1/2-4 epistemic=plausible acceptance=1 verify=0\nH=parser boundary mismatch\nK=raw parser output is already correct\nN=inspect parser output\n</ck>' }], turn: 1 } },
  ]
  const state = rebuildStateFromEvents(events)
  assert.equal(state.episode.route.route, 'plan')
  assert.equal(state.episode.route.hypothesis, 'parser boundary mismatch')
  assert.equal(state.episode.route.falsifier, 'raw parser output is already correct')
  assert.equal(state.episode.route.evidenceActions, 1)
  assert.equal(state.episode.route.explicit, true)
})

test('high-risk eligibility cannot be overridden by personal DIRECT preference', () => {
  const contract = {
    ...borderlineFixContract('Deploy a production database migration and security-sensitive refactor.'),
    risk: 'high',
    vector: { uncertainty: 0.2, horizon: 0.7, coupling: 0.7, observability: 0.8, risk: 1, novelty: 0.3 },
  }
  const sig = buildTaskSignature(contract)
  const rows = Array.from({ length: 20 }, (_, i) => experience(sig, { id: `direct-${i}`, initialRoute: 'direct', finalRoute: 'direct', routeSignals: { direct: 1 } }))
  const decision = decideAdaptiveRoute(contract, sig, domain, rows, defaultOptions)
  assert.equal(decision.eligible.includes('direct'), false)
  assert.notEqual(decision.appliedRoute, 'direct')
})

test('safe exploration is explicit, low-risk, bounded, and disabled by default', () => {
  const contract = borderlineFixContract()
  const sig = buildTaskSignature(contract)
  const rows = Array.from({ length: 8 }, (_, i) => experience(sig, {
    id: `x${i}`,
    routeSignals: { inspect: -1, plan: 0.8 },
    transitions: [{ from: 'inspect', to: 'plan', reason: 'fail-route', sequence: 1, evidenceActions: 2 }],
  }))
  const normal = decideAdaptiveRoute(contract, sig, domain, rows, { ...defaultOptions, safeExplorationRate: 0, explorationSample: 0 })
  const exploratory = decideAdaptiveRoute(contract, sig, domain, rows, { ...defaultOptions, safeExplorationRate: 1, explorationSample: 0 })
  assert.equal(normal.appliedRoute, normal.adaptiveRoute)
  assert.notEqual(exploratory.appliedRoute, exploratory.adaptiveRoute)
  assert.ok(exploratory.eligible.includes(exploratory.appliedRoute))
})

test('ExperienceStore preserves an early in-process append while historical load is racing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coursekeeper-race-'))
  const path = join(dir, 'experiences.jsonl')
  try {
    const sig = buildTaskSignature(borderlineFixContract())
    const old = experience(sig, { id: 'old', routeSignals: { inspect: 0.5 } })
    const current = experience(sig, { id: 'current', routeSignals: { plan: 0.5 } })
    await writeFile(path, `${JSON.stringify(old)}\n`, 'utf8')
    const store = new ExperienceStore({ enabled: true, path, maxInMemory: 16 })
    store.append(current)
    await store.ready()
    await store.close()
    assert.deepEqual(new Set(store.values().map(row => row.id)), new Set(['old', 'current']))
  } finally { await rm(dir, { recursive: true, force: true }) }
})
