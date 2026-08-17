import type { AcceptanceObligation, GovernorState, ProgressEvent, RouteContract, VerificationDebt } from './types.js';
export interface EvidencePacket {
    readonly episodeId: number;
    readonly objective: string;
    readonly route: RouteContract;
    readonly openAcceptance: readonly Pick<AcceptanceObligation, 'id' | 'description' | 'kind' | 'targetArtifacts'>[];
    readonly openVerification: readonly Pick<VerificationDebt, 'id' | 'artifact' | 'artifactRevision' | 'requiresReadback' | 'requiresCommand'>[];
    readonly recentEvidence: readonly ProgressEvent[];
    readonly benchmarkBlocker?: string;
    readonly recoveryBlocker?: string;
    readonly workspaceRevision: number;
}
export type SemanticVerifierDecision = 'pass' | 'warn' | 'patch' | 'fail_route' | 'unknown';
export interface SemanticVerifierResult {
    readonly decision: SemanticVerifierDecision;
    readonly failedObligations: readonly string[];
    readonly contradictions: readonly string[];
    readonly nextEvidence: readonly string[];
    readonly patchedHypothesis?: string;
    readonly reason: string;
}
export interface SemanticVerifier {
    verify(packet: EvidencePacket, signal?: AbortSignal): Promise<SemanticVerifierResult>;
}
export declare function buildEvidencePacket(state: GovernorState): EvidencePacket | undefined;
export declare function verifierPrompt(packet: EvidencePacket): string;
export declare function parseSemanticVerifierResult(text: string): SemanticVerifierResult | undefined;
export declare function shouldRequireSemanticVerification(state: GovernorState, mode: 'off' | 'risk' | 'always'): boolean;
export declare function resetSemanticVerification(state: GovernorState): void;
export declare function applySemanticVerifierResult(state: GovernorState, result: SemanticVerifierResult): {
    rerouteAllowed: boolean;
    message: string;
};
