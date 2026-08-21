import {
  COURSEKEEPER_CONTROL_TOOL,
  LEGACY_TRAJECTORY_CONTROL_TOOL,
  canSwitchRoute,
  classifyTaskContract,
  classifyTool,
  compareBenchmarkResults,
  controlPacket,
  createAcceptanceObligations,
  defaultRouteContract,
  routeContractForRoute,
  fingerprint,
  hasCommandFailure,
  initialPhase,
  isFullBenchmark,
  mutationAllowed,
  normalizePath,
  parseBenchmarkResult,
  relevantObservation,
  extractSourceDependencies,
  routeRequiresExplicitCommit,
  staticKernel,
  verificationEvidenceFromTool,
} from './core.js'
import {
  applyReadback,
  applyVerificationEvidence,
  artifactRevisionSnapshot,
  createVerificationDebtForArtifact,
  createDependentVerificationDebts,
  setArtifactDependencies,
  createWorkspaceMutationDebt,
  markArtifactRemoved,
  cleanupVerificationDebts,
  waiveVerificationDebt,
  openAcceptance,
  openVerificationDebts,
  pruneVerificationDebts,
  satisfyAcceptance,
  updateAcceptanceAfterMutation,
  updateAcceptanceAfterObservation,
  waiveAcceptance,
} from './debt.js'
import type {
  AgentPhase,
  BenchmarkRecord,
  CallState,
  GovernorPolicyConfig,
  GovernorState,
  ProgressEvent,
  Route,
  RouteContract,
  AdaptiveRouteDecision,
  RouteTransitionReason,
  TaskContract,
  ToolSemantics,
  TurnState,
  BranchCandidate,
  BranchTriggerDecision,
  WorkspaceForkCapability,
} from './types.js'

export interface StateOptions extends GovernorPolicyConfig {
  semanticVerifierMode?: 'off' | 'risk' | 'always'
  semanticVerifierFailOpen?: boolean
  maxSemanticVerifierInfraFailures?: number
  benchmarkRequired?: boolean
  benchmarkToolNames?: readonly string[]
  verificationToolNames?: readonly string[]
  verificationCommandPatterns?: readonly string[]
  finishToolNames?: readonly string[]
}

export const DEFAULT_STATE_OPTIONS: StateOptions = {
  maxDynamicHintChars: 640,
  noInformationLimit: 3,
  semanticVerifierFailOpen: false,
  maxSemanticVerifierInfraFailures: 2,
  fullBenchmarkMinQueries: 10_000,
  fullBenchmarkMinRecall: 0.95,
  benchmarkScoreTolerancePercent: 2,
  benchmarkRequired: false,
  semanticVerifierMode: 'off',
}

function options(input: Partial<StateOptions> = {}): StateOptions {
  return { ...DEFAULT_STATE_OPTIONS, ...input }
}

export function createGovernorState(): GovernorState {
  return {
    episodeCounter: 0,
    humanMessages: 0,
    planMode: false,
    workspace: {
      revision: 0,
      artifacts: new Map(),
      verificationDebt: new Map(),
      verificationEvidence: [],
    },
    knownArtifacts: new Set(),
    recentEpisodes: [],
    policyRevision: 0,
    injectedRevision: 0,
    noInformationStreak: 0,
    repeatedCallCount: 0,
  }
}

function priorContext(state: GovernorState): { objective: string; artifacts: ReadonlySet<string> } | undefined {
  const episode = state.episode
  if (!episode) return undefined
  return {
    objective: episode.contract.objective,
    artifacts: new Set([...state.knownArtifacts, ...episode.contract.artifacts]),
  }
}

function createTurn(turn: number): TurnState {
  return { turn, automaticContinuations: 0, blockerReported: false, calls: new Map() }
}

function benchmarkState() {
  return { seen: false, bestBySpec: new Map(), stagnantFullBenchmarks: 0 }
}

function semanticVerificationState(contract: TaskContract, route: RouteContract, mode: 'off' | 'risk' | 'always' = 'off') {
  const required = contract.kind !== 'conversation' && (mode === 'always' || (mode === 'risk' && (contract.risk === 'high' || route.route === 'plan' || route.route === 'explore' || contract.kind === 'research')))
  return { required, status: required ? 'pending' as const : 'not-required' as const, attempts: 0, infraFailures: 0, contradictions: [], nextEvidence: [] }
}

function acceptanceMap(contract: TaskContract) {
  return new Map(createAcceptanceObligations(contract).map(obligation => [obligation.id, obligation] as const))
}

function phaseFor(contract: TaskContract, route: RouteContract, planMode: boolean): AgentPhase {
  return initialPhase(contract, route.route, planMode)
}

function appendRecentEpisode(state: GovernorState): void {
  const episode = state.episode
  if (!episode) return
  state.recentEpisodes.push({ objective: episode.contract.objective, artifacts: new Set([...state.knownArtifacts, ...episode.contract.artifacts]) })
  while (state.recentEpisodes.length > 8) state.recentEpisodes.shift()
}

function mergeAcceptance(existing: Map<string, ReturnType<typeof createAcceptanceObligations>[number]>, next: ReturnType<typeof createAcceptanceObligations>): void {
  for (const obligation of next) if (!existing.has(obligation.id)) existing.set(obligation.id, obligation)
}

