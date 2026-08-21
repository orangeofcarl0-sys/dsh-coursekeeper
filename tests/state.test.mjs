import test from 'node:test'
import assert from 'node:assert/strict'
import {
  acceptHumanTask,
  applyTrajectoryControl,
  canFinish,
  completionBlockers,
  createGovernorState,
  mutationGate,
  rebuildStateFromEvents,
  registerToolCall,
  settleToolCall,
} from '../lib/state.js'
import { createVerificationDebtForArtifact, createDependentVerificationDebts, debtSatisfied, markArtifactRemoved, openVerificationDebts, pruneVerificationDebts, cleanupVerificationDebts } from '../lib/debt.js'

const opts = { maxDynamicHintChars: 640, noInformationLimit: 3, fullBenchmarkMinQueries: 10000, fullBenchmarkMinRecall: 0.95, benchmarkScoreTolerancePercent: 2 }

function call(state, id, name, args, result, seq) {
  registerToolCall(state, id, name, args, seq, opts)
  return settleToolCall(state, id, { isError: false, content: result }, seq + 1, opts)
}

test('build completion requires both acceptance and verification', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Create src/new.ts exporting x.', 1, false, opts)
  assert.equal(mutationGate(state).allowed, true)
  call(state, 'w', 'write', { file_path: 'src/new.ts', content: 'export const x=1' }, 'wrote', 10)
  assert.equal([...state.episode.acceptance.values()][0].status, 'satisfied')
  assert.equal(canFinish(state, opts), false)
  call(state, 'r', 'read', { file_path: 'src/new.ts' }, 'export const x=1', 20)
  call(state, 't', 'bash', { command: 'npm test -- src/new.ts' }, 'ok\n[exit code: 0]', 30)
  assert.equal(openVerificationDebts(state.workspace).length, 0)
  assert.equal(canFinish(state, opts), true)
})

test('artifact-scoped verification does not clear unrelated debt', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Create src/a.ts and src/b.ts', 1, false, opts)
  call(state, 'wa', 'write', { file_path: 'src/a.ts', content: 'a' }, 'wrote', 10)
  call(state, 'wb', 'write', { file_path: 'src/b.ts', content: 'b' }, 'wrote', 20)
  call(state, 'ra', 'read', { file_path: 'src/a.ts' }, 'a', 30)
  call(state, 'rb', 'read', { file_path: 'src/b.ts' }, 'b', 40)
  call(state, 'ta', 'bash', { command: 'npm test -- src/a.ts' }, '[exit code: 0]', 50)
  const open = openVerificationDebts(state.workspace)
  assert.equal(open.length, 1)
  assert.match(open[0].artifact, /src\/b\.ts/i)
})

test('later mutation of B does not invalidate already satisfied A evidence', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Create src/a.ts and src/b.ts', 1, false, opts)
  call(state, 'wa', 'write', { file_path: 'src/a.ts', content: 'a' }, 'wrote', 10)
  call(state, 'ra', 'read', { file_path: 'src/a.ts' }, 'a', 20)
  call(state, 'ta', 'bash', { command: 'npm test -- src/a.ts' }, '[exit code: 0]', 30)
  assert.equal(openVerificationDebts(state.workspace).length, 0)
  call(state, 'wb', 'write', { file_path: 'src/b.ts', content: 'b' }, 'wrote', 40)
  const open = openVerificationDebts(state.workspace)
  assert.equal(open.length, 1)
  assert.match(open[0].artifact, /src\/b\.ts/i)
})

test('analysis acceptance is satisfied by relevant observation without mutation', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Analyze src/core.ts and explain the failure mode', 1, false, opts)
  assert.equal(canFinish(state, opts), false)
  call(state, 'r', 'read', { file_path: 'src/core.ts' }, 'source', 10)
  assert.equal([...state.episode.acceptance.values()][0].status, 'satisfied')
  assert.equal(canFinish(state, opts), true)
})

test('PLAN commitment converts J-Space persistence into evidence budget, not extra thinking', () => {
  const state = createGovernorState()
  acceptHumanTask(state, '全面重构 src/core.ts 的架构并考虑多个模块集成和并发', 1, false, opts)
  assert.equal(state.episode.route.route, 'plan')
  assert.equal(mutationGate(state).allowed, false)
  let res = applyTrajectoryControl(state, {
    action: 'commit', route: 'plan', hypothesis: 'coupling is concentrated at core API',
    falsifier: 'dependency scan shows coupling elsewhere', next_evidence: 'inspect src/core.ts and its imports',
    min_evidence_actions: 2, max_evidence_actions: 4,
  }, 1, opts)
  assert.equal(res.ok, true)
  res = applyTrajectoryControl(state, { action: 'reroute', route: 'direct', cause: 'manual' }, 2, opts)
  assert.equal(res.ok, false)
  call(state, 'r1', 'read', { file_path: 'src/core.ts' }, 'core', 10)
  call(state, 'r2', 'grep', { query: 'import', path: 'src/core.ts' }, 'imports', 20)
  res = applyTrajectoryControl(state, { action: 'reroute', route: 'inspect', cause: 'manual' }, 30, opts)
  assert.equal(res.ok, true)
})

