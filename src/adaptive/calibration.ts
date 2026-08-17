import type { BayesianRouteEstimate, CalibrationDomain, Route, RouteExperience, TaskSignature } from '../types.js'
import { routeBucket } from './signature.js'
import { ageWeight, domainWeight, type DomainWeightOptions } from './similarity.js'

const ROUTES: readonly Route[] = ['direct', 'inspect', 'plan', 'explore']

export interface CalibrationOptions extends DomainWeightOptions {
  halfLifeDays: number
  priorStrength: number
}

export function bayesianCalibration(
  experiences: readonly RouteExperience[],
  task: TaskSignature,
  domain: CalibrationDomain,
  options: CalibrationOptions,
): Partial<Record<Route, BayesianRouteEstimate>> {
  const bucket = routeBucket(task)
  const prior = Math.max(0.5, options.priorStrength / 2)
  const out: Partial<Record<Route, BayesianRouteEstimate>> = {}
  for (const route of ROUTES) {
    let alpha = prior
    let beta = prior
    for (const exp of experiences) {
      if (routeBucket(exp.task) !== bucket || exp.externalFailure) continue
      const signal = exp.routeSignals[route]
      if (signal === undefined || signal === 0) continue
      const d = domainWeight(domain, exp.domain, options)
      if (d <= 0) continue
      const w = d * ageWeight(exp.at, options.halfLifeDays)
      if (signal > 0) alpha += Math.min(1, signal) * w
      else beta += Math.min(1, -signal) * w
    }
    const effectiveN = Math.max(0, alpha + beta - 2 * prior)
    out[route] = { alpha, beta, mean: alpha / (alpha + beta), effectiveN }
  }
  return out
}

export function bayesianAdjustment(
  estimates: Partial<Record<Route, BayesianRouteEstimate>>,
  weight: number,
  priorStrength: number,
): Partial<Record<Route, number>> {
  const out: Partial<Record<Route, number>> = {}
  for (const route of ROUTES) {
    const estimate = estimates[route]
    if (!estimate) continue
    const confidence = estimate.effectiveN / (estimate.effectiveN + Math.max(1, priorStrength))
    out[route] = (estimate.mean - 0.5) * 2 * weight * confidence
  }
  return out
}

export function calibratedEscalationThresholds(
  experiences: readonly RouteExperience[],
  domain: CalibrationDomain,
  options: CalibrationOptions,
): { planCoupling: number; exploreUncertainty: number; supportPlan: number; supportExplore: number } {
  let planWeighted = 0, planSupport = 0, exploreWeighted = 0, exploreSupport = 0
  for (const exp of experiences) {
    const d = domainWeight(domain, exp.domain, options) * ageWeight(exp.at, options.halfLifeDays)
    if (d <= 0) continue
    for (const transition of exp.transitions) {
      if (!['fail-route', 'verifier-fail', 'budget-exhausted', 'coupling-discovered', 'uncertainty-discovered'].includes(transition.reason)) continue
      if (transition.from === 'inspect' && transition.to === 'plan') {
        planWeighted += exp.task.coupling * d
        planSupport += d
      } else if (transition.from === 'inspect' && transition.to === 'explore') {
        exploreWeighted += exp.task.uncertainty * d
        exploreSupport += d
      }
    }
  }
  const planObserved = planSupport > 0 ? planWeighted / planSupport : 0.72
  const exploreObserved = exploreSupport > 0 ? exploreWeighted / exploreSupport : 0.75
  // Small-data-safe: only move thresholds earlier, never later, and cap the shift.
  const planConfidence = planSupport / (planSupport + 4)
  const exploreConfidence = exploreSupport / (exploreSupport + 4)
  return {
    planCoupling: Math.max(0.52, 0.72 - Math.min(0.15, Math.max(0, 0.72 - planObserved + 0.03) * planConfidence)),
    exploreUncertainty: Math.max(0.55, 0.75 - Math.min(0.15, Math.max(0, 0.75 - exploreObserved + 0.03) * exploreConfidence)),
    supportPlan: planSupport,
    supportExplore: exploreSupport,
  }
}
