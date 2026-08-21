import type {
  AcceptanceObligation,
  ArtifactState,
  VerificationDebt,
  VerificationEvidence,
  WorkspaceState,
} from './types.js'
import { normalizePath, sameArtifact } from './core.js'

export function artifactState(workspace: WorkspaceState, path: string): ArtifactState {
  const key = normalizePath(path)
  let state = workspace.artifacts.get(key)
  if (!state) {
    state = { path, revision: 0, dependencies: new Set(), dependents: new Set() }
    workspace.artifacts.set(key, state)
  }
  return state
}

export function mutateArtifact(workspace: WorkspaceState, path: string, sequence: number): ArtifactState {
  workspace.revision++
  const state = artifactState(workspace, path)
  state.revision++
  state.lastMutationSeq = sequence
  return state
}

export function markArtifactRemoved(workspace: WorkspaceState, path: string, sequence: number): ArtifactState {
  const artifact = artifactState(workspace, path)
  if (artifact.removed === true) return artifact
  artifact.removed = true
  artifact.removedAtSeq = sequence
  return artifact
}

export function observeArtifact(workspace: WorkspaceState, path: string, sequence: number): ArtifactState {
  const state = artifactState(workspace, path)
  state.lastObservationSeq = sequence
  return state
}

export function artifactRevisionSnapshot(workspace: WorkspaceState): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of workspace.artifacts) out[key] = value.revision
  return out
}

function documentOnly(path: string): boolean {
  const ext = /\.([^.\\/]+)$/.exec(path)?.[1]?.toLowerCase()
  return ext !== undefined && ['md', 'txt', 'rst', 'adoc'].includes(ext)
}

export function createVerificationDebtForArtifact(workspace: WorkspaceState, path: string, sequence: number): VerificationDebt {
  const artifact = mutateArtifact(workspace, path, sequence)
  const debt: VerificationDebt = {
    id: `${normalizePath(path)}@${artifact.revision}`,
    artifact: path,
    artifactRevision: artifact.revision,
    workspaceRevision: workspace.revision,
    requiresReadback: path !== '<workspace>' && path !== '<shell-mutation>',
    requiresCommand: !documentOnly(path),
    waived: false,
  }
  workspace.verificationDebt.set(debt.id, debt)
  return debt
}

export function createWorkspaceMutationDebt(workspace: WorkspaceState, sequence: number): VerificationDebt {
  workspace.revision++
  const debt: VerificationDebt = {
    id: `<workspace>@${workspace.revision}`,
    artifact: '<workspace>',
    artifactRevision: workspace.revision,
    workspaceRevision: workspace.revision,
    requiresReadback: false,
    requiresCommand: true,
    waived: false,
  }
  workspace.verificationDebt.set(debt.id, debt)
  return debt
}

export function debtSatisfied(workspace: WorkspaceState, debt: VerificationDebt): boolean {
  if (debt.waived) return true
  if (debt.artifact === '<workspace>' || debt.artifact === '<shell-mutation>') {
    return !debt.requiresCommand || (debt.commandRevision ?? -1) >= debt.workspaceRevision
  }
  const artifact = artifactState(workspace, debt.artifact)
  if (artifact.removed === true) return true
  const current = artifact.revision
  // A verification debt pins exactly one revision of one artifact. Once the
  // artifact has advanced past that revision, the old debt can never be
  // satisfied against the current content and no longer gates completion:
  // the newer revision has (or will get) its own debt. Treat superseded
  // debts as closed here; pruneVerificationDebts removes them from the set.
  if (current > debt.artifactRevision) return true
  if (current !== debt.artifactRevision) return false
  const readback = !debt.requiresReadback || (debt.readbackRevision ?? -1) >= current
  const command = !debt.requiresCommand || (debt.commandRevision ?? -1) >= current
  return readback && command
}

export function openVerificationDebts(workspace: WorkspaceState): VerificationDebt[] {
  return [...workspace.verificationDebt.values()].filter(debt => !debtSatisfied(workspace, debt))
}