test('wrong first hypothesis can be falsified immediately without waiting out commitment', () => {
  const state = createGovernorState()
  acceptHumanTask(state, '研究一个未知算法机制并设计实验验证假设', 1, false, opts)
  assert.equal(state.episode.route.route, 'explore')
  assert.equal(applyTrajectoryControl(state, {
    action: 'commit', route: 'explore', hypothesis: 'A causes the effect', falsifier: 'controlled run without A still shows effect', next_evidence: 'run controlled ablation', min_evidence_actions: 3, max_evidence_actions: 5,
  }, 1, opts).ok, true)
  assert.equal(applyTrajectoryControl(state, { action: 'falsify', evidence: 'controlled run without A still shows effect' }, 2, opts).ok, true)
  const reroute = applyTrajectoryControl(state, { action: 'reroute', route: 'inspect', cause: 'falsified' }, 3, opts)
  assert.equal(reroute.ok, true)
  assert.equal(state.episode.route.route, 'inspect')
})

test('explicit self-attested no-change acceptance is auditable rather than silently assumed', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Fix src/a.ts if it is actually broken', 1, false, opts)
  call(state, 'r', 'read', { file_path: 'src/a.ts' }, 'already correct', 10)
  assert.equal(canFinish(state, opts), false)
  const result = applyTrajectoryControl(state, { action: 'accept', obligation_id: 'fix:addressed', evidence: 'observed implementation already satisfies reported invariant; no mutation required' }, 20, opts)
  assert.equal(result.ok, true)
  assert.equal([...state.episode.acceptance.values()][0].selfAttested, true)
  assert.equal(canFinish(state, opts), true)
})

test('benchmark history is episode-scoped', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Optimize index A performance', 1, false, opts)
  call(state, 'b', 'run_benchmark', {}, JSON.stringify({benchmark_id:'idxA',total_queries:10000,recall:0.98,qps:1000,concurrency:8,warmup:100}), 10)
  assert.equal(state.episode.benchmark.bestBySpec.size, 1)
  acceptHumanTask(state, 'Now optimize a completely different index B performance', 2, false, opts)
  assert.equal(state.episode.contract.relation, 'new')
  assert.equal(state.episode.benchmark.bestBySpec.size, 0)
})

test('durable event replay reconstructs mutation, readback, scoped verification and acceptance', () => {
  const events = [
    { type:'user/message', seq:1, data:{ source:{kind:'user'}, content:[{type:'text',text:'Create src/new.ts exporting x.'}], turn:1 } },
    { type:'tool/call', seq:2, data:{ callId:'w', name:'write', arguments:JSON.stringify({file_path:'src/new.ts',content:'x'}) } },
    { type:'tool/result', seq:3, data:{ message:{ source:{callId:'w'}, content:[{type:'tool-result',isError:false,content:[{type:'text',text:'wrote'}]}] } } },
    { type:'tool/call', seq:4, data:{ callId:'r', name:'read', arguments:JSON.stringify({file_path:'src/new.ts'}) } },
    { type:'tool/result', seq:5, data:{ message:{ source:{callId:'r'}, content:[{type:'tool-result',isError:false,content:[{type:'text',text:'x'}]}] } } },
    { type:'tool/call', seq:6, data:{ callId:'t', name:'bash', arguments:JSON.stringify({command:'npm test -- src/new.ts'}) } },
    { type:'tool/result', seq:7, data:{ message:{ source:{callId:'t'}, content:[{type:'tool-result',isError:false,content:[{type:'text',text:'[exit code: 0]'}]}] } } },
  ]
  const rebuilt = rebuildStateFromEvents(events, opts)
  assert.equal(rebuilt.workspace.revision, 1)
  assert.equal(openVerificationDebts(rebuilt.workspace).length, 0)
  assert.equal(canFinish(rebuilt, opts), true)
})

test('completion blockers expose acceptance separately from verification', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Create src/new.ts', 1, false, opts)
  const blockers = completionBlockers(state, opts)
  assert.ok(blockers.some(x => x.includes('Acceptance obligation')))
  assert.ok(!blockers.some(x => x.includes('Verification debt')))
})

