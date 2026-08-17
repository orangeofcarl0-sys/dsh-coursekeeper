import { calibratedEscalationThresholds } from './calibration.js';
export function suggestEscalation(state, experiences, domain, options) {
    const episode = state.episode;
    if (!episode)
        return undefined;
    const route = episode.route.route;
    const contract = episode.contract;
    const thresholds = options.calibrated
        ? calibratedEscalationThresholds(experiences, domain, options)
        : { planCoupling: 0.72, exploreUncertainty: 0.75, supportPlan: 0, supportExplore: 0 };
    const falsified = episode.evidence.filter(event => event.kind === 'hypothesis-falsified').length;
    if (route === 'direct' && (state.noInformationStreak >= 1 || episode.route.stallActions >= 1)) {
        return { from: 'direct', to: 'inspect', reason: 'insufficient-evidence', detail: 'DIRECT produced no useful progress; inspect state before further mutation.', hard: true };
    }
    if (route === 'inspect') {
        if (contract.vector.coupling >= thresholds.planCoupling && episode.route.evidenceActions >= Math.max(1, episode.route.minEvidenceActions)) {
            return { from: 'inspect', to: 'plan', reason: 'coupling-discovered', detail: `Observed coupling ${contract.vector.coupling.toFixed(2)} exceeds calibrated PLAN threshold ${thresholds.planCoupling.toFixed(2)}.`, hard: false };
        }
        if ((contract.vector.uncertainty >= thresholds.exploreUncertainty && (falsified >= 1 || episode.route.stallActions >= 1))
            || (episode.route.evidenceActions >= episode.route.maxEvidenceActions && contract.vector.uncertainty >= 0.6)) {
            return { from: 'inspect', to: 'explore', reason: 'uncertainty-discovered', detail: `INSPECT is not reducing uncertainty; EXPLORE should form a falsifiable hypothesis.`, hard: false };
        }
    }
    if (route === 'plan' && (falsified >= 2 || (episode.route.stallActions >= 2 && contract.vector.uncertainty >= 0.72))) {
        return { from: 'plan', to: 'explore', reason: 'uncertainty-discovered', detail: 'Planning is blocked by unresolved mechanism uncertainty.', hard: false };
    }
    if (route === 'explore' && episode.route.epistemic === 'supported' && contract.vector.coupling >= 0.5) {
        return { from: 'explore', to: 'plan', reason: 'converged', detail: 'Exploration produced a supported working model; converge into bounded planning.', hard: false };
    }
    if (episode.route.stallActions >= options.noInformationLimit) {
        const to = route === 'direct' ? 'inspect' : route === 'inspect' ? (contract.vector.uncertainty >= contract.vector.coupling ? 'explore' : 'plan') : route === 'plan' ? 'explore' : 'inspect';
        if (to !== route)
            return { from: route, to, reason: 'budget-exhausted', detail: 'Current route exhausted its no-progress budget.', hard: true };
    }
    return undefined;
}
//# sourceMappingURL=escalation.js.map