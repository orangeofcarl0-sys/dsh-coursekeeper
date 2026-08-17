import type { CalibrationDomain, RouteExperience, TaskSignature } from '../types.js';
export declare function taskSimilarity(left: TaskSignature, right: TaskSignature): number;
export interface DomainWeightOptions {
    crossProfileWeight: number;
    crossModelWeight: number;
    stalePolicyWeight: number;
}
export declare function domainWeight(current: CalibrationDomain, past: CalibrationDomain, options: DomainWeightOptions): number;
export declare function ageWeight(at: string, halfLifeDays: number, now?: number): number;
export interface WeightedExperience {
    readonly experience: RouteExperience;
    readonly similarity: number;
    readonly weight: number;
}
export declare function nearestExperiences(experiences: readonly RouteExperience[], task: TaskSignature, domain: CalibrationDomain, topK: number, minSimilarity: number, halfLifeDays: number, domainOptions: DomainWeightOptions): WeightedExperience[];
