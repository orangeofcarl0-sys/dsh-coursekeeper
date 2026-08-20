import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  assessCandidate,
  bayesianBranchEstimate,
  branchCandidateFingerprint,
  branchRingPairs,
  branchPivotRoundPairs,
  branchSoftWin,
  branchTriggerDecision,
  buildBranchExperience,
  comparativeVerifierPrompt,
  createBranchCandidate,
  deduplicateCandidates,
  deterministicPrefilter,
  parseComparativeVerifierResult,
  sanitizeBranchEvidence,
  selectPair,
  trajectoryContaminationScore,
} from '../lib/branching.js'
import { BranchExperienceStore } from '../lib/branching-store.js'
import { buildTaskSignature } from '../lib/adaptive/index.js'
import {
  acceptHumanTask,
  completionBlockers,
  createGovernorState,
  recordBranchSelection,
  registerBranchCandidate,
  reopenAfterBranchApply,
  startBranchWave,
} from '../lib/state.js'

const stateOpts = { maxDynamicHintChars: 640, noInformationLimit: 3, fullBenchmarkMinQueries: 10000, fullBenchmarkMinRecall: 0.95, benchmarkScoreTolerancePercent: 2 }
const domain = {
  providerFamily: 'deepseek', modelFamily: 'deepseek-v4-pro', modelRevision: '0813',
  augmentationProfile: 'native-canonical', harnessVersion: 'dsh-0.1.x',
  policySchemaVersion: 'coursekeeper-adaptive-v2', protocolFingerprint: 'proto-a',
  rolloutMode: 'verified-branching',
}
const policy = {
  enabled: true,
  triggerFailRoute: true,
  triggerNoProgress: true,
  triggerLowRouteMargin: true,
  triggerSemanticUnknown: true,
  contaminationThreshold: 0.62,
  routeMarginThreshold: 0.08,
  minBranchProbability: 0.45,
  priorStrength: 6,
  halfLifeDays: 90,
  crossProfileWeight: 0.25,
  crossModelWeight: 0,
  stalePolicyWeight: 0.5,
  crossProtocolWeight: 0,
  crossRolloutWeight: 0.25,
}

function candidate(id, extra = {}) {
  return createBranchCandidate({
    id,
    origin: extra.origin ?? 'fresh',
    route: extra.route ?? 'inspect',
    evidence: {
      summary: extra.summary ?? `candidate ${id}`,
      artifacts: extra.artifacts ?? ['src/a.ts'],
      commands: extra.commands ?? ['npm test'],
      outputs: extra.outputs ?? ['tests passed'],
      unresolvedErrors: extra.errors ?? [],
      acceptanceSatisfied: extra.acceptance ?? true,
      verificationPassed: extra.verification ?? true,
      ...(extra.benchmark === undefined ? {} : { benchmarkPassed: extra.benchmark }),
      ...(extra.patch ? { patch: extra.patch } : {}),
    },
  })
}

test('single rollout mode is a strict cold-start no-op for branching policy', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Fix src/a.ts regression', 1, false, stateOpts)
  state.noInformationStreak = 8
  const task = buildTaskSignature(state.episode.contract, state.knownArtifacts)
  const decision = branchTriggerDecision(state, task, { ...domain, rolloutMode: 'single' }, [], { ...policy, enabled: false })
  assert.equal(decision.eligible, false)
  assert.equal(state.episode.branching.current, undefined)
  assert.equal(state.episode.branching.wavesStarted, 0)
})

test('strong fail-route signal triggers branching even at cold start', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Fix src/a.ts regression', 1, false, stateOpts)
  state.episode.transitions.push({ from: 'inspect', to: 'plan', reason: 'fail-route', sequence: 5, evidenceActions: 2 })
  const task = buildTaskSignature(state.episode.contract, state.knownArtifacts)
  const decision = branchTriggerDecision(state, task, domain, [], policy)
  assert.equal(decision.eligible, true)
  assert.ok(decision.triggers.includes('fail-route'))
  assert.equal(decision.effectiveSupport, 0)
})

test('trajectory contamination rises with falsification, stalls and semantic rejection', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Research an unknown failure in src/a.ts', 1, false, stateOpts)
  const base = trajectoryContaminationScore(state)
  state.noInformationStreak = 4
  state.repeatedCallCount = 3
  state.episode.route.stallActions = 3
  state.episode.route.epistemic = 'contradicted'
  state.episode.semanticVerification.decision = 'fail_route'
  state.episode.evidence.push({ kind: 'hypothesis-falsified', summary: 'A failed', sequence: 2, weight: 1 })
  const contaminated = trajectoryContaminationScore(state)
  assert.ok(contaminated > base)
  assert.ok(contaminated >= 0.62)
})

test('candidate fingerprinting deduplicates equivalent evidence and preserves distinct patches', () => {
  const a = candidate('a', { patch: 'x=1' })
  const b = candidate('b', { patch: 'x=1' })
  const c = candidate('c', { patch: 'x=2' })
  assert.equal(a.fingerprint, b.fingerprint)
  assert.notEqual(a.fingerprint, c.fingerprint)
  assert.deepEqual(deduplicateCandidates([a, b, c]).unique.map(x => x.id), ['a', 'c'])
  assert.equal(branchCandidateFingerprint(a), a.fingerprint)
})

