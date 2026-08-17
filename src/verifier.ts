import type { AcceptanceObligation, GovernorState, ProgressEvent, RouteContract, VerificationDebt } from './types.js'
import { openAcceptance, openVerificationDebts } from './debt.js'
import { benchmarkBlocker } from './state.js'

export interface EvidencePacket {
  readonly episodeId: number
  readonly objective: string
  readonly route: RouteContract
  readonly openAcceptance: readonly Pick<AcceptanceObligation, 'id' | 'description' | 'kind' | 'targetArtifacts'>[]
  readonly openVerification: readonly Pick<VerificationDebt, 'id' | 'artifact' | 'artifactRevision' | 'requiresReadback' | 'requiresCommand'>[]
  readonly recentEvidence: readonly ProgressEvent[]
  readonly benchmarkBlocker?: string
  readonly recoveryBlocker?: string
  readonly workspaceRevision: number
}

export type SemanticVerifierDecision = 'pass' | 'warn' | 'patch' | 'fail_route' | 'unknown'

export interface SemanticVerifierResult {
  readonly decision: SemanticVerifierDecision
  readonly failedObligations: readonly string[]
  readonly contradictions: readonly string[]
  readonly nextEvidence: readonly string[]
  readonly patchedHypothesis?: string
  readonly reason: string
}

export interface SemanticVerifier {
  verify(packet: EvidencePacket, signal?: AbortSignal): Promise<SemanticVerifierResult>
}

export function buildEvidencePacket(state: GovernorState): EvidencePacket | undefined {
  const episode = state.episode
  if (!episode) return undefined
  const packet: EvidencePacket = {
    episodeId: episode.id,
    objective: episode.contract.objective,
    route: { ...episode.route },
    openAcceptance: openAcceptance(episode.acceptance.values()).map(item => ({
      id: item.id,
      description: item.description,
      kind: item.kind,
      targetArtifacts: item.targetArtifacts,
    })),
    openVerification: openVerificationDebts(state.workspace).map(debt => ({
      id: debt.id,
      artifact: debt.artifact,
      artifactRevision: debt.artifactRevision,
      requiresReadback: debt.requiresReadback,
      requiresCommand: debt.requiresCommand,
    })),
    recentEvidence: episode.evidence.slice(-12),
    workspaceRevision: state.workspace.revision,
  }
  const benchmark = benchmarkBlocker(state)
  if (benchmark) (packet as { benchmarkBlocker?: string }).benchmarkBlocker = benchmark
  if (episode.recoveryBlocker) (packet as { recoveryBlocker?: string }).recoveryBlocker = episode.recoveryBlocker
  return packet
}

export function verifierPrompt(packet: EvidencePacket): string {
  return [
    'You are an independent evidence verifier. Do not continue the main reasoning narrative.',
    'Judge only whether the claims/obligations are supported by the supplied evidence packet.',
    'Return strict JSON with decision, failedObligations, contradictions, nextEvidence, optional patchedHypothesis, and reason.',
    'Use fail_route only when the current route itself is inappropriate; use patch when only the working hypothesis should change.',
    JSON.stringify(packet),
  ].join('\n')
}

export function parseSemanticVerifierResult(text: string): SemanticVerifierResult | undefined {
  let parsed: unknown
  try { parsed = JSON.parse(text.trim()) } catch { return undefined }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const record = parsed as Record<string, unknown>
  const decision = String(record['decision'] ?? '') as SemanticVerifierDecision
  if (!['pass', 'warn', 'patch', 'fail_route', 'unknown'].includes(decision)) return undefined
  const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
  const result: SemanticVerifierResult = {
    decision,
    failedObligations: strings(record['failedObligations']),
    contradictions: strings(record['contradictions']),
    nextEvidence: strings(record['nextEvidence']),
    reason: typeof record['reason'] === 'string' ? record['reason'] : '',
  }
  if (typeof record['patchedHypothesis'] === 'string' && record['patchedHypothesis'].trim()) {
    return { ...result, patchedHypothesis: record['patchedHypothesis'] }
  }
  return result
}

export function shouldRequireSemanticVerification(
  state: GovernorState,
  mode: 'off' | 'risk' | 'always',
): boolean {
  if (mode === 'off' || !state.episode || state.episode.contract.kind === 'conversation') return false
  if (mode === 'always') return true
  const episode = state.episode
  return episode.contract.risk === 'high'
    || episode.route.route === 'plan'
    || episode.route.route === 'explore'
    || episode.contract.kind === 'research'
}

export function resetSemanticVerification(state: GovernorState): void {
  const semantic = state.episode?.semanticVerification
  if (!semantic) return
  semantic.status = semantic.required ? 'pending' : 'not-required'
  semantic.verifiedWorkspaceRevision = undefined
  semantic.decision = undefined
  semantic.reason = undefined
  semantic.contradictions = []
  semantic.nextEvidence = []
}

export function applySemanticVerifierResult(
  state: GovernorState,
  result: SemanticVerifierResult,
): { rerouteAllowed: boolean; message: string } {
  const episode = state.episode
  if (!episode) return { rerouteAllowed: false, message: 'no active episode' }
  const semantic = episode.semanticVerification
  semantic.attempts++
  semantic.decision = result.decision
  semantic.reason = result.reason
  semantic.contradictions = [...result.contradictions]
  semantic.nextEvidence = [...result.nextEvidence]
  semantic.verifiedWorkspaceRevision = state.workspace.revision

  if (result.decision === 'pass') {
    semantic.status = 'passed'
    return { rerouteAllowed: false, message: 'semantic verifier passed the current evidence packet' }
  }
  if (result.decision === 'warn') {
    semantic.status = 'warn'
    return { rerouteAllowed: false, message: 'semantic verifier returned warnings; completion remains blocked until resolved or explicitly waived' }
  }
  if (result.decision === 'patch') {
    semantic.status = 'failed'
    if (result.patchedHypothesis) {
      episode.route.hypothesis = result.patchedHypothesis
      episode.route.epistemic = 'plausible'
      episode.route.evidenceActions = 0
      episode.route.stallActions = 0
      episode.route.revision++
      if (result.nextEvidence[0]) episode.route.nextEvidence = result.nextEvidence[0]
    }
    return { rerouteAllowed: false, message: 'semantic verifier patched the working hypothesis; route is preserved' }
  }
  if (result.decision === 'fail_route') {
    semantic.status = 'failed'
    episode.route.epistemic = 'contradicted'
    episode.route.stallActions = episode.route.maxEvidenceActions
    return { rerouteAllowed: true, message: 'semantic verifier rejected the current route; reroute is allowed' }
  }
  semantic.status = 'unknown'
  return { rerouteAllowed: false, message: 'semantic verifier could not decide; more evidence is required' }
}
