import type { CalibrationDomain, GovernorState, Route, RouteExperience, RouteTransitionReason } from '../types.js';
import { type CalibrationOptions } from './calibration.js';
export interface EscalationSuggestion {
    readonly from: Route;
    readonly to: Route;
    readonly reason: RouteTransitionReason;
    readonly detail: string;
    readonly hard: boolean;
}
export interface EscalationOptions extends CalibrationOptions {
    noInformationLimit: number;
    calibrated: boolean;
}
export declare function suggestEscalation(state: GovernorState, experiences: readonly RouteExperience[], domain: CalibrationDomain, options: EscalationOptions): EscalationSuggestion | undefined;