export function acceptHumanTask(state: GovernorState, rawText: string, turn: number, planMode = state.planMode, inputOptions: Partial<StateOptions> = {}): void {
  const config = options(inputOptions)
  const contract = classifyTaskContract(rawText, priorContext(state))
  const newEpisode = state.episode === undefined || contract.relation === 'new'
  if (newEpisode) {
    appendRecentEpisode(state)
    state.episodeCounter++
    const route = defaultRouteContract(contract, 1)
    state.episode = {
      id: state.episodeCounter,
      initialRoute: route.route,
      transitions: [],
      humanRound: 1,
      contract,
      route,
      phase: phaseFor(contract, route, planMode),
      acceptance: acceptanceMap(contract),
      evidence: [],
      resultFingerprints: new Set(),
      benchmark: benchmarkState(),
      semanticVerification: semanticVerificationState(contract, route, config.semanticVerifierMode),
      branching: { wavesStarted: 0, lastOutcome: 'not-used' },
      kernelInjected: false,
    }
    state.noInformationStreak = 0
    state.repeatedCallCount = 0
    state.lastCallSignature = undefined
  } else {
    const episode = state.episode!
    episode.humanRound++
    episode.contract = contract
    if (contract.relation === 'correction') {
      const route = defaultRouteContract(contract, episode.route.revision + 1)
      episode.route = route
      episode.semanticVerification = semanticVerificationState(contract, route, config.semanticVerifierMode)
      episode.branching.current = undefined
      episode.phase = phaseFor(contract, route, planMode)
      episode.recoveryBlocker = undefined
      episode.blockedReason = undefined
    } else if (contract.relation === 'extension') {
      mergeAcceptance(episode.acceptance, createAcceptanceObligations(contract))
      if (episode.route.route === 'direct' && contract.complexity >= 0.5) {
        const previousRoute = episode.route.route
        const next = defaultRouteContract(contract, episode.route.revision + 1)
        if (next.route !== previousRoute) episode.transitions.push({ from: previousRoute, to: next.route, reason: 'coupling-discovered', sequence: 0, evidenceActions: episode.route.evidenceActions })
        episode.route = next
      }
      episode.semanticVerification = semanticVerificationState(contract, episode.route, config.semanticVerifierMode)
      episode.phase = phaseFor(contract, episode.route, planMode)
    } else if (contract.relation === 'clarification') {
      // Preserve route and commitment; only the objective text changes.
    } else {
      episode.phase = phaseFor(contract, episode.route, planMode)
    }
  }
  state.planMode = planMode
  state.humanMessages++
  state.lastObjective = contract.objective
  for (const artifact of contract.artifacts) state.knownArtifacts.add(artifact)
  state.turn = createTurn(turn)
  refreshPolicyHint(state, config, true)
}

export function startBranchWave(
  state: GovernorState,
  decision: BranchTriggerDecision,
  checkpointKind: WorkspaceForkCapability,
  checkpointRef?: string,
): { ok: boolean; message: string; waveId?: number } {
  const episode = state.episode
  if (!episode) return { ok: false, message: 'no active episode' }
  if (!decision.eligible) return { ok: false, message: decision.reason }
  if (episode.branching.current && ['collecting', 'comparing', 'selected'].includes(episode.branching.current.status)) {
    return { ok: false, message: `branch wave ${episode.branching.current.id} is already active` }
  }
  episode.branching.wavesStarted++
  const waveId = episode.branching.wavesStarted
  episode.branching.current = {
    id: waveId,
    status: 'collecting',
    startedAt: new Date().toISOString(),
    triggers: [...decision.triggers],
    contamination: decision.contamination,
    checkpointKind,
    ...(checkpointRef ? { checkpointRef } : {}),
    candidates: new Map(),
    comparisonCount: 0,
    verifierCalls: 0,
    wave: 1,
    requiresReverify: false,
  }
  episode.branching.lastTrigger = decision.triggers[0]
  return { ok: true, message: `branch wave ${waveId} started (${decision.triggers.join(', ')})`, waveId }
}

export function registerBranchCandidate(state: GovernorState, candidate: BranchCandidate): { ok: boolean; message: string; duplicateOf?: string } {
  const wave = state.episode?.branching.current
  if (!wave || !['collecting', 'comparing'].includes(wave.status)) return { ok: false, message: 'no branch wave is collecting candidates' }
  for (const existing of wave.candidates.values()) {
    if (existing.fingerprint === candidate.fingerprint) return { ok: false, message: `candidate ${candidate.id} duplicates ${existing.id}`, duplicateOf: existing.id }
  }
  wave.candidates.set(candidate.id, candidate)
  return { ok: true, message: `candidate ${candidate.id} registered` }
}

export function recordBranchSelection(state: GovernorState, candidateId: string, reason: string): { ok: boolean; message: string } {
  const wave = state.episode?.branching.current
  if (!wave) return { ok: false, message: 'no active branch wave' }
  if (!wave.candidates.has(candidateId)) return { ok: false, message: `unknown candidate ${candidateId}` }
  wave.status = 'selected'
  wave.selectedCandidateId = candidateId
  wave.selectionReason = reason
  wave.requiresReverify = true
  return { ok: true, message: `selected ${candidateId}; apply then reverify before finish` }
}

export function recordNoValidBranchCandidate(state: GovernorState, reason: string): void {
  const episode = state.episode
  const wave = episode?.branching.current
  if (!episode || !wave) return
  wave.status = 'no-valid-candidate'
  wave.selectionReason = reason
  episode.branching.lastOutcome = 'no-valid-candidate'
  episode.recoveryBlocker = `Verified branching found no valid candidate: ${reason}`
  episode.phase = 'recover'
}

