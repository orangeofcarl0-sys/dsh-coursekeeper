export type TaskRelation = 'new' | 'continuation' | 'extension' | 'correction' | 'clarification'
export type TaskKind = 'build' | 'fix' | 'review' | 'analysis' | 'research' | 'conversation' | 'unknown'
export type Route = 'direct' | 'inspect' | 'plan' | 'explore'
export type AgentPhase = 'orient' | 'inspect' | 'design' | 'construct' | 'verify' | 'recover' | 'converge' | 'blocked'
export type RiskLevel = 'low' | 'medium' | 'high'
export type EpistemicStatus = 'unsupported' | 'plausible' | 'supported' | 'conflicted' | 'contradicted'
export type ToolEffect = 'observe' | 'mutate' | 'verify' | 'benchmark' | 'finish' | 'interact' | 'delegate' | 'control' | 'unknown'
export type CapabilityControlMode = 'advisory' | 'guard' | 'restrict'
export type AdaptiveReasoningMode = 'off' | 'episode' | 'phase'
export type GovernorMode = 'off' | 'shadow' | 'active'
export type AdaptiveRoutingMode = 'off' | 'shadow' | 'active'
export type AdaptiveEscalationMode = 'off' | 'rules' | 'calibrated'
export type RouteChallengerMode = 'off' | 'risk'
export type AugmentationProfile = 'governor' | 'jspace-assist' | 'router-assist' | 'hybrid-assist' | 'native-canonical'
export type JSpaceAssistMode = 'off' | 'lite' | 'legacy'
export type RouterAssistMode = 'off' | 'minimal-first' | 'task-aware'
export type SemanticVerifierMode = 'off' | 'risk' | 'always'
export type RolloutMode = 'single' | 'verified-branching'
export type BranchLearningMode = 'off' | 'shadow' | 'active'
export type BranchTriggerReason = 'fail-route' | 'no-progress' | 'low-route-margin' | 'semantic-unknown' | 'semantic-fail' | 'contaminated' | 'manual'
export type BranchStatus = 'idle' | 'suggested' | 'collecting' | 'comparing' | 'selected' | 'no-valid-candidate' | 'applied' | 'blocked'
export type WorkspaceForkCapability = 'none' | 'restart' | 'pre-mutation' | 'arbitrary'
export type BranchCandidateOrigin = 'current' | 'fresh' | 'route-alternate' | 'external'
export type ComparativeVerifierDecision = 'a' | 'b' | 'tie' | 'no_valid_candidate'
export type SemanticVerificationStatus = 'not-required' | 'pending' | 'running' | 'passed' | 'warn' | 'failed' | 'unknown'
export type ProgressKind =
  | 'new-artifact-observed'
  | 'hypothesis-supported'
  | 'hypothesis-falsified'
  | 'acceptance-satisfied'
  | 'verification-satisfied'
  | 'benchmark-improved'
  | 'new-failure-mode'
  | 'constraint-established'
  | 'result-novel'
  | 'no-progress'


export type RouteTransitionReason =
  | 'insufficient-evidence'
  | 'coupling-discovered'
  | 'uncertainty-discovered'
  | 'falsifier-hit'
  | 'fail-route'
  | 'verifier-fail'
  | 'budget-exhausted'
  | 'converged'
  | 'challenger'
  | 'user-correction'
  | 'manual'

export type EpisodeCompletion = 'success' | 'blocked' | 'abandoned' | 'unknown'

export interface CalibrationDomain {
  readonly providerFamily: string
  readonly modelFamily: string
  readonly modelRevision: string
  readonly augmentationProfile: AugmentationProfile
  readonly harnessVersion: string
  readonly policySchemaVersion: string
  readonly protocolFingerprint: string
  readonly rolloutMode: RolloutMode
}

export interface TaskSignature {
  readonly version: 1
  readonly kind: TaskKind
  readonly relation: TaskRelation
  readonly risk: RiskLevel
  readonly complexity: number
  readonly coupling: number
  readonly uncertainty: number
  readonly observability: number
  readonly novelty: number
  readonly artifactCountBin: 0 | 1 | 2 | 3
  readonly continuity: boolean
  readonly deterministicOracle: boolean
  readonly objectiveHash: string
  readonly objectiveSimHash: string
  readonly workspaceHash: string
}