test('source dependency graph creates command debt for dependents after a dependency mutation', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Analyze src/a.ts, then update src/b.ts if needed', 1, false, opts)
  call(state, 'ra', 'read', { file_path: 'src/a.ts' }, "import { b } from './b'\nexport const a=b", 10)
  call(state, 'wb', 'write', { file_path: 'src/b.ts', content: 'export const b=2' }, 'wrote', 20)
  const open = openVerificationDebts(state.workspace)
  assert.ok(open.some(x => /src\/b\.ts/i.test(x.artifact)))
  assert.ok(open.some(x => /src\/a\.ts/i.test(x.artifact) && x.requiresReadback === false && x.requiresCommand === true))
})

test('positive evidence after a semantic pass invalidates the semantic pass even without workspace mutation', () => {
  const semanticOpts = { ...opts, semanticVerifierMode: 'always' }
  const state = createGovernorState()
  acceptHumanTask(state, 'Analyze src/core.ts', 1, false, semanticOpts)
  state.episode.semanticVerification.status = 'passed'
  state.episode.semanticVerification.verifiedWorkspaceRevision = 0
  call(state, 'r', 'read', { file_path: 'src/core.ts' }, 'new relevant evidence', 10)
  assert.equal(state.episode.semanticVerification.status, 'pending')
  assert.equal(state.episode.semanticVerification.verifiedWorkspaceRevision, undefined)
})

test('superseded revision debts no longer gate completion and are pruned', () => {
  const state = createGovernorState()
  const d1 = createVerificationDebtForArtifact(state.workspace, 'src/a.ts', 1)
  const d2 = createVerificationDebtForArtifact(state.workspace, 'src/a.ts', 2)
  const d3 = createVerificationDebtForArtifact(state.workspace, 'src/a.ts', 3)
  assert.equal(debtSatisfied(state.workspace, d1), true)
  assert.equal(debtSatisfied(state.workspace, d2), true)
  assert.equal(debtSatisfied(state.workspace, d3), false)
  assert.deepEqual(openVerificationDebts(state.workspace).map(debt => debt.id), [d3.id])
  pruneVerificationDebts(state.workspace)
  assert.deepEqual([...state.workspace.verificationDebt.keys()], [d3.id])
})

test('removed artifact debts no longer block completion and are pruned', () => {
  const state = createGovernorState()
  acceptHumanTask(state, 'Create src/a.ts', 1, false, opts)
  const debt = createVerificationDebtForArtifact(state.workspace, 'src/a.ts', 2)
  assert.equal(openVerificationDebts(state.workspace).length, 1)
  markArtifactRemoved(state.workspace, 'src/a.ts', 3)
  assert.equal(openVerificationDebts(state.workspace).length, 0)
  pruneVerificationDebts(state.workspace)
  assert.equal(state.workspace.verificationDebt.size, 0)
  assert.equal(debt.id.length > 0, true)
})

test('cleanupVerificationDebts removes synthetic debts', () => {
  const state = createGovernorState()
  createVerificationDebtForArtifact(state.workspace, 'agent/pre-step', 1)
  assert.equal(cleanupVerificationDebts(state.workspace, { synthetic: true }), 1)
  assert.equal(state.workspace.verificationDebt.size, 0)
})

test('semantic infra-fail user escape removes semantic blocker', () => {
  const state = createGovernorState()
  const riskOpts = { ...opts, semanticVerifierMode: 'risk', semanticVerifierFailOpen: false, maxSemanticVerifierInfraFailures: 2 }
  acceptHumanTask(state, '研究未知机制并设计实验', 1, false, riskOpts)
  state.episode.acceptance.forEach(x => { x.status = 'satisfied' })
  state.episode.route.explicit = true
  state.episode.semanticVerification.status = 'unavailable'
  state.episode.semanticVerification.infraFailures = 2
  assert.ok(completionBlockers(state, riskOpts).some(x => x.includes('Independent semantic verification')))
  state.episode.semanticVerification.userAllowedInfraFail = true
  assert.ok(!completionBlockers(state, riskOpts).some(x => x.includes('Independent semantic verification')))
})

test('conservative dependency scope creates command debt for unrelated known artifact', () => {
  const state = createGovernorState()
  createVerificationDebtForArtifact(state.workspace, 'src/a.ts', 1)
  createVerificationDebtForArtifact(state.workspace, 'src/b.ts', 2)
  const created = createDependentVerificationDebts(state.workspace, 'src/a.ts', 3, true)
  assert.ok(created.some(debt => debt.artifact.endsWith('src/b.ts')))
  const resolvedOnly = createDependentVerificationDebts(state.workspace, 'src/a.ts', 4, false)
  assert.ok(!resolvedOnly.some(debt => debt.artifact.endsWith('src/b.ts')) || resolvedOnly.length === 0)
})