test('deterministic prefilter rejects explicit failures before spending verifier calls', () => {
  const bad = candidate('bad', { verification: false, errors: ['pytest failed'] })
  const good = candidate('good')
  assert.equal(assessCandidate(bad).verdict, 'fail')
  const filtered = deterministicPrefilter([bad, good])
  assert.equal(filtered.survivors.length, 1)
  assert.equal(filtered.survivors[0].id, 'good')
  assert.equal(filtered.assessments.find(x => x.candidateId === 'bad').verdict, 'fail')
})

test('fresh comparative verifier prompt contains evidence, not generator hidden reasoning', () => {
  const a = candidate('a', { commands: ['pytest'], outputs: ['1 passed'] })
  const b = candidate('b', { commands: ['pytest'], outputs: ['1 failed'], verification: false })
  const prompt = comparativeVerifierPrompt('Fix the test', a, b)
  assert.match(prompt, /fresh-context verification/i)
  assert.match(prompt, /observed_outputs:/)
  assert.match(prompt, /pytest/)
  assert.match(prompt, /do not continue either candidate reasoning narrative/i)
  assert.doesNotMatch(prompt, /chain of thought:/i)
})

test('pair selection can expand on low margin and refuse all weak candidates', () => {
  const a = candidate('a')
  const b = candidate('b')
  const tied = selectPair(a, b, { decision: 'tie', scoreA: 0.70, scoreB: 0.68, confidence: 0.5, reason: 'close' }, { minScore: 0.55, margin: 0.08 })
  assert.equal(tied.status, 'expand')
  const invalid = selectPair(a, b, { decision: 'no_valid_candidate', scoreA: 0.40, scoreB: 0.45, confidence: 0.9, reason: 'both lack evidence' }, { minScore: 0.55, margin: 0.08 })
  assert.equal(invalid.status, 'no-valid-candidate')
  const parsed = parseComparativeVerifierResult('{"decision":"a","scoreA":0.8,"scoreB":0.5,"confidence":0.9,"reason":"better evidence"}')
  assert.equal(parsed.decision, 'a')
})

test('selected alternate cannot finish until it is applied and reverified on main workspace', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Create src/new.ts exporting x.', 1, false, stateOpts)
  // Pretend the pre-branch main path had already satisfied acceptance.
  for (const obligation of state.episode.acceptance.values()) obligation.status = 'satisfied'
  const decision = { eligible: true, triggers: ['manual'], contamination: 0.8, calibratedProbability: 0.5, effectiveSupport: 0, reason: 'manual' }
  assert.equal(startBranchWave(state, decision, 'pre-mutation', 'cp1').ok, true)
  const alt = candidate('alt', { origin: 'fresh', artifacts: ['src/new.ts'], patch: 'export const x=1' })
  assert.equal(registerBranchCandidate(state, alt).ok, true)
  assert.equal(recordBranchSelection(state, 'alt', 'better evidence').ok, true)
  assert.ok(completionBlockers(state, stateOpts).some(x => /selected but has not been applied/i.test(x)))
  const applied = reopenAfterBranchApply(state, alt, 10, stateOpts)
  assert.equal(applied.ok, true)
  assert.equal(state.episode.branching.current.status, 'applied')
  assert.ok(completionBlockers(state, stateOpts).some(x => /Acceptance obligation remains/i.test(x)))
  assert.ok(completionBlockers(state, stateOpts).some(x => /Verification debt remains/i.test(x)))
})

test('branch calibration is protocol-isolated and one anecdote cannot suppress strong recovery', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Fix src/a.ts regression', 1, false, stateOpts)
  state.episode.transitions.push({ from: 'inspect', to: 'plan', reason: 'fail-route', sequence: 5, evidenceActions: 2 })
  const task = buildTaskSignature(state.episode.contract, state.knownArtifacts)
  const oldDomain = { ...domain, protocolFingerprint: 'other-protocol' }
  const row = buildBranchExperience({
    domain: oldDomain,
    generatorProtocol: { profile: 'native-canonical', fingerprint: 'other-protocol' },
    verifierProtocol: { profile: 'fresh-evidence-evaluator-v1', providerFamily: 'deepseek', modelFamily: 'deepseek-v4-pro', context: 'fresh', includesGeneratorReasoning: false },
    task, triggers: ['fail-route'], contamination: 0.7,
    candidates: [candidate('current', { origin: 'current' }), candidate('alt')], selectedCandidateId: 'current',
    finalReverifyPassed: false, externalFailure: false, verifierCalls: 1,
  })
  const estimate = bayesianBranchEstimate([row], task, ['fail-route'], domain, policy)
  assert.equal(estimate.effectiveN, 0)
  const decision = branchTriggerDecision(state, task, domain, [row], policy)
  assert.equal(decision.eligible, true)
})