export interface RouteTransition {
  readonly from: Route
  readonly to: Route
  readonly reason: RouteTransitionReason
  readonly sequence: number
  readonly evidenceActions: number
}

export interface RouteExperienceMetrics {
  readonly requests: number
  readonly steps: number
  readonly toolCalls: number
  readonly evidenceActions: number
  readonly verifierCalls: number
  readonly routeChallenges: number
  readonly reroutes: number
  readonly recoveries: number
  readonly inputTokens?: number
  readonly cachedInputTokens?: number
  readonly reasoningTokens?: number
}

export interface RouteExperience {
  readonly schemaVersion: 1
  readonly id: string
  readonly at: string
  readonly domain: CalibrationDomain
  readonly task: TaskSignature
  readonly initialRoute: Route
  readonly finalRoute: Route
  readonly transitions: readonly RouteTransition[]
  readonly completion: EpisodeCompletion
  readonly verifierDecision?: 'pass' | 'warn' | 'patch' | 'fail_route' | 'unknown'
  readonly obligations: {
    readonly acceptanceCleared: boolean
    readonly verificationCleared: boolean
    readonly benchmarkCleared: boolean
  }
  readonly metrics: RouteExperienceMetrics
  readonly routeSignals: Partial<Record<Route, number>>
  readonly externalFailure: boolean
}

export interface RoutePrior {
  readonly eligible: readonly Route[]
  readonly scores: Readonly<Record<Route, number>>
  readonly preferred: Route
}

export interface BayesianRouteEstimate {
  readonly alpha: number
  readonly beta: number
  readonly mean: number
  readonly effectiveN: number
}

export interface AdaptiveRouteDecision {
  readonly mode: AdaptiveRoutingMode
  readonly bucket: string
  readonly baseRoute: Route
  readonly adaptiveRoute: Route
  readonly appliedRoute: Route
  readonly baseScores: Readonly<Record<Route, number>>
  readonly fusedScores: Readonly<Record<Route, number>>
  readonly eligible: readonly Route[]
  readonly margin: number
  readonly effectiveSupport: number
  readonly memoryAdjustment: Readonly<Partial<Record<Route, number>>>
  readonly bayesianAdjustment: Readonly<Partial<Record<Route, number>>>
  readonly bayesian: Readonly<Partial<Record<Route, BayesianRouteEstimate>>>
  readonly challengerEligible: boolean
  readonly challenged: boolean
  readonly reason: string
}

export interface GeneratorProtocolDescriptor {
  readonly profile: string
  readonly fingerprint: string
}

export interface VerifierProtocolDescriptor {
  readonly profile: string
  readonly modelFamily: string
  readonly providerFamily: string
  readonly context: 'fresh'
  readonly includesGeneratorReasoning: false
  readonly scoring?: 'structured' | 'fine-grained-logprob' | 'external'
}

export interface BranchEvidence {
  readonly summary: string
  readonly artifacts: readonly string[]
  readonly commands: readonly string[]
  readonly outputs: readonly string[]
  readonly unresolvedErrors: readonly string[]
  readonly acceptanceSatisfied?: boolean
  readonly verificationPassed?: boolean
  readonly benchmarkPassed?: boolean
  readonly patch?: string
}

export interface BranchCandidate {
  readonly id: string
  readonly origin: BranchCandidateOrigin
  readonly route?: Route
  readonly workspaceRef?: string
  readonly fingerprint: string
  readonly evidence: BranchEvidence
  readonly createdAt: string
}

export interface BranchCandidateAssessment {
  readonly candidateId: string
  readonly verdict: 'pass' | 'fail' | 'unknown'
  readonly score: number
  readonly reasons: readonly string[]
}

