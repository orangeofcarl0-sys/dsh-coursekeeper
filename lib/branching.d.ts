import type { BayesianBranchEstimate, BranchCandidate, BranchCandidateAssessment, BranchEvidence, BranchExperience, BranchSelection, BranchTriggerDecision, BranchTriggerReason, CalibrationDomain, ComparativeVerifierResult, GovernorState, TaskSignature, VerifierProtocolDescriptor, WorkspaceForkCapability } from './types.js';
import { type DomainWeightOptions } from './adaptive/similarity.js';
export interface BranchPolicyOptions extends DomainWeightOptions {
    readonly enabled: boolean;
    readonly triggerFailRoute: boolean;
    readonly triggerNoProgress: boolean;
    readonly triggerLowRouteMargin: boolean;
    readonly triggerSemanticUnknown: boolean;
    readonly contaminationThreshold: number;
    readonly routeMarginThreshold: number;
    readonly minBranchProbability: number;
    readonly priorStrength: number;
    readonly halfLifeDays: number;
}
export interface SelectionPolicyOptions {
    readonly minScore: number;
    readonly margin: number;
}
export interface BranchCheckpoint {
    readonly capability: WorkspaceForkCapability;
    readonly ref?: string;
    readonly reason?: string;
}
export interface WorkspaceForkProvider {
    readonly capability: WorkspaceForkCapability;
    checkpoint(input: {
        readonly episodeId: number;
        readonly workspaceRevision: number;
        readonly preferred: 'restart' | 'pre-mutation';
    }): Promise<BranchCheckpoint>;
    fork(checkpoint: BranchCheckpoint, candidateId: string): Promise<{
        workspaceRef: string;
    }>;
    apply(candidate: BranchCandidate): Promise<{
        ok: boolean;
        artifacts?: readonly string[];
        reason?: string;
    }>;
    dispose?(workspaceRef: string): Promise<void>;
}
export interface BranchExecutor {
    execute(input: {
        readonly candidateId: string;
        readonly workspaceRef: string;
        readonly objective: string;
        readonly route?: string;
        readonly freshContext: true;
        readonly includeGeneratorReasoning: false;
    }): Promise<Omit<BranchCandidate, 'id' | 'origin' | 'workspaceRef' | 'fingerprint' | 'createdAt'> & {
        route?: BranchCandidate['route'];
    }>;
}
export interface ComparativeVerifierBackend {
    readonly scoring: 'structured' | 'fine-grained-logprob' | 'external';
    compare(input: {
        readonly objective: string;
        readonly candidateA: BranchCandidate;
        readonly candidateB: BranchCandidate;
        readonly criteria: readonly string[];
        readonly protocol: VerifierProtocolDescriptor;
    }, signal?: AbortSignal): Promise<ComparativeVerifierResult | string | undefined>;
}
export interface BranchRuntimeProvider {
    readonly workspace: WorkspaceForkProvider;
    readonly executor: BranchExecutor;
}
export declare function sanitizeBranchEvidence(input: BranchEvidence): BranchEvidence;
export declare function branchCandidateFingerprint(input: {
    readonly origin: string;
    readonly route?: string;
    readonly evidence: BranchEvidence;
}): string;
export declare function createBranchCandidate(input: Omit<BranchCandidate, 'fingerprint' | 'createdAt'> & {
    fingerprint?: string;
    createdAt?: string;
}): BranchCandidate;
export declare function trajectoryContaminationScore(state: GovernorState): number;
export declare function bayesianBranchEstimate(experiences: readonly BranchExperience[], task: TaskSignature, triggers: readonly BranchTriggerReason[], domain: CalibrationDomain, options: Pick<BranchPolicyOptions, 'priorStrength' | 'halfLifeDays' | 'crossProfileWeight' | 'crossModelWeight' | 'stalePolicyWeight'>): BayesianBranchEstimate;
export declare function branchTriggerDecision(state: GovernorState, task: TaskSignature, domain: CalibrationDomain, experiences: readonly BranchExperience[], options: BranchPolicyOptions): BranchTriggerDecision;
export declare function assessCandidate(candidate: BranchCandidate): BranchCandidateAssessment;
export declare function deduplicateCandidates(candidates: readonly BranchCandidate[]): {
    unique: BranchCandidate[];
    duplicates: string[];
};
export declare function deterministicPrefilter(candidates: readonly BranchCandidate[]): {
    readonly survivors: BranchCandidate[];
    readonly assessments: readonly BranchCandidateAssessment[];
    readonly selectedCandidateId?: string;
    readonly noValidCandidate: boolean;
};
export declare const DEFAULT_COMPARATIVE_CRITERIA: readonly ["acceptance", "evidence", "errors"];
export declare function comparativeVerifierPrompt(objective: string, a: BranchCandidate, b: BranchCandidate, criteria?: readonly string[]): string;
export declare function parseComparativeVerifierResult(text: string): ComparativeVerifierResult | undefined;
export declare function selectPair(a: BranchCandidate, b: BranchCandidate, result: ComparativeVerifierResult, options: SelectionPolicyOptions): BranchSelection;
export interface BranchTournamentResult {
    readonly winnerId?: string;
    readonly ranking: readonly {
        candidateId: string;
        preference: number;
        evidenceScore: number;
    }[];
    readonly margin: number;
    readonly noValidCandidate: boolean;
    readonly comparisons: number;
}
export declare function branchRingPairs<T>(items: readonly T[]): Array<[T, T]>;
export declare function branchPivotRoundPairs<T extends {
    id: string;
}>(items: readonly T[], pivotIds: readonly string[]): Array<[T, T]>;
export declare function branchSoftWin(scoreA: number, scoreB: number): number;
export declare function buildBranchExperience(input: {
    readonly domain: CalibrationDomain;
    readonly generatorProtocol: {
        profile: string;
        fingerprint: string;
    };
    readonly verifierProtocol: VerifierProtocolDescriptor;
    readonly task: TaskSignature;
    readonly triggers: readonly BranchTriggerReason[];
    readonly contamination: number;
    readonly candidates: readonly BranchCandidate[];
    readonly selectedCandidateId?: string;
    readonly finalReverifyPassed: boolean;
    readonly externalFailure: boolean;
    readonly verifierCalls: number;
    readonly inputTokens?: number;
    readonly cachedInputTokens?: number;
    readonly reasoningTokens?: number;
}): BranchExperience;
