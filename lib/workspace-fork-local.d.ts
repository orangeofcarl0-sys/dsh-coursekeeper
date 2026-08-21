import type { BranchCandidate } from './types.js';
import type { BranchCheckpoint, BranchExecutor, WorkspaceForkProvider } from './branching.js';
export interface LocalWorkspaceForkOptions {
    root: string;
    workspaceRefRoot?: string;
    command?: string[];
    timeoutMs?: number;
}
/**
 * A local filesystem-backed WorkspaceForkProvider:
 * checkpoint = workspace root; fork = recursive directory copy; dispose = rm -rf.
 * It never pretends to isolate if no workspace root has been configured.
 */
export declare class LocalWorkspaceForkProvider implements WorkspaceForkProvider {
    private readonly options;
    readonly capability: "arbitrary";
    constructor(options: LocalWorkspaceForkOptions);
    checkpoint(): Promise<BranchCheckpoint>;
    fork(checkpoint: BranchCheckpoint, candidateId: string): Promise<{
        workspaceRef: string;
    }>;
    apply(candidate: BranchCandidate): Promise<{
        ok: boolean;
        artifacts?: readonly string[];
        reason?: string;
    }>;
    dispose(workspaceRef: string): Promise<void>;
}
/**
 * Minimal local BranchExecutor: runs a configured command inside the forked
 * workspace and captures stdout/stderr as candidate evidence. Without a command
 * it still produces an evidence placeholder so the branching pipeline can be
 * exercised end-to-end.
 */
export declare class LocalBranchExecutor implements BranchExecutor {
    private readonly options;
    constructor(options: LocalWorkspaceForkOptions);
    execute(input: {
        candidateId: string;
        workspaceRef: string;
        objective: string;
        route?: string;
        freshContext: true;
        includeGeneratorReasoning: false;
    }): Promise<any>;
}