test('branch experience attributes benefit only after alternate wins and final reverify passes', () => {
  const taskState = createGovernorState()
  acceptHumanTask(taskState, 'Fix src/a.ts regression', 1, false, stateOpts)
  const task = buildTaskSignature(taskState.episode.contract, taskState.knownArtifacts)
  const current = candidate('current', { origin: 'current' })
  const alt = candidate('alt', { origin: 'fresh' })
  const common = {
    domain,
    generatorProtocol: { profile: 'native-canonical', fingerprint: domain.protocolFingerprint },
    verifierProtocol: { profile: 'fresh-evidence-evaluator-v1', providerFamily: 'deepseek', modelFamily: 'deepseek-v4-pro', context: 'fresh', includesGeneratorReasoning: false },
    task, triggers: ['no-progress'], contamination: 0.7, candidates: [current, alt], externalFailure: false, verifierCalls: 2,
  }
  assert.equal(buildBranchExperience({ ...common, selectedCandidateId: 'alt', finalReverifyPassed: true }).useful, true)
  assert.equal(buildBranchExperience({ ...common, selectedCandidateId: 'alt', finalReverifyPassed: false }).useful, false)
  assert.equal(buildBranchExperience({ ...common, selectedCandidateId: 'current', finalReverifyPassed: true }).useful, false)
})

test('BranchExperienceStore tolerates corrupt JSONL and does not lose first live append during load', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coursekeeper-branch-exp-'))
  const path = join(dir, 'branch.jsonl')
  try {
    await writeFile(path, '{bad-json}\n', 'utf8')
    const state = createGovernorState()
    acceptHumanTask(state, 'Fix src/a.ts regression', 1, false, stateOpts)
    const task = buildTaskSignature(state.episode.contract, state.knownArtifacts)
    const row = buildBranchExperience({
      domain,
      generatorProtocol: { profile: 'native-canonical', fingerprint: domain.protocolFingerprint },
      verifierProtocol: { profile: 'fresh-evidence-evaluator-v1', providerFamily: 'deepseek', modelFamily: 'deepseek-v4-pro', context: 'fresh', includesGeneratorReasoning: false },
      task, triggers: ['no-progress'], contamination: 0.7,
      candidates: [candidate('current', { origin: 'current' }), candidate('alt')], selectedCandidateId: 'alt',
      finalReverifyPassed: true, externalFailure: false, verifierCalls: 2,
    })
    const store = new BranchExperienceStore({ enabled: true, path, maxInMemory: 16 })
    const loading = store.ready()
    store.append(row)
    await loading
    await store.close()
    assert.equal(store.values().filter(x => x.id === row.id).length, 1)
    assert.equal((await store.status()).invalidLines, 1)
    assert.match(await readFile(path, 'utf8'), new RegExp(row.id))
  } finally { await rm(dir, { recursive: true, force: true }) }
})


test('branch evidence is bounded before fingerprinting and verifier serialization', () => {
  const evidence = sanitizeBranchEvidence({
    summary: 's'.repeat(5000),
    artifacts: Array.from({ length: 100 }, (_, i) => `src/${i}.ts`),
    commands: Array.from({ length: 100 }, () => 'c'.repeat(5000)),
    outputs: Array.from({ length: 100 }, () => 'o'.repeat(9000)),
    unresolvedErrors: Array.from({ length: 50 }, () => 'e'.repeat(5000)),
    patch: 'p'.repeat(50000),
  })
  assert.ok(evidence.summary.length <= 2400)
  assert.equal(evidence.artifacts.length, 64)
  assert.equal(evidence.commands.length, 64)
  assert.ok(evidence.commands[0].length <= 2400)
  assert.ok(evidence.outputs[0].length <= 4800)
  assert.ok(evidence.patch.length <= 24000)
})

test('pivot tournament helpers preserve ring slot balance and bound N>=4 comparisons', () => {
  const items = ['a','b','c','d','e'].map(id => ({ id }))
  const ring = branchRingPairs(items)
  assert.equal(ring.length, 5)
  assert.deepEqual(ring.map(([a]) => a.id).sort(), ['a','b','c','d','e'])
  assert.deepEqual(ring.map(([,b]) => b.id).sort(), ['a','b','c','d','e'])
  const pivotPairs = branchPivotRoundPairs(items, ['a'])
  assert.equal(pivotPairs.length, 4)
  assert.ok(branchSoftWin(0.8, 0.4) > 0.5)
  assert.equal(ring.length + pivotPairs.length, 9)
})

test('an active collecting branch wave is itself a completion blocker', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Analyze src/a.ts', 1, false, stateOpts)
  for (const obligation of state.episode.acceptance.values()) obligation.status = 'satisfied'
  const decision = { eligible: true, triggers: ['manual'], contamination: 0.7, calibratedProbability: 0.5, effectiveSupport: 0, reason: 'manual' }
  startBranchWave(state, decision, 'none')
  const blockers = completionBlockers(state, stateOpts)
  assert.ok(blockers.some(x => /branch wave .*collecting/i.test(x)))
})
