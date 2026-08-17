import { createHash } from 'node:crypto';
import { benchmarkBlocker, canFinish, openAcceptanceCount, openVerificationCount } from '../state.js';
export function routeSignalsFromState(state, completion, externalFailure) {
    const episode = state.episode;
    if (!episode || externalFailure)
        return {};
    const signals = {};
    const add = (route, value) => { signals[route] = Math.max(-1, Math.min(1, (signals[route] ?? 0) + value)); };
    for (const transition of episode.transitions) {
        if (['fail-route', 'verifier-fail'].includes(transition.reason)) {
            add(transition.from, -1);
            if (completion === 'success')
                add(transition.to, 0.8);
        }
        else if (['budget-exhausted', 'insufficient-evidence'].includes(transition.reason)) {
            add(transition.from, -0.5);
            if (completion === 'success')
                add(transition.to, 0.6);
        }
        else if (transition.reason === 'converged') {
            add(transition.from, 0.35);
            if (completion === 'success')
                add(transition.to, 0.5);
        }
        else if (completion === 'success')
            add(transition.to, 0.25);
    }
    if (completion === 'success' && episode.transitions.length === 0)
        add(episode.initialRoute, 0.5);
    if (completion === 'success' && episode.semanticVerification.decision === 'patch' && episode.route.route === episode.initialRoute)
        add(episode.route.route, 0.4);
    if (episode.semanticVerification.decision === 'pass')
        add(episode.route.route, 0.3);
    if (episode.semanticVerification.decision === 'fail_route')
        add(episode.route.route, -1);
    return signals;
}
export function buildRouteExperience(state, signature, domain, metrics, completion, externalFailure, benchmarkRequired = false) {
    const episode = state.episode;
    if (!episode)
        return undefined;
    const at = new Date().toISOString();
    const id = createHash('sha256').update(`${at}\0${signature.objectiveHash}\0${episode.id}`).digest('hex').slice(0, 24);
    return {
        schemaVersion: 1,
        id,
        at,
        domain,
        task: signature,
        initialRoute: episode.initialRoute,
        finalRoute: episode.route.route,
        transitions: [...episode.transitions],
        completion,
        ...(episode.semanticVerification.decision ? { verifierDecision: episode.semanticVerification.decision } : {}),
        obligations: {
            acceptanceCleared: openAcceptanceCount(state) === 0,
            verificationCleared: openVerificationCount(state) === 0,
            benchmarkCleared: !benchmarkRequired || benchmarkBlocker(state, { benchmarkRequired }) === undefined,
        },
        metrics,
        routeSignals: routeSignalsFromState(state, completion, externalFailure),
        externalFailure,
    };
}
export function inferCompletion(state, benchmarkRequired = false) {
    if (!state.episode)
        return 'unknown';
    if (canFinish(state, { benchmarkRequired }))
        return 'success';
    if (state.episode.phase === 'blocked' || state.episode.blockedReason)
        return 'blocked';
    return 'unknown';
}
//# sourceMappingURL=experience.js.map