export function reopenAfterBranchApply(
  state: GovernorState,
  candidate: BranchCandidate,
  sequence = 0,
  inputOptions: Partial<StateOptions> = {},
): { ok: boolean; message: string; workspaceRevision: number } {
  const config = options(inputOptions)
  const episode = state.episode
  const wave = episode?.branching.current
  if (!episode || !wave || wave.selectedCandidateId !== candidate.id) {
    return { ok: false, message: 'selected branch candidate is not active', workspaceRevision: state.workspace.revision }
  }
  // A selected branch is only a search result. Applying it invalidates every
  // previous completion claim on the main workspace and creates fresh debt.
  for (const obligation of episode.acceptance.values()) {
    if (obligation.status === 'waived') continue
    obligation.status = 'open'
    obligation.evidence.length = 0
    obligation.selfAttested = false
  }
  const artifacts = [...new Set(candidate.evidence.artifacts.filter(Boolean))]
  if (artifacts.length === 0) createWorkspaceMutationDebt(state.workspace, sequence)
  else for (const artifact of artifacts) createVerificationDebtForArtifact(state.workspace, artifact, sequence)
  episode.benchmark.currentRevisionPassed = undefined
  episode.benchmark.blocker = config.benchmarkRequired ? `Branch winner applied at workspace revision ${state.workspace.revision}; rerun the required benchmark.` : undefined
  episode.semanticVerification.status = episode.semanticVerification.required ? 'pending' : 'not-required'
  episode.semanticVerification.verifiedWorkspaceRevision = undefined
  episode.semanticVerification.decision = undefined
  episode.semanticVerification.reason = episode.semanticVerification.required ? 'branch winner applied; fresh semantic verification required after deterministic obligations close' : undefined
  episode.semanticVerification.contradictions = []
  episode.semanticVerification.nextEvidence = []
  episode.recoveryBlocker = undefined
  episode.blockedReason = undefined
  episode.phase = 'verify'
  wave.status = 'applied'
  wave.requiresReverify = true
  episode.branching.lastOutcome = candidate.origin === 'current' ? 'selected-original' : 'selected-alternate'
  refreshPolicyHint(state, config)
  return { ok: true, message: `branch candidate ${candidate.id} applied; acceptance and verification debt reopened`, workspaceRevision: state.workspace.revision }
}

export function settleBranchReverification(state: GovernorState, passed: boolean): void {
  const wave = state.episode?.branching.current
  if (!wave || wave.status !== 'applied') return
  wave.requiresReverify = !passed
  if (passed) wave.status = 'applied'
}

export function openAcceptanceCount(state: GovernorState): number {
  return state.episode ? openAcceptance(state.episode.acceptance.values()).length : 0
}

export function openVerificationCount(state: GovernorState): number {
  return openVerificationDebts(state.workspace).length
}

export function benchmarkBlocker(state: GovernorState, inputOptions: Partial<StateOptions> = {}): string | undefined {
  const config = options(inputOptions)
  const episode = state.episode
  if (!episode) return undefined
  const active = config.benchmarkRequired === true || episode.benchmark.seen
  if (!active) return undefined
  if (episode.benchmark.currentRevisionPassed === state.workspace.revision) return undefined
  return episode.benchmark.blocker ?? `Current workspace revision ${state.workspace.revision} has no parseable full benchmark pass.`
}

export function completionBlockers(state: GovernorState, inputOptions: Partial<StateOptions> = {}): string[] {
  const blockers: string[] = []
  for (const obligation of state.episode ? openAcceptance(state.episode.acceptance.values()) : []) {
    blockers.push(`Acceptance obligation remains: ${obligation.description}`)
  }
  for (const debt of openVerificationDebts(state.workspace)) blockers.push(`Verification debt remains for ${debt.artifact}.`)
  const bench = benchmarkBlocker(state, inputOptions)
  if (bench) blockers.push(bench)
  const semantic = state.episode?.semanticVerification
  if (semantic?.required) {
    const current = semantic.verifiedWorkspaceRevision === state.workspace.revision
    if (!current || semantic.status !== 'passed') {
      const cfg = options(inputOptions)
      const infraExhausted = semantic.infraFailures >= (cfg.maxSemanticVerifierInfraFailures ?? 2)
      const userAllowed = semantic.userAllowedInfraFail === true
      const failOpen = cfg.semanticVerifierFailOpen === true && infraExhausted
      if (!userAllowed && !failOpen) blockers.push(`Independent semantic verification remains: ${semantic.status}.`)
    }
  }
  const branchWave = state.episode?.branching.current
  if (branchWave?.status === 'collecting' || branchWave?.status === 'comparing') blockers.push(`Verified branch wave ${branchWave.id} is still ${branchWave.status}; finish is blocked until it selects, aborts, or fails cleanly.`)
  if (branchWave?.status === 'selected') blockers.push(`Branch candidate ${branchWave.selectedCandidateId ?? '(unknown)'} was selected but has not been applied to the main workspace.`)
  if (state.episode?.recoveryBlocker) blockers.push(state.episode.recoveryBlocker)
  if (state.episode && routeRequiresExplicitCommit(state.episode.route.route) && !state.episode.route.explicit) {
    blockers.push(`${state.episode.route.route.toUpperCase()} route was never explicitly committed.`)
  }
  return blockers
}

export function canFinish(state: GovernorState, inputOptions: Partial<StateOptions> = {}): boolean {
  return completionBlockers(state, inputOptions).length === 0
}

export function currentControlPacket(state: GovernorState, inputOptions: Partial<StateOptions> = {}): string | undefined {
  const episode = state.episode
  if (!episode) return undefined
  const config = options(inputOptions)
  return controlPacket(
    episode.contract,
    episode.route,
    episode.phase,
    openAcceptanceCount(state),
    openVerificationCount(state),
    episode.recoveryBlocker !== undefined,
    config.maxDynamicHintChars,
  )
}

