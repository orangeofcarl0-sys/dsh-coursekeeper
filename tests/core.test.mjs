import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canSwitchRoute,
  classifyTaskContract,
  controlPacket,
  createAcceptanceObligations,
  defaultRouteContract,
  lexicalSimilarity,
  mutationAllowed,
  parseBenchmarkResult,
  compareBenchmarkResults,
  selectRoute,
  staticKernel,
} from '../lib/core.js'

test('TaskRelation and TaskKind are orthogonal', () => {
  const prior = { objective: 'Create cart.js', artifacts: new Set(['cart.js']) }
  const correction = classifyTaskContract('cart.js 的 total 算错了，修复这个 bug', prior)
  assert.equal(correction.relation, 'correction')
  assert.equal(correction.kind, 'fix')
  const freshAnalysis = classifyTaskContract('详细分析另一个全新的 repository architecture')
  assert.equal(freshAnalysis.relation, 'new')
  assert.equal(freshAnalysis.kind, 'analysis')
})

test('Chinese lexical similarity uses character n-grams instead of whitespace tokens only', () => {
  assert.ok(lexicalSimilarity('继续分析这个模块的问题', '分析这个模块并修复问题') > 0.15)
})

test('route selection distinguishes direct, inspect, plan, explore', () => {
  assert.equal(selectRoute(classifyTaskContract('Create a tiny script hello.py')), 'direct')
  assert.equal(selectRoute(classifyTaskContract('Fix the regression in src/auth.ts')), 'inspect')
  assert.equal(selectRoute(classifyTaskContract('全面重构 src/core.ts 的架构并考虑多个模块集成和并发')), 'plan')
  assert.equal(selectRoute(classifyTaskContract('研究一个未知算法机制并设计实验验证假设')), 'explore')
})

test('PLAN/EXPLORE mutation requires explicit falsifiable route contract', () => {
  const route = defaultRouteContract(classifyTaskContract('全面重构 src/core.ts 的架构并考虑并发'))
  assert.equal(route.route, 'plan')
  assert.equal(route.explicit, false)
  assert.equal(mutationAllowed(route, true).allowed, false)
})

test('INSPECT route requires evidence but not a hypothesis ceremony', () => {
  const route = defaultRouteContract(classifyTaskContract('Fix src/auth.ts regression'))
  assert.equal(route.route, 'inspect')
  assert.equal(route.explicit, true)
  assert.equal(mutationAllowed(route, false).allowed, false)
  route.evidenceActions = 1
  assert.equal(mutationAllowed(route, true).allowed, true)
})

test('commitment hysteresis rejects premature reroute and permits falsification', () => {
  const route = defaultRouteContract(classifyTaskContract('研究未知机制并设计实验'))
  route.explicit = true
  route.minEvidenceActions = 2
  assert.equal(canSwitchRoute(route, 'manual').allowed, false)
  assert.equal(canSwitchRoute(route, 'falsified').allowed, true)
  route.evidenceActions = 2
  assert.equal(canSwitchRoute(route, 'manual').allowed, true)
})

test('static kernel is small and separates commitment from evidence', () => {
  const text = staticKernel()
  assert.match(text, /Uncertainty means seek evidence, not branch/)
  assert.match(text, /Coherence is not evidence/)
  assert.ok(text.length < 600)
})

test('dynamic control packet is bounded', () => {
  const contract = classifyTaskContract('研究未知机制并设计实验')
  const route = defaultRouteContract(contract)
  route.hypothesis = 'x'.repeat(1000)
  route.falsifier = 'y'.repeat(1000)
  route.nextEvidence = 'z'.repeat(1000)
  const packet = controlPacket(contract, route, 'inspect', 3, 2, false, 320)
  assert.ok(packet.length <= 320)
})

test('acceptance obligations are separate from verification obligations', () => {
  const build = createAcceptanceObligations(classifyTaskContract('Create src/new.ts'))
  assert.equal(build.length, 1)
  assert.equal(build[0].kind, 'deliverable')
  const analysis = createAcceptanceObligations(classifyTaskContract('Analyze src/core.ts'))
  assert.equal(analysis[0].kind, 'grounding')
})

test('benchmark identity includes dataset/hardware/spec dimensions', () => {
  const a = parseBenchmarkResult(JSON.stringify({benchmark_id:'idx',dataset:'A',hardware:'H100',total_queries:10000,recall:0.98,qps:1000,concurrency:8,warmup:100}))
  const b = parseBenchmarkResult(JSON.stringify({benchmark_id:'idx',dataset:'B',hardware:'H100',total_queries:10000,recall:0.98,qps:1100,concurrency:8,warmup:100}))
  assert.ok(a && b)
  assert.equal(compareBenchmarkResults(b, a, 2).outcome, 'different-spec')
})
