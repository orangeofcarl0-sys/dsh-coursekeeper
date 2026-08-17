import type { AdaptiveRouteDecision, Route, TaskSignature } from '../types.js';
export interface RouteChallengeResult {
    readonly decision: 'keep' | 'challenge';
    readonly route: Route;
    readonly reason: string;
}
export declare function routeChallengerPrompt(signature: TaskSignature, decision: AdaptiveRouteDecision, objective?: string): string;
export declare function parseRouteChallenge(text: string, eligible: readonly Route[]): RouteChallengeResult | undefined;
