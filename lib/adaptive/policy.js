import { routeScores } from '../core.js';
import { bayesianAdjustment, bayesianCalibration } from './calibration.js';
import { nearestExperiences } from './similarity.js';
import { routeBucket } from './signature.js';
const ROUTES = ['direct', 'inspect', 'plan', 'explore'];
const ROUTE_COST = { direct: 0, inspect: 1, plan: 2, explore: 3 };
function eligibleRoutes(contract) {
    if (contract.kind === 'conversation')
        return ['direct'];
    const routes = ['direct', 'inspect', 'plan', 'explore'];
    if (contract.risk === 'high' || contract.kind === 'research' || contract.vector.uncertainty >= 0.76)
        return routes.filter(route => route !== 'direct');
    return routes;
}
function topRoute(scores, eligible) {
    return [...eligible].sort((a, b) => scores[b] - scores[a])[0] ?? 'inspect';
}
function topTwo(scores, eligible) {
    const sorted = [...eligible].sort((a, b) => scores[b] - scores[a]);
    return [sorted[0] ?? 'inspect', sorted[1] ?? sorted[0] ?? 'inspect'];
}
export function deterministicRoutePrior(contract) {
    const scores = routeScores(contract);
    const eligible = eligibleRoutes(contract);
    return { eligible, scores, preferred: topRoute(scores, eligible) };
}
function memoryAdjustment(cases, maxWeight) {
    const numerator = {};
    let totalWeight = 0;
    for (const item of cases) {
        let contributed = false;
        for (const route of ROUTES) {
            const signal = item.experience.routeSignals[route];
            if (signal === undefined || signal === 0)
                continue;
            numerator[route] = (numerator[route] ?? 0) + signal * item.weight;
            contributed = true;
        }
        if (contributed)
            totalWeight += item.weight;
    }
    const confidence = totalWeight / (totalWeight + 5);
    const adjustment = {};
    for (const route of ROUTES) {
        if (numerator[route] === undefined || totalWeight <= 0)
            continue;
        adjustment[route] = Math.max(-maxWeight, Math.min(maxWeight, (numerator[route] / totalWeight) * maxWeight * confidence));
    }
    return { adjustment, support: totalWeight };
}
function boundedFuse(base, memory, bayes, cap) {
    return Object.fromEntries(ROUTES.map(route => {
        const delta = Math.max(-cap, Math.min(cap, (memory[route] ?? 0) + (bayes[route] ?? 0)));
        return [route, base[route] + delta];
    }));
}
export function decideAdaptiveRoute(contract, task, domain, experiences, options) {
    const prior = deterministicRoutePrior(contract);
    const cases = nearestExperiences(experiences, task, domain, options.memoryTopK, options.memoryMinSimilarity, options.halfLifeDays, options);
    const memory = memoryAdjustment(cases, options.memoryWeight);
    const bayesian = bayesianCalibration(experiences, task, domain, {
        halfLifeDays: options.halfLifeDays,
        priorStrength: options.priorStrength,
        crossProfileWeight: options.crossProfileWeight,
        crossModelWeight: options.crossModelWeight,
        stalePolicyWeight: options.stalePolicyWeight,
    });
    const bayesDelta = bayesianAdjustment(bayesian, options.bayesianWeight, options.priorStrength);
    const fused = boundedFuse(prior.scores, memory.adjustment, bayesDelta, options.maxAdjustment);
    let [adaptive, second] = topTwo(fused, prior.eligible);
    const margin = fused[adaptive] - fused[second];
    // Memory and Bayesian estimates are derived from the same episodes; do not double-count them.
    const support = Math.max(memory.support, ...ROUTES.map(route => bayesian[route]?.effectiveN ?? 0));
    // Low-risk ambiguity is resolved toward the cheaper viable route; high-risk ambiguity is exposed to the challenger.
    if (contract.risk === 'low' && margin < options.marginThreshold) {
        const pair = [adaptive, second].sort((a, b) => ROUTE_COST[a] - ROUTE_COST[b]);
        adaptive = pair[0] ?? adaptive;
        second = pair[1] ?? second;
    }
    const enoughSupport = support >= options.minEffectiveSupport;
    let applied = options.mode === 'active' && enoughSupport ? adaptive : prior.preferred;
    const challengerEligible = contract.risk !== 'low' && margin < options.marginThreshold && prior.eligible.length > 1;
    const explorationSample = options.explorationSample ?? 1;
    if (options.mode === 'active' && enoughSupport && contract.risk === 'low' && margin < options.marginThreshold
        && options.safeExplorationRate > 0 && explorationSample < options.safeExplorationRate) {
        const candidates = [...prior.eligible].sort((a, b) => fused[b] - fused[a]);
        const alternative = candidates.find(route => route !== adaptive);
        if (alternative)
            applied = alternative;
    }
    const reason = options.mode === 'off' ? 'adaptive routing disabled'
        : !enoughSupport ? `insufficient personal support (${support.toFixed(2)} < ${options.minEffectiveSupport})`
            : options.mode === 'shadow' ? `shadow suggestion ${adaptive}; deterministic route retained`
                : applied !== adaptive ? `bounded safe exploration selected ${applied} over ${adaptive}` : `personal calibration applied with margin ${margin.toFixed(3)}`;
    return {
        mode: options.mode,
        bucket: routeBucket(task),
        baseRoute: prior.preferred,
        adaptiveRoute: adaptive,
        appliedRoute: applied,
        baseScores: prior.scores,
        fusedScores: fused,
        eligible: prior.eligible,
        margin,
        effectiveSupport: support,
        memoryAdjustment: memory.adjustment,
        bayesianAdjustment: bayesDelta,
        bayesian,
        challengerEligible,
        challenged: false,
        reason,
    };
}
export function withChallenge(decision, route, reason) {
    return { ...decision, adaptiveRoute: route, appliedRoute: decision.mode === 'active' ? route : decision.appliedRoute, challenged: true, reason };
}
//# sourceMappingURL=policy.js.map