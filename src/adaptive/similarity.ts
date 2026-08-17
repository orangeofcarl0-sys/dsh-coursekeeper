import type { CalibrationDomain, RouteExperience, TaskSignature } from '../types.js'
import { hammingSimilarity64 } from './signature.js'

function eq(a: unknown, b: unknown): number { return a === b ? 1 : 0 }
function closeness(a: number, b: number): number { return Math.max(0, 1 - Math.abs(a - b)) }

export function taskSimilarity(left: TaskSignature, right: TaskSignature): number {
  return 0.18 * eq(left.kind, right.kind)
    + 0.08 * eq(left.relation, right.relation)
    + 0.08 * eq(left.risk, right.risk)
    + 0.11 * closeness(left.complexity, right.complexity)
    + 0.12 * closeness(left.coupling, right.coupling)
    + 0.12 * closeness(left.uncertainty, right.uncertainty)
    + 0.08 * closeness(left.observability, right.observability)
    + 0.05 * eq(left.artifactCountBin, right.artifactCountBin)
    + 0.04 * eq(left.deterministicOracle, right.deterministicOracle)
    + 0.10 * hammingSimilarity64(left.objectiveSimHash, right.objectiveSimHash)
    + 0.04 * eq(left.workspaceHash, right.workspaceHash)
}

export interface DomainWeightOptions {
  crossProfileWeight: number
  crossModelWeight: number
  stalePolicyWeight: number
}

export function domainWeight(current: CalibrationDomain, past: CalibrationDomain, options: DomainWeightOptions): number {
  let weight = 1
  if (current.providerFamily !== past.providerFamily || current.modelFamily !== past.modelFamily) weight *= options.crossModelWeight
  else if (current.modelRevision !== past.modelRevision) weight *= 0.65
  if (current.augmentationProfile !== past.augmentationProfile) weight *= options.crossProfileWeight
  if (current.harnessVersion !== past.harnessVersion) weight *= 0.75
  if (current.policySchemaVersion !== past.policySchemaVersion) weight *= options.stalePolicyWeight
  return weight
}

export function ageWeight(at: string, halfLifeDays: number, now = Date.now()): number {
  const time = Date.parse(at)
  if (!Number.isFinite(time) || halfLifeDays <= 0) return 1
  const ageDays = Math.max(0, (now - time) / 86_400_000)
  return Math.pow(0.5, ageDays / halfLifeDays)
}

export interface WeightedExperience {
  readonly experience: RouteExperience
  readonly similarity: number
  readonly weight: number
}

export function nearestExperiences(
  experiences: readonly RouteExperience[],
  task: TaskSignature,
  domain: CalibrationDomain,
  topK: number,
  minSimilarity: number,
  halfLifeDays: number,
  domainOptions: DomainWeightOptions,
): WeightedExperience[] {
  const weighted: WeightedExperience[] = []
  for (const experience of experiences) {
    const similarity = taskSimilarity(task, experience.task)
    if (similarity < minSimilarity) continue
    const d = domainWeight(domain, experience.domain, domainOptions)
    if (d <= 0) continue
    const weight = similarity * similarity * d * ageWeight(experience.at, halfLifeDays)
    if (weight > 0) weighted.push({ experience, similarity, weight })
  }
  weighted.sort((a, b) => b.weight - a.weight)
  return weighted.slice(0, Math.max(1, topK))
}
