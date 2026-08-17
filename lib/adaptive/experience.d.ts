import type { CalibrationDomain, EpisodeCompletion, GovernorState, Route, RouteExperience, RouteExperienceMetrics, TaskSignature } from '../types.js';
export declare function routeSignalsFromState(state: GovernorState, completion: EpisodeCompletion, externalFailure: boolean): Partial<Record<Route, number>>;
export declare function buildRouteExperience(state: GovernorState, signature: TaskSignature, domain: CalibrationDomain, metrics: RouteExperienceMetrics, completion: EpisodeCompletion, externalFailure: boolean, benchmarkRequired?: boolean): RouteExperience | undefined;
export declare function inferCompletion(state: GovernorState, benchmarkRequired?: boolean): EpisodeCompletion;
