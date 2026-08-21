import type { GovernorMode } from './types.js';
export interface SessionModeStoreOptions {
    readonly enabled: boolean;
    readonly path: string;
    readonly maxInMemory: number;
}
/**
 * Durable per-session coursekeeper mode. The latest row per session id wins,
 * so a mode chosen with /coursekeeper on|shadow|off survives a web restart.
 */
export declare class SessionModeStore {
    private readonly options;
    private readonly modes;
    private loadPromise;
    private queue;
    private loaded;
    private invalidLines;
    private failure;
    constructor(options: SessionModeStoreOptions);
    ready(): Promise<void>;
    get(sessionId: string): GovernorMode | undefined;
    set(sessionId: string, mode: GovernorMode): void;
    status(): Promise<Record<string, unknown>>;
    close(): Promise<void>;
    private load;
    private recordFailure;
}