export function pruneVerificationDebts(workspace: WorkspaceState): void {
  for (const [id, debt] of workspace.verificationDebt) {
    if (debtSatisfied(workspace, debt)) workspace.verificationDebt.delete(id)
  }
}

export function waiveVerificationDebt(workspace: WorkspaceState, debtId: string, reason: string): boolean {
  const debt = workspace.verificationDebt.get(debtId)
  if (!debt) return false
  debt.waived = true
  return true
}

function syntheticDebt(workspace: WorkspaceState, debt: VerificationDebt): boolean {
  if (debt.artifact === '<workspace>' || debt.artifact === '<shell-mutation>') return false
  const artifact = artifactState(workspace, debt.artifact)
  if (artifact.removed === true) return false
  const leaf = debt.artifact.split(/[\/]/).pop() ?? ''
  return !/\.[A-Za-z0-9]{1,12}$/.test(leaf)
}

export function cleanupVerificationDebts(
  workspace: WorkspaceState,
  filter: { removed?: boolean; synthetic?: boolean; waived?: boolean } = {},
): number {
  let removed = 0
  for (const [id, debt] of workspace.verificationDebt) {
    const artifact = artifactState(workspace, debt.artifact)
    const isRemoved = artifact.removed === true
    const isWaived = debt.waived === true
    const isSynthetic = syntheticDebt(workspace, debt)
    if (filter.removed === true && isRemoved) { workspace.verificationDebt.delete(id); removed++; continue }
    if (filter.synthetic === true && isSynthetic) { workspace.verificationDebt.delete(id); removed++; continue }
    if (filter.waived === true && isWaived) { workspace.verificationDebt.delete(id); removed++; continue }
  }
  return removed
}

export function applyReadback(workspace: WorkspaceState, path: string): number {
  const artifact = artifactState(workspace, path)
  let satisfied = 0
  for (const debt of workspace.verificationDebt.values()) {
    if (!sameArtifact(debt.artifact, path)) continue
    if (debt.artifactRevision !== artifact.revision) continue
    debt.readbackRevision = artifact.revision
    satisfied++
  }
  return satisfied
}

function evidenceCoversArtifact(evidence: VerificationEvidence, artifact: string): boolean {
  if (evidence.scope === 'workspace') return true
  return evidence.scope.some(path => sameArtifact(path, artifact))
}

export function applyVerificationEvidence(workspace: WorkspaceState, evidence: VerificationEvidence): number {
  workspace.verificationEvidence.push(evidence)
  let satisfied = 0
  for (const debt of workspace.verificationDebt.values()) {
    if (debt.artifact === '<workspace>') {
      if (evidence.scope === 'workspace' && evidence.workspaceRevision >= debt.workspaceRevision) {
        debt.commandRevision = debt.workspaceRevision
        satisfied++
      }
      continue
    }
    if (!evidenceCoversArtifact(evidence, debt.artifact)) continue
    const current = artifactState(workspace, debt.artifact).revision
    const snapshotRevision = evidence.artifactRevisions[normalizePath(debt.artifact)]
    if (snapshotRevision === undefined && evidence.scope !== 'workspace') continue
    if (debt.artifactRevision !== current) continue
    if (evidence.scope === 'workspace' || snapshotRevision === current) {
      debt.commandRevision = current
      satisfied++
    }
  }
  return satisfied
}

export function openAcceptance(obligations: Iterable<AcceptanceObligation>): AcceptanceObligation[] {
  return [...obligations].filter(obligation => obligation.status === 'open')
}

export function satisfyAcceptance(obligation: AcceptanceObligation, evidence: string, selfAttested = false): void {
  obligation.status = 'satisfied'
  obligation.evidence.push(evidence)
  obligation.selfAttested = obligation.selfAttested || selfAttested
}

