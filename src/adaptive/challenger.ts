import type { AdaptiveRouteDecision, Route, TaskSignature } from '../types.js'

export interface RouteChallengeResult { readonly decision: 'keep' | 'challenge'; readonly route: Route; readonly reason: string }

export function routeChallengerPrompt(signature: TaskSignature, decision: AdaptiveRouteDecision, objective?: string): string {
  const second = Object.entries(decision.fusedScores)
    .filter(([route]) => route !== decision.adaptiveRoute && decision.eligible.includes(route as Route))
    .sort((a, b) => b[1] - a[1])[0]?.[0] as Route | undefined
  return [
    'Evaluate only whether the proposed route should be challenged. Do not solve the task.',
    ...(objective ? [`objective=${objective.slice(0, 500)}`] : []),
    `task=${JSON.stringify({ kind: signature.kind, relation: signature.relation, risk: signature.risk, complexity: signature.complexity, coupling: signature.coupling, uncertainty: signature.uncertainty, observability: signature.observability })}`, 
    `proposed=${decision.adaptiveRoute}`,
    `alternative=${second ?? decision.baseRoute}`,
    `margin=${decision.margin.toFixed(4)}`,
    'Return exactly one JSON object: {"decision":"keep|challenge","route":"direct|inspect|plan|explore","reason":"short evidence-bound reason"}.',
  ].join('\n')
}

export function parseRouteChallenge(text: string, eligible: readonly Route[]): RouteChallengeResult | undefined {
  const candidates = [text.trim(), ...[...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1] ?? '')]
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate) as Record<string, unknown>
      const decision = value['decision']
      const route = value['route']
      if ((decision === 'keep' || decision === 'challenge') && typeof route === 'string' && eligible.includes(route as Route)) {
        return { decision, route: route as Route, reason: typeof value['reason'] === 'string' ? value['reason'] : '' }
      }
    } catch { /* keep scanning */ }
  }
  return undefined
}
