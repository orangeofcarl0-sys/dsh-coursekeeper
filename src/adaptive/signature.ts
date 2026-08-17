import { createHash } from 'node:crypto'
import type { TaskContract, TaskSignature } from '../types.js'

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)) }

function charNgrams(text: string, n = 3): string[] {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  if (normalized.length <= n) return [normalized]
  const grams: string[] = []
  for (let i = 0; i <= normalized.length - n; i++) grams.push(normalized.slice(i, i + n))
  return grams
}

export function simHash64(text: string): string {
  const weights = new Int32Array(64)
  for (const gram of charNgrams(text)) {
    const digest = createHash('sha256').update(gram).digest()
    for (let bit = 0; bit < 64; bit++) {
      const on = (digest[Math.floor(bit / 8)]! & (1 << (bit % 8))) !== 0
      weights[bit] = (weights[bit] ?? 0) + (on ? 1 : -1)
    }
  }
  let result = 0n
  for (let bit = 0; bit < 64; bit++) if (weights[bit]! >= 0) result |= 1n << BigInt(bit)
  return result.toString(16).padStart(16, '0')
}

export function hammingSimilarity64(left: string, right: string): number {
  try {
    let x = BigInt(`0x${left}`) ^ BigInt(`0x${right}`)
    let distance = 0
    while (x !== 0n) { x &= x - 1n; distance++ }
    return 1 - distance / 64
  } catch { return 0 }
}

function artifactCountBin(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 4) return 2
  return 3
}

export function buildTaskSignature(contract: TaskContract, knownArtifacts: Iterable<string> = []): TaskSignature {
  const workspace = [...knownArtifacts].map(value => value.replaceAll('\\', '/').toLowerCase()).sort()
  const objectiveHash = createHash('sha256').update(contract.objective).digest('hex')
  const workspaceHash = createHash('sha256').update(workspace.join('\n')).digest('hex').slice(0, 24)
  const deterministicOracle = (contract.kind === 'build' || contract.kind === 'fix') && contract.vector.observability >= 0.4
  return {
    version: 1,
    kind: contract.kind,
    relation: contract.relation,
    risk: contract.risk,
    complexity: clamp01(contract.complexity),
    coupling: clamp01(contract.vector.coupling),
    uncertainty: clamp01(contract.vector.uncertainty),
    observability: clamp01(contract.vector.observability),
    novelty: clamp01(contract.vector.novelty),
    artifactCountBin: artifactCountBin(contract.artifacts.length),
    continuity: contract.relation !== 'new',
    deterministicOracle,
    objectiveHash,
    objectiveSimHash: simHash64(contract.objective),
    workspaceHash,
  }
}

export function routeBucket(signature: TaskSignature): string {
  if (signature.risk === 'high') return 'high-risk'
  if (signature.kind === 'research' || (signature.kind === 'analysis' && signature.uncertainty >= 0.68)) return 'research-uncertain'
  if (signature.kind === 'fix' && signature.observability >= 0.58 && signature.uncertainty < 0.7) return 'fix-observable'
  if (signature.kind === 'fix') return 'fix-unknown-root'
  if (signature.kind === 'build' && (signature.coupling >= 0.62 || signature.complexity >= 0.68)) return 'build-complex'
  if (signature.kind === 'build') return 'build-simple'
  if (signature.continuity) return 'continuation'
  if (signature.kind === 'review' || signature.kind === 'analysis') return 'review-analysis'
  if (signature.complexity >= 0.65) return 'complex-generic'
  return 'generic'
}