export function waiveAcceptance(obligation: AcceptanceObligation, reason: string): void {
  obligation.status = 'waived'
  obligation.evidence.push(`waived: ${reason}`)
  obligation.selfAttested = true
}

export function updateAcceptanceAfterMutation(obligations: Iterable<AcceptanceObligation>, path: string, evidence: string): string[] {
  const changed: string[] = []
  for (const obligation of obligations) {
    if (obligation.status !== 'open') continue
    if (obligation.kind === 'deliverable') {
      if (obligation.targetArtifacts.length === 0 || obligation.targetArtifacts.some(target => sameArtifact(target, path))) {
        satisfyAcceptance(obligation, evidence)
        changed.push(obligation.id)
      }
    } else if (obligation.kind === 'relevant-change') {
      if (obligation.targetArtifacts.length === 0 || obligation.targetArtifacts.some(target => sameArtifact(target, path))) {
        satisfyAcceptance(obligation, evidence)
        changed.push(obligation.id)
      }
    }
  }
  return changed
}

export function updateAcceptanceAfterObservation(obligations: Iterable<AcceptanceObligation>, path: string | undefined, relevant: boolean, evidence: string): string[] {
  if (!relevant) return []
  const changed: string[] = []
  for (const obligation of obligations) {
    if (obligation.status !== 'open' || obligation.kind !== 'grounding') continue
    if (obligation.targetArtifacts.length === 0 || path === undefined || obligation.targetArtifacts.some(target => sameArtifact(target, path))) {
      satisfyAcceptance(obligation, evidence)
      changed.push(obligation.id)
    }
  }
  return changed
}


export function setArtifactDependencies(workspace: WorkspaceState, path: string, dependencies: Iterable<string>): void {
  const artifact = artifactState(workspace, path)
  const next = new Set([...dependencies].map(normalizePath).filter(dep => dep && dep !== normalizePath(path)))
  for (const old of artifact.dependencies) {
    if (next.has(old)) continue
    artifactState(workspace, old).dependents.delete(normalizePath(path))
  }
  artifact.dependencies.clear()
  for (const dep of next) {
    artifact.dependencies.add(dep)
    artifactState(workspace, dep).dependents.add(normalizePath(path))
  }
}

export function dependentClosure(workspace: WorkspaceState, path: string, maxDepth = 4): string[] {
  const root = normalizePath(path)
  const seen = new Set<string>()
  const roots = new Set<string>([root])
  for (const [key, state] of workspace.artifacts) if (sameArtifact(state.path, path)) roots.add(key)
  const queue: Array<{ path: string; depth: number }> = [...roots].map(candidate => ({ path: candidate, depth: 0 }))
  while (queue.length) {
    const current = queue.shift()!
    if (current.depth >= maxDepth) continue
    const state = workspace.artifacts.get(current.path)
    if (!state) continue
    for (const dependent of state.dependents) {
      if (seen.has(dependent) || dependent === root) continue
      seen.add(dependent)
      queue.push({ path: dependent, depth: current.depth + 1 })
    }
  }
  return [...seen]
}

export function createDependentVerificationDebts(
  workspace: WorkspaceState,
  mutatedPath: string,
  sequence: number,
  conservative = false,
): VerificationDebt[] {
  const created: VerificationDebt[] = []
  const dependents = conservative
    ? [...workspace.artifacts.values()].map(artifact => artifact.path).filter(path => !sameArtifact(path, mutatedPath))
    : dependentClosure(workspace, mutatedPath)
  for (const dependent of dependents) {
    const state = artifactState(workspace, dependent)
    const debt: VerificationDebt = {
      id: `dependent:${normalizePath(mutatedPath)}->${dependent}@${state.revision}`,
      artifact: state.path,
      artifactRevision: state.revision,
      workspaceRevision: workspace.revision,
      requiresReadback: false,
      requiresCommand: true,
      waived: false,
    }
    workspace.verificationDebt.set(debt.id, debt)
    created.push(debt)
  }
  return created
}
