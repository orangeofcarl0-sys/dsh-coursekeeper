import type { BranchExperience } from './types.js';
export interface BranchExperienceStoreOptions {
    readonly enabled: boolean;
    readonly path: string;
    readonly maxInMemory: number;
}
export declare class BranchExperienceStore {
    private readonly options;
    private readonly rows;
    private loadPromise;
    private queue;
    private loaded;
    private invalidLines;
    private failure;
    constructor(options: BranchExperienceStoreOptions);
    ready(): Promise<void>;
    values(): readonly BranchExperience[];
    append(row: BranchExperience): void;
    status(): Promise<Record<string, unknown>>;
    close(): Promise<void>;
    private load;
    private recordFailure;
}