export function refreshPolicyHint(state: GovernorState, inputOptions: Partial<StateOptions> = {}, includeKernel = false): void {
  const episode = state.episode
  if (!episode) return
  const packet = currentControlPacket(state, inputOptions) ?? ''
  const kernel = includeKernel && !episode.kernelInjected ? `${staticKernel()}\n` : ''
  const hint = `${kernel}${packet}`
  if (state.pendingHint === hint) return
  state.policyRevision++
  state.pendingHint = hint
}

export function markHintInjected(state: GovernorState): void {
  if (!state.episode) return
  if (state.pendingHint?.includes('<coursekeeper-kernel')) state.episode.kernelInjected = true
  state.injectedRevision = state.policyRevision
  state.pendingHint = undefined
}

function progress(state: GovernorState, event: ProgressEvent): void {
  const episode = state.episode
  if (!episode) return
  episode.evidence.push(event)
  while (episode.evidence.length > 128) episode.evidence.shift()
  if (event.weight > 0) {
    if (episode.semanticVerification.required && episode.semanticVerification.status === 'passed') {
      episode.semanticVerification.status = 'pending'
      episode.semanticVerification.infraFailures = 0
      episode.semanticVerification.userAllowedInfraFail = undefined
      episode.semanticVerification.verifiedWorkspaceRevision = undefined
      episode.semanticVerification.decision = undefined
      episode.semanticVerification.reason = undefined
    }
    state.noInformationStreak = 0
    episode.route.stallActions = Math.max(0, episode.route.stallActions - 1)
  } else {
    state.noInformationStreak++
    episode.route.stallActions++
  }
}

function mutationIsRelevant(state: GovernorState, semantics: ToolSemantics): boolean {
  const episode = state.episode
  if (!episode) return false
  if (semantics.artifacts.length === 0) return episode.contract.artifacts.length === 0
  if (episode.contract.artifacts.length === 0) return true
  return episode.contract.artifacts.some(target => semantics.artifacts.some(actual => normalizePath(actual).endsWith(normalizePath(target)) || normalizePath(target).endsWith(normalizePath(actual))))
}

function relevantEvidenceObserved(state: GovernorState): boolean {
  return (state.episode?.route.evidenceActions ?? 0) >= 1
}

export function mutationGate(state: GovernorState): { allowed: boolean; reason?: string } {
  const route = state.episode?.route
  if (!route) return { allowed: true }
  return mutationAllowed(route, relevantEvidenceObserved(state))
}

export function registerToolCall(state: GovernorState, callId: string, name: string, args: unknown, sequence: number, inputOptions: Partial<StateOptions> = {}): ToolSemantics {
  if (!state.turn) state.turn = createTurn(0)
  const config = options(inputOptions)
  const semantics = classifyTool(name, args, {
    benchmarkToolNames: config.benchmarkToolNames,
    verificationToolNames: config.verificationToolNames,
    verificationCommandPatterns: config.verificationCommandPatterns,
    finishToolNames: config.finishToolNames,
    controlToolNames: [COURSEKEEPER_CONTROL_TOOL, LEGACY_TRAJECTORY_CONTROL_TOOL],
  })
  const call: CallState = { semantics, sequence, args }
  state.turn.calls.set(callId, call)
  if (state.lastCallSignature === semantics.signature) state.repeatedCallCount++
  else { state.lastCallSignature = semantics.signature; state.repeatedCallCount = 1 }
  return semantics
}

function recordMutation(state: GovernorState, semantics: ToolSemantics, sequence: number): string[] {
  const changedAcceptance: string[] = []
  if (semantics.artifacts.length > 0) {
    for (const artifact of semantics.artifacts) {
      state.knownArtifacts.add(artifact)
      createVerificationDebtForArtifact(state.workspace, artifact, sequence)
      createDependentVerificationDebts(state.workspace, artifact, sequence)
      if (state.episode && mutationIsRelevant(state, semantics)) {
        changedAcceptance.push(...updateAcceptanceAfterMutation(state.episode.acceptance.values(), artifact, `mutation:${semantics.name}:${artifact}`))
      }
    }
  } else if (semantics.riskyMutation || semantics.effect === 'mutate') {
    createWorkspaceMutationDebt(state.workspace, sequence)
    if (state.episode && mutationIsRelevant(state, semantics)) {
      for (const obligation of state.episode.acceptance.values()) {
        if (obligation.status === 'open' && obligation.kind === 'relevant-change') {
          satisfyAcceptance(obligation, `workspace mutation:${semantics.name}`)
          changedAcceptance.push(obligation.id)
        }
      }
    }
  }
  if (state.episode) {
    state.episode.benchmark.currentRevisionPassed = undefined
    if (state.episode.semanticVerification.required) {
      state.episode.semanticVerification.status = 'pending'
      state.episode.semanticVerification.verifiedWorkspaceRevision = undefined
      state.episode.semanticVerification.decision = undefined
      state.episode.semanticVerification.reason = undefined
      state.episode.semanticVerification.contradictions = []
      state.episode.semanticVerification.nextEvidence = []
    }
  }
  return changedAcceptance
}

