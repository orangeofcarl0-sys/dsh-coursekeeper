import type { RouteExperience } from '../types.js';
export interface ExperienceStoreOptions {
    readonly enabled: boolean;
    readonly path: string;
    readonly maxInMemory: number;
}
export interface ExperienceStoreStatus {
    readonly enabled: boolean;
    readonly path: string;
    readonly loaded: boolean;
    readonly entries: number;
    readonly invalidLines: number;
    readonly failed: boolean;
    readonly error?: string;
    readonly bytes?: number;
}
export declare class ExperienceStore {
    private readonly options;
    private readonly rows;
    private loadPromise;
    private queue;
    private invalidLines;
    private failure;
    private loaded;
    constructor(options: ExperienceStoreOptions);
    ready(): Promise<void>;
    values(): readonly RouteExperience[];
    append(experience: RouteExperience): void;
    close(): Promise<void>;
    status(): Promise<ExperienceStoreStatus>;
    private load;
    private recordFailure;
}
