import type { BayesianRouteEstimate, CalibrationDomain, Route, RouteExperience, TaskSignature } from '../types.js';
import { type DomainWeightOptions } from './similarity.js';
export interface CalibrationOptions extends DomainWeightOptions {
    halfLifeDays: number;
    priorStrength: number;
}
export declare function bayesianCalibration(experiences: readonly RouteExperience[], task: TaskSignature, domain: CalibrationDomain, options: CalibrationOptions): Partial<Record<Route, BayesianRouteEstimate>>;
export declare function bayesianAdjustment(estimates: Partial<Record<Route, BayesianRouteEstimate>>, weight: number, priorStrength: number): Partial<Record<Route, number>>;
export declare function calibratedEscalationThresholds(experiences: readonly RouteExperience[], domain: CalibrationDomain, options: CalibrationOptions): {
    planCoupling: number;
    exploreUncertainty: number;
    supportPlan: number;
    supportExplore: number;
};