export interface ComparativeVerifierResult {
  readonly decision: ComparativeVerifierDecision
  readonly scoreA: number
  readonly scoreB: number
  readonly confidence: number
  readonly criterionScores?: Readonly<Record<string, { a: number; b: number }>>
  readonly reason: string
}

export interface BranchSelection {
  readonly candidateId?: string
  readonly status: 'selected' | 'expand' | 'no-valid-candidate'
  readonly margin: number
  readonly reason: string
}

export interface BranchWaveState {
  readonly id: number
  status: BranchStatus
  readonly startedAt: string
  readonly triggers: BranchTriggerReason[]
  contamination: number
  checkpointKind: WorkspaceForkCapability
  checkpointRef?: string
  readonly candidates: Map<string, BranchCandidate>
  selectedCandidateId?: string
  selectionReason?: string
  comparisonCount: number
  verifierCalls: number
  wave: number
  requiresReverify: boolean
}

export interface BranchEpisodeState {
  wavesStarted: number
  current?: BranchWaveState
  lastOutcome?: 'not-used' | 'selected-original' | 'selected-alternate' | 'no-valid-candidate' | 'blocked'
  lastTrigger?: BranchTriggerReason
}

export interface BranchExperience {
  readonly schemaVersion: 1
  readonly id: string
  readonly at: string
  readonly domain: CalibrationDomain
  readonly generatorProtocol: GeneratorProtocolDescriptor
  readonly verifierProtocol: VerifierProtocolDescriptor
  readonly task: TaskSignature
  readonly triggers: readonly BranchTriggerReason[]
  readonly contamination: number
  readonly candidateCount: number
  readonly selectedOrigin?: BranchCandidateOrigin
  readonly selectedDifferentFromCurrent: boolean
  readonly finalReverifyPassed: boolean
  readonly useful: boolean
  readonly externalFailure: boolean
  readonly incrementalCost: {
    readonly verifierCalls: number
    readonly branchCandidates: number
    readonly inputTokens?: number
    readonly cachedInputTokens?: number
    readonly reasoningTokens?: number
  }
}

export interface BayesianBranchEstimate {
  readonly alpha: number
  readonly beta: number
  readonly mean: number
  readonly effectiveN: number
}

export interface BranchTriggerDecision {
  readonly eligible: boolean
  readonly triggers: readonly BranchTriggerReason[]
  readonly contamination: number
  readonly calibratedProbability: number
  readonly effectiveSupport: number
  readonly reason: string
}

export interface TaskVector {
  uncertainty: number
  horizon: number
  coupling: number
  observability: number
  risk: number
  novelty: number
}

export interface TaskContract {
  readonly objective: string
  readonly relation: TaskRelation
  readonly kind: TaskKind
  readonly complexity: number
  readonly risk: RiskLevel
  readonly artifacts: readonly string[]
  readonly acceptanceHints: readonly string[]
  readonly evidencePolicy: readonly string[]
  readonly vector: TaskVector
}

export interface RouteContract {
  route: Route
  source: 'auto' | 'adaptive' | 'model' | 'verifier' | 'user'
  hypothesis?: string
  falsifier?: string
  nextEvidence?: string
  minEvidenceActions: number
  maxEvidenceActions: number
  evidenceActions: number
  stallActions: number
  epistemic: EpistemicStatus
  explicit: boolean
  revision: number
}

export type AcceptanceStatus = 'open' | 'satisfied' | 'waived'

export interface AcceptanceObligation {
  readonly id: string
  readonly description: string
  readonly kind: 'deliverable' | 'relevant-change' | 'grounding' | 'scope' | 'custom'
  readonly targetArtifacts: readonly string[]
  status: AcceptanceStatus
  evidence: string[]
  selfAttested: boolean
}

export interface ArtifactState {
  readonly path: string
  revision: number
  lastMutationSeq?: number
  lastObservationSeq?: number
  dependencies: Set<string>
  dependents: Set<string>
}

export interface VerificationDebt {
  readonly id: string
  readonly artifact: string
  readonly artifactRevision: number
  readonly workspaceRevision: number
  readonly requiresReadback: boolean
  readonly requiresCommand: boolean
  readbackRevision?: number
  commandRevision?: number
  waived: boolean
}

