import type { GovernorPolicyConfig, GovernorState, ProgressEvent, Route, AdaptiveRouteDecision, RouteTransitionReason, ToolSemantics, BranchCandidate, BranchTriggerDecision, WorkspaceForkCapability } from './types.js';
export interface StateOptions extends GovernorPolicyConfig {
    semanticVerifierMode?: 'off' | 'risk' | 'always';
    benchmarkRequired?: boolean;
    benchmarkToolNames?: readonly string[];
    verificationToolNames?: readonly string[];
    finishToolNames?: readonly string[];
}
export declare const DEFAULT_STATE_OPTIONS: StateOptions;
export declare function createGovernorState(): GovernorState;
export declare function acceptHumanTask(state: GovernorState, rawText: string, turn: number, planMode?: boolean, inputOptions?: Partial<StateOptions>): void;
export declare function startBranchWave(state: GovernorState, decision: BranchTriggerDecision, checkpointKind: WorkspaceForkCapability, checkpointRef?: string): {
    ok: boolean;
    message: string;
    waveId?: number;
};
export declare function registerBranchCandidate(state: GovernorState, candidate: BranchCandidate): {
    ok: boolean;
    message: string;
    duplicateOf?: string;
};
export declare function recordBranchSelection(state: GovernorState, candidateId: string, reason: string): {
    ok: boolean;
    message: string;
};
export declare function recordNoValidBranchCandidate(state: GovernorState, reason: string): void;
export declare function reopenAfterBranchApply(state: GovernorState, candidate: BranchCandidate, sequence?: number, inputOptions?: Partial<StateOptions>): {
    ok: boolean;
    message: string;
    workspaceRevision: number;
};
export declare function settleBranchReverification(state: GovernorState, passed: boolean): void;
export declare function openAcceptanceCount(state: GovernorState): number;
export declare function openVerificationCount(state: GovernorState): number;
export declare function benchmarkBlocker(state: GovernorState, inputOptions?: Partial<StateOptions>): string | undefined;
export declare function completionBlockers(state: GovernorState, inputOptions?: Partial<StateOptions>): string[];
export declare function canFinish(state: GovernorState, inputOptions?: Partial<StateOptions>): boolean;
export declare function currentControlPacket(state: GovernorState, inputOptions?: Partial<StateOptions>): string | undefined;
export declare function refreshPolicyHint(state: GovernorState, inputOptions?: Partial<StateOptions>, includeKernel?: boolean): void;
export declare function markHintInjected(state: GovernorState): void;
export declare function mutationGate(state: GovernorState): {
    allowed: boolean;
    reason?: string;
};
export declare function registerToolCall(state: GovernorState, callId: string, name: string, args: unknown, sequence: number, inputOptions?: Partial<StateOptions>): ToolSemantics;
export interface ToolResultInput {
    readonly isError: boolean;
    readonly content: string;
    readonly meta?: unknown;
}
export declare function settleToolCall(state: GovernorState, callId: string, result: ToolResultInput, sequence: number, inputOptions?: Partial<StateOptions>): ProgressEvent | undefined;
export interface ControlResult {
    readonly ok: boolean;
    readonly message: string;
}
export declare function applyTrajectoryControl(state: GovernorState, args: Record<string, unknown>, sequence?: number, inputOptions?: Partial<StateOptions>): ControlResult;
/** Canonical v0.7 name; applyTrajectoryControl remains a source-compatible legacy export. */
export declare function applyCoursekeeperControl(state: GovernorState, args: Record<string, unknown>, sequence?: number, inputOptions?: Partial<StateOptions>): ControlResult;
export declare function applyAdaptiveInitialRoute(state: GovernorState, decision: AdaptiveRouteDecision, inputOptions?: Partial<StateOptions>): void;
export declare function applyAdaptiveEscalation(state: GovernorState, to: Route, reason: RouteTransitionReason, detail: string, sequence?: number, inputOptions?: Partial<StateOptions>): ControlResult;
export declare function blockerReport(state: GovernorState, inputOptions?: Partial<StateOptions>): string;
export declare function verificationPrompt(state: GovernorState, inputOptions?: Partial<StateOptions>): string;
export declare function rebuildStateFromEvents(events: readonly any[], inputOptions?: Partial<StateOptions>): GovernorState;
