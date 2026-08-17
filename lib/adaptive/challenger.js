export function routeChallengerPrompt(signature, decision, objective) {
    const second = Object.entries(decision.fusedScores)
        .filter(([route]) => route !== decision.adaptiveRoute && decision.eligible.includes(route))
        .sort((a, b) => b[1] - a[1])[0]?.[0];
    return [
        'Evaluate only whether the proposed route should be challenged. Do not solve the task.',
        ...(objective ? [`objective=${objective.slice(0, 500)}`] : []),
        `task=${JSON.stringify({ kind: signature.kind, relation: signature.relation, risk: signature.risk, complexity: signature.complexity, coupling: signature.coupling, uncertainty: signature.uncertainty, observability: signature.observability })}`,
        `proposed=${decision.adaptiveRoute}`,
        `alternative=${second ?? decision.baseRoute}`,
        `margin=${decision.margin.toFixed(4)}`,
        'Return exactly one JSON object: {"decision":"keep|challenge","route":"direct|inspect|plan|explore","reason":"short evidence-bound reason"}.',
    ].join('\n');
}
export function parseRouteChallenge(text, eligible) {
    const candidates = [text.trim(), ...[...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1] ?? '')];
    for (const candidate of candidates) {
        try {
            const value = JSON.parse(candidate);
            const decision = value['decision'];
            const route = value['route'];
            if ((decision === 'keep' || decision === 'challenge') && typeof route === 'string' && eligible.includes(route)) {
                return { decision, route: route, reason: typeof value['reason'] === 'string' ? value['reason'] : '' };
            }
        }
        catch { /* keep scanning */ }
    }
    return undefined;
}
//# sourceMappingURL=challenger.js.map