export interface VerificationEvidence {
  readonly kind: 'readback' | 'test' | 'build' | 'lint' | 'check' | 'command'
  readonly scope: readonly string[] | 'workspace'
  readonly sequence: number
  readonly workspaceRevision: number
  readonly artifactRevisions: Readonly<Record<string, number>>
  readonly summary: string
}

export interface ProgressEvent {
  readonly kind: ProgressKind
  readonly sequence: number
  readonly weight: number
  readonly summary: string
  readonly artifacts?: readonly string[]
}

export interface ToolSemantics {
  readonly name: string
  readonly effect: ToolEffect
  readonly artifacts: readonly string[]
  readonly operation?: string
  readonly riskyMutation?: boolean
  readonly signature: string
  readonly verificationScope?: readonly string[] | 'workspace'
}

export interface CallState {
  readonly semantics: ToolSemantics
  readonly sequence: number
  readonly args: unknown
}

export interface BenchmarkResult {
  readonly benchmarkId: string
  readonly dataset?: string
  readonly totalQueries: number
  readonly recall: number
  readonly qps: number
  readonly concurrency?: number
  readonly warmup?: number
  readonly hardware?: string
  readonly specKey: string
}

export type BenchmarkComparison = 'improved' | 'within-tolerance' | 'regressed' | 'different-spec'

export interface BenchmarkComparisonResult {
  readonly outcome: BenchmarkComparison
  readonly deltaPercent?: number
}

export interface BenchmarkRecord {
  readonly result: BenchmarkResult
  readonly sequence: number
  readonly workspaceRevision: number
}

export interface EpisodeBenchmarkState {
  seen: boolean
  currentRevisionPassed?: number
  latest?: BenchmarkRecord
  readonly bestBySpec: Map<string, BenchmarkRecord>
  blocker?: string
  stagnantFullBenchmarks: number
}


export interface SemanticVerificationState {
  required: boolean
  status: SemanticVerificationStatus
  attempts: number
  verifiedWorkspaceRevision?: number
  decision?: 'pass' | 'warn' | 'patch' | 'fail_route' | 'unknown'
  reason?: string
  contradictions: string[]
  nextEvidence: string[]
}

export interface EpisodeState {
  id: number
  initialRoute: Route
  readonly transitions: RouteTransition[]
  adaptive?: AdaptiveRouteDecision
  humanRound: number
  contract: TaskContract
  route: RouteContract
  phase: AgentPhase
  readonly acceptance: Map<string, AcceptanceObligation>
  readonly evidence: ProgressEvent[]
  readonly resultFingerprints: Set<string>
  benchmark: EpisodeBenchmarkState
  semanticVerification: SemanticVerificationState
  branching: BranchEpisodeState
  recoveryBlocker?: string
  blockedReason?: string
  effortOverride?: string
  kernelInjected: boolean
}

export interface WorkspaceState {
  revision: number
  readonly artifacts: Map<string, ArtifactState>
  readonly verificationDebt: Map<string, VerificationDebt>
  readonly verificationEvidence: VerificationEvidence[]
}

export interface TurnState {
  turn: number
  automaticContinuations: number
  blockerReported: boolean
  readonly calls: Map<string, CallState>
}

export interface GovernorState {
  episodeCounter: number
  humanMessages: number
  planMode: boolean
  readonly workspace: WorkspaceState
  episode?: EpisodeState
  turn?: TurnState
  lastObjective?: string
  readonly knownArtifacts: Set<string>
  readonly recentEpisodes: Array<{ objective: string; artifacts: Set<string> }>
  policyRevision: number
  injectedRevision: number
  pendingHint?: string
  assemblyHash?: string
  noInformationStreak: number
  repeatedCallCount: number
  lastCallSignature?: string
}

export interface GovernorPolicyConfig {
  maxDynamicHintChars: number
  noInformationLimit: number
  fullBenchmarkMinQueries: number
  fullBenchmarkMinRecall: number
  benchmarkScoreTolerancePercent: number
}