function recordBenchmark(state: GovernorState, semantics: ToolSemantics, output: string, meta: unknown, sequence: number, inputOptions: Partial<StateOptions>): ProgressEvent {
  const config = options(inputOptions)
  const episode = state.episode!
  episode.benchmark.seen = true
  const result = parseBenchmarkResult(output, meta, semantics.name)
  if (!result) {
    episode.benchmark.blocker = 'Configured benchmark returned no complete named metrics (total_queries, recall, qps).'
    return { kind: 'no-progress', sequence, weight: 0, summary: episode.benchmark.blocker }
  }
  const record: BenchmarkRecord = { result, sequence, workspaceRevision: state.workspace.revision }
  episode.benchmark.latest = record
  if (!isFullBenchmark(result, config.fullBenchmarkMinQueries, config.fullBenchmarkMinRecall)) {
    episode.benchmark.blocker = `Benchmark is incomplete: total_queries=${result.totalQueries}, recall=${result.recall}.`
    return { kind: 'result-novel', sequence, weight: 0.25, summary: episode.benchmark.blocker }
  }
  const previous = episode.benchmark.bestBySpec.get(result.specKey)
  if (!previous) {
    episode.benchmark.bestBySpec.set(result.specKey, record)
    episode.benchmark.currentRevisionPassed = state.workspace.revision
    episode.benchmark.blocker = undefined
    episode.benchmark.stagnantFullBenchmarks = 0
    return { kind: 'benchmark-improved', sequence, weight: 1, summary: `full benchmark baseline established: ${result.qps} qps` }
  }
  const comparison = compareBenchmarkResults(result, previous.result, config.benchmarkScoreTolerancePercent)
  if (comparison.outcome === 'regressed') {
    episode.benchmark.blocker = `Full benchmark regressed ${Math.abs(comparison.deltaPercent ?? 0).toFixed(2)}% versus same-spec best.`
    episode.benchmark.stagnantFullBenchmarks++
    return { kind: 'no-progress', sequence, weight: -1, summary: episode.benchmark.blocker }
  }
  episode.benchmark.currentRevisionPassed = state.workspace.revision
  episode.benchmark.blocker = undefined
  if (comparison.outcome === 'improved') {
    episode.benchmark.bestBySpec.set(result.specKey, record)
    episode.benchmark.stagnantFullBenchmarks = 0
    return { kind: 'benchmark-improved', sequence, weight: 1, summary: `benchmark improved ${comparison.deltaPercent?.toFixed(2)}%` }
  }
  episode.benchmark.stagnantFullBenchmarks++
  return { kind: 'result-novel', sequence, weight: 0.2, summary: 'benchmark within configured tolerance' }
}

export interface ToolResultInput {
  readonly isError: boolean
  readonly content: string
  readonly meta?: unknown
}

export function settleToolCall(state: GovernorState, callId: string, result: ToolResultInput, sequence: number, inputOptions: Partial<StateOptions> = {}): ProgressEvent | undefined {
  const call = state.turn?.calls.get(callId)
  if (!call || !state.episode) return undefined
  state.turn!.calls.delete(callId)
  const { semantics } = call
  const failed = result.isError || (semantics.operation !== undefined && hasCommandFailure(result.content))
  const hash = fingerprint({ signature: semantics.signature, content: result.content, meta: result.meta ?? null })
  const novel = !state.episode.resultFingerprints.has(hash)
  state.episode.resultFingerprints.add(hash)
  while (state.episode.resultFingerprints.size > 256) state.episode.resultFingerprints.delete(state.episode.resultFingerprints.values().next().value!)

  let event: ProgressEvent
  if (failed) {
    event = { kind: 'new-failure-mode', sequence, weight: -0.5, summary: `${semantics.name} failed` }
    state.episode.phase = 'recover'
    state.episode.recoveryBlocker = `Latest action failed: ${semantics.name}. Use a materially different action or report the blocker.`
  } else if (semantics.effect === 'control') {
    const args = typeof call.args === 'object' && call.args !== null ? call.args as Record<string, unknown> : {}
    const response = applyTrajectoryControl(state, args, sequence, inputOptions)
    event = { kind: response.ok ? 'constraint-established' : 'no-progress', sequence, weight: response.ok ? 0.75 : 0, summary: response.message }
  } else if (semantics.effect === 'observe') {
    const relevant = relevantObservation(semantics, state.episode.contract, state.episode.route)
    let readbackSatisfied = 0
    for (const artifact of semantics.artifacts) {
      state.knownArtifacts.add(artifact)
      readbackSatisfied += applyReadback(state.workspace, artifact)
      const deps = extractSourceDependencies(result.content, artifact)
      if (deps.length > 0) setArtifactDependencies(state.workspace, artifact, deps)
    }
    const grounded = updateAcceptanceAfterObservation(state.episode.acceptance.values(), semantics.artifacts[0], relevant, `observation:${semantics.name}`)
    if (relevant) {
      state.episode.route.evidenceActions++
      if (state.episode.route.epistemic === 'unsupported') state.episode.route.epistemic = 'plausible'
      event = {
        kind: grounded.length > 0 ? 'acceptance-satisfied' : readbackSatisfied > 0 ? 'verification-satisfied' : 'new-artifact-observed',
        sequence,
        weight: 1,
        summary: `relevant observation via ${semantics.name}`,
        ...(semantics.artifacts.length > 0 ? { artifacts: semantics.artifacts } : {}),
      }
      if (state.episode.route.route === 'inspect' && state.episode.route.evidenceActions >= state.episode.route.minEvidenceActions) state.episode.phase = 'construct'
      else if (state.episode.route.route === 'plan' && state.episode.route.evidenceActions >= state.episode.route.minEvidenceActions) state.episode.phase = 'design'
      else if (state.episode.route.route === 'explore') state.episode.phase = 'inspect'
    } else {
      event = { kind: novel ? 'result-novel' : 'no-progress', sequence, weight: novel ? 0.1 : 0, summary: `observation did not satisfy current evidence target: ${semantics.name}` }
    }
  } else if (semantics.effect === 'mutate' || semantics.riskyMutation) {
    const removalOp = semantics.operation ?? ''
    const removal = /(?:^|[;&|\s])(?:rm|rmdir|del|git\s+rm|git\s+clean)(?:\s|$)/i.test(removalOp)
    if (removal && semantics.artifacts.length > 0) {
      for (const artifact of semantics.artifacts) markArtifactRemoved(state.workspace, artifact, sequence)
      event = {
        kind: 'constraint-established',
        sequence,
        weight: 0.5,
        summary: `workspace removal via ${semantics.name}`,
        ...(semantics.artifacts.length > 0 ? { artifacts: semantics.artifacts } : {}),
      }
    } else {
      const acceptance = recordMutation(state, semantics, sequence)
      state.episode.phase = 'verify'
      event = {
        kind: acceptance.length > 0 ? 'acceptance-satisfied' : 'constraint-established',
        sequence,
        weight: acceptance.length > 0 ? 1 : 0.5,
        summary: `workspace mutation via ${semantics.name}`,
        ...(semantics.artifacts.length > 0 ? { artifacts: semantics.artifacts } : {}),
      }
    }
  } else if (semantics.effect === 'verify') {
    const evidence = verificationEvidenceFromTool(semantics, sequence, state.workspace.revision, artifactRevisionSnapshot(state.workspace))
    const count = evidence ? applyVerificationEvidence(state.workspace, evidence) : 0
    pruneVerificationDebts(state.workspace)
    event = { kind: count > 0 ? 'verification-satisfied' : 'result-novel', sequence, weight: count > 0 ? 1 : 0.25, summary: `${semantics.name} verified ${count} scoped debt(s)` }
    if (openVerificationDebts(state.workspace).length === 0) state.episode.phase = 'converge'
  } else if (semantics.effect === 'benchmark') {
    event = recordBenchmark(state, semantics, result.content, result.meta, sequence, inputOptions)
  } else {
    event = { kind: novel ? 'result-novel' : 'no-progress', sequence, weight: novel ? 0.15 : 0, summary: `${semantics.name} produced ${novel ? 'a new result' : 'no new result'}` }
  }

  progress(state, event)
  if (event.weight > 0 && !failed) state.episode.recoveryBlocker = undefined
  const config = options(inputOptions)
  if (state.noInformationStreak >= config.noInformationLimit || state.repeatedCallCount >= config.noInformationLimit) {
    state.episode.recoveryBlocker = `No-progress limit (${config.noInformationLimit}) reached; change the action, falsify the current hypothesis, or report a blocker.`
    state.episode.phase = 'recover'
  }
  refreshPolicyHint(state, config)
  return event
}

