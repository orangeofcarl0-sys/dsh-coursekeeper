import type { AdaptiveRouteDecision, AdaptiveRoutingMode, CalibrationDomain, Route, RouteExperience, RoutePrior, TaskContract, TaskSignature } from '../types.js';
import { type DomainWeightOptions } from './similarity.js';
export interface AdaptivePolicyOptions extends DomainWeightOptions {
    mode: AdaptiveRoutingMode;
    memoryTopK: number;
    memoryMinSimilarity: number;
    halfLifeDays: number;
    priorStrength: number;
    memoryWeight: number;
    bayesianWeight: number;
    maxAdjustment: number;
    minEffectiveSupport: number;
    marginThreshold: number;
    safeExplorationRate: number;
    explorationSample?: number;
}
export declare function deterministicRoutePrior(contract: TaskContract): RoutePrior;
export declare function decideAdaptiveRoute(contract: TaskContract, task: TaskSignature, domain: CalibrationDomain, experiences: readonly RouteExperience[], options: AdaptivePolicyOptions): AdaptiveRouteDecision;
export declare function withChallenge(decision: AdaptiveRouteDecision, route: Route, reason: string): AdaptiveRouteDecision;
