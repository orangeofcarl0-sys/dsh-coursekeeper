import type { GovernorMode } from './types.js';
export interface CoursekeeperRuntimeHandle {
    getMode(): GovernorMode;
    setMode(mode: GovernorMode): void;
    getStatus(): Record<string, unknown>;
}
export declare function registerSessionHandle(key: string, handle: CoursekeeperRuntimeHandle): void;
export declare function unregisterSessionHandle(key: string): void;
export declare function getSessionHandle(key: string): CoursekeeperRuntimeHandle | undefined;
