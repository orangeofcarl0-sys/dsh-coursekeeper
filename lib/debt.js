import { normalizePath, sameArtifact } from './core.js';
export function artifactState(workspace, path) {
    const key = normalizePath(path);
    let state = workspace.artifacts.get(key);
    if (!state) {
        state = { path, revision: 0, dependencies: new Set(), dependents: new Set() };
        workspace.artifacts.set(key, state);
    }
    return state;
}
export function mutateArtifact(workspace, path, sequence) {
    workspace.revision++;
    const state = artifactState(workspace, path);
    state.revision++;
    state.lastMutationSeq = sequence;
    return state;
}
export function observeArtifact(workspace, path, sequence) {
    const state = artifactState(workspace, path);
    state.lastObservationSeq = sequence;
    return state;
}
export function artifactRevisionSnapshot(workspace) {
    const out = {};
    for (const [key, value] of workspace.artifacts)
        out[key] = value.revision;
    return out;
}
function documentOnly(path) {
    const ext = /\.([^.\\/]+)$/.exec(path)?.[1]?.toLowerCase();
    return ext !== undefined && ['md', 'txt', 'rst', 'adoc'].includes(ext);
}
export function createVerificationDebtForArtifact(workspace, path, sequence) {
    const artifact = mutateArtifact(workspace, path, sequence);
    const debt = {
        id: `${normalizePath(path)}@${artifact.revision}`,
        artifact: path,
        artifactRevision: artifact.revision,
        workspaceRevision: workspace.revision,
        requiresReadback: path !== '<workspace>' && path !== '<shell-mutation>',
        requiresCommand: !documentOnly(path),
        waived: false,
    };
    workspace.verificationDebt.set(debt.id, debt);
    return debt;
}
export function createWorkspaceMutationDebt(workspace, sequence) {
    workspace.revision++;
    const debt = {
        id: `<workspace>@${workspace.revision}`,
        artifact: '<workspace>',
        artifactRevision: workspace.revision,
        workspaceRevision: workspace.revision,
        requiresReadback: false,
        requiresCommand: true,
        waived: false,
    };
    workspace.verificationDebt.set(debt.id, debt);
    return debt;
}
export function debtSatisfied(workspace, debt) {
    if (debt.waived)
        return true;
    if (debt.artifact === '<workspace>' || debt.artifact === '<shell-mutation>') {
        return !debt.requiresCommand || (debt.commandRevision ?? -1) >= debt.workspaceRevision;
    }
    const current = artifactState(workspace, debt.artifact).revision;
    if (current !== debt.artifactRevision)
        return false;
    const readback = !debt.requiresReadback || (debt.readbackRevision ?? -1) >= current;
    const command = !debt.requiresCommand || (debt.commandRevision ?? -1) >= current;
    return readback && command;
}
export function openVerificationDebts(workspace) {
    return [...workspace.verificationDebt.values()].filter(debt => !debtSatisfied(workspace, debt));
}
export function pruneVerificationDebts(workspace) {
    for (const [id, debt] of workspace.verificationDebt) {
        if (debtSatisfied(workspace, debt))
            workspace.verificationDebt.delete(id);
    }
}
export function applyReadback(workspace, path) {
    const artifact = artifactState(workspace, path);
    let satisfied = 0;
    for (const debt of workspace.verificationDebt.values()) {
        if (!sameArtifact(debt.artifact, path))
            continue;
        if (debt.artifactRevision !== artifact.revision)
            continue;
        debt.readbackRevision = artifact.revision;
        satisfied++;
    }
    return satisfied;
}
function evidenceCoversArtifact(evidence, artifact) {
    if (evidence.scope === 'workspace')
        return true;
    return evidence.scope.some(path => sameArtifact(path, artifact));
}
export function applyVerificationEvidence(workspace, evidence) {
    workspace.verificationEvidence.push(evidence);
    let satisfied = 0;
    for (const debt of workspace.verificationDebt.values()) {
        if (debt.artifact === '<workspace>') {
            if (evidence.scope === 'workspace' && evidence.workspaceRevision >= debt.workspaceRevision) {
                debt.commandRevision = debt.workspaceRevision;
                satisfied++;
            }
            continue;
        }
        if (!evidenceCoversArtifact(evidence, debt.artifact))
            continue;
        const current = artifactState(workspace, debt.artifact).revision;
        const snapshotRevision = evidence.artifactRevisions[normalizePath(debt.artifact)];
        if (snapshotRevision === undefined && evidence.scope !== 'workspace')
            continue;
        if (debt.artifactRevision !== current)
            continue;
        if (evidence.scope === 'workspace' || snapshotRevision === current) {
            debt.commandRevision = current;
            satisfied++;
        }
    }
    return satisfied;
}
export function openAcceptance(obligations) {
    return [...obligations].filter(obligation => obligation.status === 'open');
}
export function satisfyAcceptance(obligation, evidence, selfAttested = false) {
    obligation.status = 'satisfied';
    obligation.evidence.push(evidence);
    obligation.selfAttested = obligation.selfAttested || selfAttested;
}
export function waiveAcceptance(obligation, reason) {
    obligation.status = 'waived';
    obligation.evidence.push(`waived: ${reason}`);
    obligation.selfAttested = true;
}
export function updateAcceptanceAfterMutation(obligations, path, evidence) {
    const changed = [];
    for (const obligation of obligations) {
        if (obligation.status !== 'open')
            continue;
        if (obligation.kind === 'deliverable') {
            if (obligation.targetArtifacts.length === 0 || obligation.targetArtifacts.some(target => sameArtifact(target, path))) {
                satisfyAcceptance(obligation, evidence);
                changed.push(obligation.id);
            }
        }
        else if (obligation.kind === 'relevant-change') {
            if (obligation.targetArtifacts.length === 0 || obligation.targetArtifacts.some(target => sameArtifact(target, path))) {
                satisfyAcceptance(obligation, evidence);
                changed.push(obligation.id);
            }
        }
    }
    return changed;
}
export function updateAcceptanceAfterObservation(obligations, path, relevant, evidence) {
    if (!relevant)
        return [];
    const changed = [];
    for (const obligation of obligations) {
        if (obligation.status !== 'open' || obligation.kind !== 'grounding')
            continue;
        if (obligation.targetArtifacts.length === 0 || path === undefined || obligation.targetArtifacts.some(target => sameArtifact(target, path))) {
            satisfyAcceptance(obligation, evidence);
            changed.push(obligation.id);
        }
    }
    return changed;
}
export function setArtifactDependencies(workspace, path, dependencies) {
    const artifact = artifactState(workspace, path);
    const next = new Set([...dependencies].map(normalizePath).filter(dep => dep && dep !== normalizePath(path)));
    for (const old of artifact.dependencies) {
        if (next.has(old))
            continue;
        artifactState(workspace, old).dependents.delete(normalizePath(path));
    }
    artifact.dependencies.clear();
    for (const dep of next) {
        artifact.dependencies.add(dep);
        artifactState(workspace, dep).dependents.add(normalizePath(path));
    }
}
export function dependentClosure(workspace, path, maxDepth = 4) {
    const root = normalizePath(path);
    const seen = new Set();
    const roots = new Set([root]);
    for (const [key, state] of workspace.artifacts)
        if (sameArtifact(state.path, path))
            roots.add(key);
    const queue = [...roots].map(candidate => ({ path: candidate, depth: 0 }));
    while (queue.length) {
        const current = queue.shift();
        if (current.depth >= maxDepth)
            continue;
        const state = workspace.artifacts.get(current.path);
        if (!state)
            continue;
        for (const dependent of state.dependents) {
            if (seen.has(dependent) || dependent === root)
                continue;
            seen.add(dependent);
            queue.push({ path: dependent, depth: current.depth + 1 });
        }
    }
    return [...seen];
}
export function createDependentVerificationDebts(workspace, mutatedPath, sequence) {
    const created = [];
    for (const dependent of dependentClosure(workspace, mutatedPath)) {
        const state = artifactState(workspace, dependent);
        const debt = {
            id: `dependent:${normalizePath(mutatedPath)}->${dependent}@${state.revision}`,
            artifact: state.path,
            artifactRevision: state.revision,
            workspaceRevision: workspace.revision,
            requiresReadback: false,
            requiresCommand: true,
            waived: false,
        };
        workspace.verificationDebt.set(debt.id, debt);
        created.push(debt);
    }
    return created;
}
//# sourceMappingURL=debt.js.map