function numberArg(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(args[key])
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export interface ControlResult { readonly ok: boolean; readonly message: string }

export function applyTrajectoryControl(state: GovernorState, args: Record<string, unknown>, sequence = 0, inputOptions: Partial<StateOptions> = {}): ControlResult {
  const episode = state.episode
  if (!episode) return { ok: false, message: 'no active episode' }
  const action = String(args['action'] ?? '').toLowerCase()
  if (action === 'commit' || action === 'reroute') {
    const routeRaw = String(args['route'] ?? episode.route.route).toLowerCase()
    if (!['direct', 'inspect', 'plan', 'explore'].includes(routeRaw)) return { ok: false, message: `invalid route ${routeRaw}` }
    const route = routeRaw as Route
    const cause = String(args['cause'] ?? (action === 'reroute' ? 'manual' : 'commit'))
    const priorRoute = episode.route.route
    if (route !== priorRoute) {
      const gate = canSwitchRoute(episode.route, cause)
      if (!gate.allowed) return { ok: false, message: gate.reason }
    }
    const min = numberArg(args, 'min_evidence_actions', route === 'direct' ? 0 : route === 'inspect' ? 1 : 2)
    const max = Math.max(min, numberArg(args, 'max_evidence_actions', route === 'explore' ? 5 : route === 'plan' ? 4 : 3))
    const hypothesis = stringArg(args, 'hypothesis')
    const falsifier = stringArg(args, 'falsifier')
    const nextEvidence = stringArg(args, 'next_evidence')
    if (routeRequiresExplicitCommit(route) && (!hypothesis || !falsifier || !nextEvidence)) {
      return { ok: false, message: `${route.toUpperCase()} commit requires hypothesis, falsifier, and next_evidence` }
    }
    if (route !== priorRoute) {
      const normalizedCause = cause.toLowerCase()
      const reason: RouteTransitionReason = normalizedCause === 'falsified' ? 'falsifier-hit'
        : normalizedCause === 'verifier-fail' ? 'verifier-fail'
          : normalizedCause === 'budget-exhausted' ? 'budget-exhausted'
            : normalizedCause === 'user-correction' || normalizedCause === 'user' ? 'user-correction'
              : normalizedCause === 'contradicted' ? 'fail-route' : 'manual'
      episode.transitions.push({ from: priorRoute, to: route, reason, sequence, evidenceActions: episode.route.evidenceActions })
    }
    episode.route = {
      route,
      source: String(args['source'] ?? 'model') === 'verifier' ? 'verifier' : String(args['source'] ?? '') === 'adaptive' ? 'adaptive' : 'model',
      ...(hypothesis ? { hypothesis } : {}),
      ...(falsifier ? { falsifier } : {}),
      ...(nextEvidence ? { nextEvidence } : {}),
      minEvidenceActions: min,
      maxEvidenceActions: max,
      evidenceActions: route === priorRoute ? episode.route.evidenceActions : 0,
      stallActions: 0,
      epistemic: (String(args['epistemic'] ?? 'plausible') as RouteContract['epistemic']),
      explicit: true,
      revision: episode.route.revision + 1,
    }
    episode.semanticVerification = semanticVerificationState(episode.contract, episode.route, options(inputOptions).semanticVerifierMode)
    episode.phase = phaseFor(episode.contract, episode.route, state.planMode)
    episode.recoveryBlocker = undefined
    refreshPolicyHint(state, inputOptions)
    return { ok: true, message: `route committed: ${route}; evidence budget ${min}-${max}` }
  }
  if (action === 'falsify') {
    episode.route.epistemic = 'contradicted'
    episode.route.stallActions = episode.route.maxEvidenceActions
    episode.phase = 'recover'
    const evidence = stringArg(args, 'evidence') ?? 'falsifier reported'
    progress(state, { kind: 'hypothesis-falsified', sequence, weight: 1, summary: evidence })
    refreshPolicyHint(state, inputOptions)
    return { ok: true, message: 'current hypothesis marked contradicted; reroute is now allowed' }
  }
  if (action === 'support') {
    episode.route.epistemic = 'supported'
    const evidence = stringArg(args, 'evidence') ?? 'supporting evidence reported'
    progress(state, { kind: 'hypothesis-supported', sequence, weight: 1, summary: evidence })
    refreshPolicyHint(state, inputOptions)
    return { ok: true, message: 'current hypothesis marked supported' }
  }
  if (action === 'accept' || action === 'waive') {
    const id = stringArg(args, 'obligation_id')
    if (!id) return { ok: false, message: 'obligation_id is required' }
    const obligation = episode.acceptance.get(id)
    if (!obligation) return { ok: false, message: `unknown acceptance obligation ${id}` }
    const evidence = stringArg(args, action === 'accept' ? 'evidence' : 'reason')
    if (!evidence) return { ok: false, message: `${action === 'accept' ? 'evidence' : 'reason'} is required` }
    if (action === 'accept') satisfyAcceptance(obligation, evidence, true)
    else waiveAcceptance(obligation, evidence)
    progress(state, { kind: 'acceptance-satisfied', sequence, weight: 0.5, summary: `${action}:${id}:${evidence}` })
    refreshPolicyHint(state, inputOptions)
    return { ok: true, message: `${id} ${action === 'accept' ? 'satisfied by explicit evidence' : 'waived with reason'}` }
  }
  return { ok: false, message: `unsupported coursekeeper_control action: ${action}` }
}

/** Canonical v0.7 name; applyTrajectoryControl remains a source-compatible legacy export. */
export function applyCoursekeeperControl(state: GovernorState, args: Record<string, unknown>, sequence = 0, inputOptions: Partial<StateOptions> = {}): ControlResult {
  return applyTrajectoryControl(state, args, sequence, inputOptions)
}

export function applyAdaptiveInitialRoute(
  state: GovernorState,
  decision: AdaptiveRouteDecision,
  inputOptions: Partial<StateOptions> = {},
): void {
  const episode = state.episode
  if (!episode) return
  episode.adaptive = decision
  const route = decision.appliedRoute
  if (route !== episode.route.route) {
    episode.route = routeContractForRoute(episode.contract, route, 'adaptive', episode.route.revision + 1)
    if (episode.humanRound <= 1 && episode.transitions.length === 0) episode.initialRoute = route
    episode.semanticVerification = semanticVerificationState(episode.contract, episode.route, options(inputOptions).semanticVerifierMode)
    episode.phase = phaseFor(episode.contract, episode.route, state.planMode)
  } else if (episode.humanRound <= 1 && episode.transitions.length === 0) episode.initialRoute = episode.route.route
  refreshPolicyHint(state, inputOptions, true)
}

export function applyAdaptiveEscalation(
  state: GovernorState,
  to: Route,
  reason: RouteTransitionReason,
  detail: string,
  sequence = 0,
  inputOptions: Partial<StateOptions> = {},
): ControlResult {
  const episode = state.episode
  if (!episode) return { ok: false, message: 'no active episode' }
  const from = episode.route.route
  if (from === to) return { ok: false, message: 'route unchanged' }
  const gateCause = reason === 'falsifier-hit' ? 'falsified' : reason === 'verifier-fail' ? 'verifier-fail' : reason === 'budget-exhausted' ? 'budget-exhausted' : reason
  const gate = canSwitchRoute(episode.route, gateCause)
  if (!gate.allowed) return { ok: false, message: gate.reason }
  episode.transitions.push({ from, to, reason, sequence, evidenceActions: episode.route.evidenceActions })
  episode.route = routeContractForRoute(episode.contract, to, 'adaptive', episode.route.revision + 1)
  episode.semanticVerification = semanticVerificationState(episode.contract, episode.route, options(inputOptions).semanticVerifierMode)
  episode.phase = routeRequiresExplicitCommit(to) ? 'recover' : phaseFor(episode.contract, episode.route, state.planMode)
  episode.recoveryBlocker = routeRequiresExplicitCommit(to)
    ? `Adaptive escalation selected ${to.toUpperCase()}: ${detail} Commit hypothesis, falsifier, and next evidence before broad mutation.`
    : undefined
  refreshPolicyHint(state, inputOptions, true)
  return { ok: true, message: `adaptive escalation ${from} -> ${to}: ${detail}` }
}

export function blockerReport(state: GovernorState, inputOptions: Partial<StateOptions> = {}): string {
  const blockers = completionBlockers(state, inputOptions)
  return [
    '<ck-blocked>',
    'Automatic completion recovery is exhausted. Do not claim success.',
    ...blockers.map(blocker => `- ${blocker}`),
    'Report the concrete blocker, evidence already collected, and the next evidence-bearing action.',
    '</ck-blocked>',
  ].join('\n')
}

export function verificationPrompt(state: GovernorState, inputOptions: Partial<StateOptions> = {}): string {
  const acceptance = state.episode ? openAcceptance(state.episode.acceptance.values()) : []
  const debts = openVerificationDebts(state.workspace)
  const bench = benchmarkBlocker(state, inputOptions)
  const lines = ['<ck-verify>']
  if (acceptance.length) {
    lines.push('acceptance:')
    for (const obligation of acceptance) lines.push(`- ${obligation.id}: ${obligation.description}`)
  }
  if (debts.length) {
    lines.push('verification:')
    for (const debt of debts) {
      const needs = [debt.requiresReadback && debt.readbackRevision !== debt.artifactRevision ? 'readback' : '', debt.requiresCommand && debt.commandRevision !== debt.artifactRevision ? 'test/build/check' : ''].filter(Boolean)
      lines.push(`- ${debt.artifact}@${debt.artifactRevision}: ${needs.join(' + ')}`)
    }
  }
  if (bench) lines.push(`benchmark: ${bench}`)
  if (state.episode?.recoveryBlocker) lines.push(`recovery: ${state.episode.recoveryBlocker}`)
  lines.push('Satisfy the minimum remaining obligation with an evidence-bearing action; otherwise report the blocker.')
  lines.push('</ck-verify>')
  return lines.join('\n')
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(block => {
    if (typeof block === 'string') return block
    if (typeof block !== 'object' || block === null) return ''
    const record = block as Record<string, unknown>
    if (typeof record['text'] === 'string') return record['text']
    if (Array.isArray(record['content'])) return contentText(record['content'])
    return ''
  }).join('\n')
}

function parseArgs(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { return {} }
}


function replayControlPacket(state: GovernorState, text: string): void {
  const episode = state.episode
  if (!episode || !text.includes('<ck>')) return
  const header = /rel=\S+\s+kind=\S+\s+route=(direct|inspect|plan|explore)\s+phase=(orient|inspect|design|construct|verify|recover|converge|blocked)\s+risk=\S+/i.exec(text)
  const control = /commit=(\d+)\/(\d+)-(\d+)\s+epistemic=(unsupported|plausible|supported|conflicted|contradicted)/i.exec(text)
  if (!header || !control) return
  const route = header[1] as Route
  const evidenceActions = Number(control[1])
  const minEvidenceActions = Number(control[2])
  const maxEvidenceActions = Number(control[3])
  const hypothesis = /^H=(.*)$/m.exec(text)?.[1]?.trim()
  const falsifier = /^K=(.*)$/m.exec(text)?.[1]?.trim()
  const nextEvidence = /^N=(.*)$/m.exec(text)?.[1]?.trim()
  episode.route = {
    ...episode.route,
    route,
    source: episode.route.source,
    ...(hypothesis ? { hypothesis } : { hypothesis: undefined }),
    ...(falsifier ? { falsifier } : { falsifier: undefined }),
    ...(nextEvidence ? { nextEvidence } : { nextEvidence: undefined }),
    minEvidenceActions,
    maxEvidenceActions,
    evidenceActions: Number.isFinite(evidenceActions) ? evidenceActions : episode.route.evidenceActions,
    epistemic: control[4] as RouteContract['epistemic'],
    explicit: !routeRequiresExplicitCommit(route) || Boolean(hypothesis && falsifier && nextEvidence),
  }
  episode.phase = header[2] as AgentPhase
}

export function rebuildStateFromEvents(events: readonly any[], inputOptions: Partial<StateOptions> = {}): GovernorState {
  const state = createGovernorState()
  for (const event of events) {
    const type = String(event?.type ?? '')
    const seq = Number(event?.seq ?? 0)
    if (type === 'plan/mode') {
      if (typeof event?.data?.active === 'boolean') state.planMode = event.data.active
      continue
    }
    if (type === 'user/message') {
      const source = event?.data?.source?.kind
      if (source !== 'user') {
        const plugin = String(event?.data?.source?.plugin ?? '')
        if (/^(?:trajectory-governor|coursekeeper)\/kernel/.test(plugin)) state.episode && (state.episode.kernelInjected = true)
        if (/^coursekeeper\/(?:kernel-policy|policy|verification|blocker-report)/.test(plugin)) replayControlPacket(state, contentText(event?.data?.content))
        continue
      }
      acceptHumanTask(state, contentText(event?.data?.content), Number(event?.data?.turn ?? 0), state.planMode, inputOptions)
      state.pendingHint = undefined
      state.injectedRevision = state.policyRevision
      continue
    }
    if (type === 'tool/call') {
      const toolName = String(event?.data?.name ?? '')
      const args = parseArgs(event?.data?.arguments)
      if (toolName === COURSEKEEPER_CONTROL_TOOL || toolName === LEGACY_TRAJECTORY_CONTROL_TOOL) {
        applyTrajectoryControl(state, (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>, seq, inputOptions)
      } else registerToolCall(state, String(event?.data?.callId ?? ''), toolName, args, seq, inputOptions)
      continue
    }
    if (type === 'tool/code-dispatch-start') {
      registerToolCall(state, String(event?.data?.subCallId ?? ''), String(event?.data?.name ?? ''), event?.data?.arguments, seq, inputOptions)
      continue
    }
    if (type === 'tool/result') {
      const block = event?.data?.message?.content?.[0]
      if (block?.type !== 'tool-result') continue
      settleToolCall(state, String(event?.data?.message?.source?.callId ?? ''), { isError: block?.isError === true, content: contentText(block?.content), meta: event?.data?.meta }, seq, inputOptions)
      continue
    }
    if (type === 'tool/code-dispatch') {
      settleToolCall(state, String(event?.data?.subCallId ?? ''), { isError: event?.data?.isError === true, content: contentText(event?.data?.content), meta: event?.data?.meta }, seq, inputOptions)
      continue
    }
  }
  state.pendingHint = undefined
  state.injectedRevision = state.policyRevision
  pruneVerificationDebts(state.workspace)
  return state
}
