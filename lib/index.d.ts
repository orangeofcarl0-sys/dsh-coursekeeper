/**
 * DSH Coursekeeper v0.7
 *
 * One control plane, four responsibilities:
 *   Router     -> select the evidence-acquisition route.
 *   Committer  -> keep that route until falsified or its evidence budget is satisfied.
 *   Verifier   -> enforce acceptance/verification/benchmark obligations before completion.
 *   Calibrator -> learn bounded personal route preferences from execution-grounded episodes.
 *
 * The plugin deliberately preserves the official system prompt, runtime contexts, and (in
 * default guard mode) tool schemas. Model-visible steering is a tiny near-field control packet.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AdaptiveReasoningMode, AugmentationProfile, CapabilityControlMode, GovernorMode, JSpaceAssistMode, RouterAssistMode, SemanticVerifierMode, AdaptiveRoutingMode, AdaptiveEscalationMode, RouteChallengerMode, RiskLevel, RolloutMode, BranchLearningMode } from './types.js';
export * from './core.js';
export * from './debt.js';
export * from './state.js';
export * from './types.js';
export * from './verifier.js';
export * from './profiles.js';
export * from './adaptive/index.js';
export * from './branching.js';
export * from './branching-store.js';
export declare const coursekeeperSettingsNamespace: import("@deepseek-ai/dsh-settings").SettingsNamespace;
export declare const CoursekeeperSettingsSchema: any;
export declare const name = "coursekeeper";
export declare const inject: string[];
export interface Config {
    mode?: GovernorMode;
    requireUserOptIn?: boolean;
    rolloutMode?: RolloutMode;
    branchLearning?: BranchLearningMode;
    branchExperienceMemory?: boolean;
    branchExperiencePath?: string;
    branchExperienceMaxEntries?: number;
    branchInitialCandidates?: number;
    branchMaxCandidates?: number;
    branchPivots?: number;
    maxBranchWavesPerEpisode?: number;
    branchAutoStart?: boolean;
    branchTriggerFailRoute?: boolean;
    branchTriggerNoProgress?: boolean;
    branchTriggerLowRouteMargin?: boolean;
    branchTriggerSemanticUnknown?: boolean;
    branchContaminationThreshold?: number;
    branchMinProbability?: number;
    branchSelectionMinScore?: number;
    branchSelectionMargin?: number;
    comparativeVerifierProvider?: string;
    comparativeVerifierModel?: string;
    comparativeVerifierMaxTokens?: number;
    maxComparativeVerifierCalls?: number;
    comparativeVerifierCriteria?: string[];
    exposeBranchTool?: boolean;
    crossProtocolWeight?: number;
    crossRolloutWeight?: number;
    augmentationProfile?: AugmentationProfile;
    jspaceAssist?: JSpaceAssistMode;
    routerAssist?: RouterAssistMode;
    semanticVerifier?: SemanticVerifierMode;
    semanticVerifierProvider?: string;
    semanticVerifierModel?: string;
    semanticVerifierMaxTokens?: number;
    maxSemanticVerifierCalls?: number;
    semanticVerifierFailOpen?: boolean;
    maxSemanticVerifierInfraFailures?: number;
    capabilityControl?: CapabilityControlMode;
    adaptiveReasoning?: AdaptiveReasoningMode | boolean;
    adaptiveRouting?: AdaptiveRoutingMode;
    adaptiveEscalation?: AdaptiveEscalationMode;
    routeChallenger?: RouteChallengerMode;
    routeChallengerMinRisk?: RiskLevel;
    maxRouteChallengesPerEpisode?: number;
    experienceMemory?: boolean;
    experiencePath?: string;
    experienceMaxEntries?: number;
    memoryTopK?: number;
    memoryMinSimilarity?: number;
    experienceHalfLifeDays?: number;
    bayesianCalibration?: boolean;
    bayesianPriorStrength?: number;
    memoryWeight?: number;
    bayesianWeight?: number;
    maxAdaptiveAdjustment?: number;
    minEffectiveSupport?: number;
    routeMarginThreshold?: number;
    safeExplorationRate?: number;
    crossProfileWeight?: number;
    crossModelWeight?: number;
    stalePolicyWeight?: number;
    harnessVersion?: string;
    modelRevision?: string;
    autoVerify?: boolean;
    maxAutomaticContinuations?: number;
    noInformationLimit?: number;
    maxDynamicHintChars?: number;
    exposeStatusTool?: boolean;
    exposeControlTool?: boolean;
    exposeSemanticVerifierTool?: boolean;
    ledger?: boolean;
    ledgerPath?: string;
    maxLedgerBytes?: number;
    benchmarkRequired?: boolean;
    benchmarkToolNames?: string[];
    verificationToolNames?: string[];
    finishToolNames?: string[];
    fullBenchmarkMinQueries?: number;
    fullBenchmarkMinRecall?: number;
    benchmarkScoreTolerancePercent?: number;
    stopRetryOnDeterministicErrors?: boolean;
    maxTrackedResults?: number;
}
export declare const Config: any;
export declare function apply(ctx: Context, inputConfig?: Config): void;
