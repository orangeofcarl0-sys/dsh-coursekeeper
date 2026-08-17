import type { AcceptanceObligation, BenchmarkComparisonResult, BenchmarkResult, Route, RouteContract, RiskLevel, TaskContract, TaskKind, TaskRelation, TaskVector, ToolSemantics, VerificationEvidence } from './types.js';
export declare const DEFAULT_BENCHMARK_TOOL_NAMES: readonly ["run_benchmark"];
export declare const DEFAULT_VERIFICATION_TOOL_NAMES: readonly ["build_project", "run_correctness_test"];
export declare const DEFAULT_FINISH_TOOL_NAMES: readonly ["finish"];
export declare const COURSEKEEPER_CONTROL_TOOL = "coursekeeper_control";
export declare const COURSEKEEPER_STATUS_TOOL = "coursekeeper_status";
export declare const COURSEKEEPER_VERIFY_TOOL = "coursekeeper_semantic_verify";
export declare const LEGACY_TRAJECTORY_CONTROL_TOOL = "trajectory_control";
export declare const LEGACY_TRAJECTORY_STATUS_TOOL = "trajectory_policy_status";
export declare const LEGACY_TRAJECTORY_VERIFY_TOOL = "trajectory_semantic_verify";
/** @deprecated use COURSEKEEPER_CONTROL_TOOL */
export declare const TRAJECTORY_CONTROL_TOOL = "coursekeeper_control";
/** @deprecated use COURSEKEEPER_STATUS_TOOL */
export declare const TRAJECTORY_STATUS_TOOL = "coursekeeper_status";
/** @deprecated use COURSEKEEPER_VERIFY_TOOL */
export declare const TRAJECTORY_VERIFY_TOOL = "coursekeeper_semantic_verify";
export declare function clamp01(value: number): number;
export declare function normalizeWhitespace(text: string): string;
export declare function fingerprint(value: unknown): string;
export declare function normalizePath(value: string): string;
export declare function sameArtifact(left: string, right: string): boolean;
export declare function lexicalSimilarity(left: string, right: string): number;
export declare function extractArtifacts(text: string): string[];
export declare function extractPathLike(text: string): string[];
export declare function extractSourceDependencies(content: string, artifactPath: string): string[];
export declare function taskKind(text: string): TaskKind;
export interface PreviousEpisodeContext {
    readonly objective: string;
    readonly artifacts: ReadonlySet<string>;
    readonly kind?: TaskKind;
}
export declare function taskRelation(text: string, artifacts: readonly string[], previous?: PreviousEpisodeContext): TaskRelation;
export declare function estimateTaskVector(text: string, kind: TaskKind, relation: TaskRelation, artifacts: readonly string[], complexity: number, risk: RiskLevel): TaskVector;
export declare function classifyTaskContract(rawText: string, previous?: PreviousEpisodeContext): TaskContract;
export interface RouteScores {
    direct: number;
    inspect: number;
    plan: number;
    explore: number;
}
export declare function routeScores(contract: TaskContract): RouteScores;
export declare function selectRoute(contract: TaskContract): Route;
export declare function routeContractForRoute(contract: TaskContract, route: Route, source?: RouteContract['source'], revision?: number): RouteContract;
export declare function defaultRouteContract(contract: TaskContract, revision?: number): RouteContract;
export declare function routeRequiresExplicitCommit(route: Route): boolean;
export declare function canSwitchRoute(contract: RouteContract, cause: string): {
    allowed: boolean;
    reason: string;
};
export declare function initialPhase(contract: TaskContract, route: Route, planMode: boolean): import('./types.js').AgentPhase;
export declare function createAcceptanceObligations(contract: TaskContract): AcceptanceObligation[];
export declare function staticKernel(): string;
export declare function controlPacket(contract: TaskContract, route: RouteContract, phase: string, openAcceptance: number, openVerification: number, recovery: boolean, maxChars?: number): string;
export interface ToolClassificationOptions {
    readonly benchmarkToolNames?: readonly string[];
    readonly verificationToolNames?: readonly string[];
    readonly finishToolNames?: readonly string[];
    readonly controlToolNames?: readonly string[];
}
export declare function classifyTool(name: string, rawArguments: unknown, options?: ToolClassificationOptions): ToolSemantics;
export declare function relevantObservation(semantics: ToolSemantics, contract: TaskContract, route: RouteContract): boolean;
export declare function mutationNeedsExplicitCommit(route: RouteContract): boolean;
export declare function mutationAllowed(route: RouteContract, relevantEvidenceObserved: boolean): {
    allowed: boolean;
    reason?: string;
};
export declare function parseBenchmarkResult(content: string, meta?: unknown, fallbackId?: string): BenchmarkResult | undefined;
export declare function benchmarkSpecKey(result: Omit<BenchmarkResult, 'specKey' | 'qps' | 'recall'> & Partial<Pick<BenchmarkResult, 'qps' | 'recall'>>): string;
export declare function isFullBenchmark(result: BenchmarkResult, minQueries: number, minRecall: number): boolean;
export declare function compareBenchmarkResults(candidate: BenchmarkResult, baseline: BenchmarkResult, tolerancePercent: number): BenchmarkComparisonResult;
export declare function verificationEvidenceFromTool(semantics: ToolSemantics, sequence: number, workspaceRevision: number, artifactRevisions: Readonly<Record<string, number>>): VerificationEvidence | undefined;
export declare function hasCommandFailure(content: string): boolean;
export declare function isTerminalLlmFailure(failure: unknown): boolean;
