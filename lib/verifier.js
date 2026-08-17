import { openAcceptance, openVerificationDebts } from './debt.js';
import { benchmarkBlocker } from './state.js';
export function buildEvidencePacket(state) {
    const episode = state.episode;
    if (!episode)
        return undefined;
    const packet = {
        episodeId: episode.id,
        objective: episode.contract.objective,
        route: { ...episode.route },
        openAcceptance: openAcceptance(episode.acceptance.values()).map(item => ({
            id: item.id,
            description: item.description,
            kind: item.kind,
            targetArtifacts: item.targetArtifacts,
        })),
        openVerification: openVerificationDebts(state.workspace).map(debt => ({
            id: debt.id,
            artifact: debt.artifact,
            artifactRevision: debt.artifactRevision,
            requiresReadback: debt.requiresReadback,
            requiresCommand: debt.requiresCommand,
        })),
        recentEvidence: episode.evidence.slice(-12),
        workspaceRevision: state.workspace.revision,
    };
    const benchmark = benchmarkBlocker(state);
    if (benchmark)
        packet.benchmarkBlocker = benchmark;
    if (episode.recoveryBlocker)
        packet.recoveryBlocker = episode.recoveryBlocker;
    return packet;
}
export function verifierPrompt(packet) {
    return [
        'You are an independent evidence verifier. Do not continue the main reasoning narrative.',
        'Judge only whether the claims/obligations are supported by the supplied evidence packet.',
        'Return strict JSON with decision, failedObligations, contradictions, nextEvidence, optional patchedHypothesis, and reason.',
        'Use fail_route only when the current route itself is inappropriate; use patch when only the working hypothesis should change.',
        JSON.stringify(packet),
    ].join('\n');
}
export function parseSemanticVerifierResult(text) {
    let parsed;
    try {
        parsed = JSON.parse(text.trim());
    }
    catch {
        return undefined;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        return undefined;
    const record = parsed;
    const decision = String(record['decision'] ?? '');
    if (!['pass', 'warn', 'patch', 'fail_route', 'unknown'].includes(decision))
        return undefined;
    const strings = (value) => Array.isArray(value) ? value.filter((x) => typeof x === 'string') : [];
    const result = {
        decision,
        failedObligations: strings(record['failedObligations']),
        contradictions: strings(record['contradictions']),
        nextEvidence: strings(record['nextEvidence']),
        reason: typeof record['reason'] === 'string' ? record['reason'] : '',
    };
    if (typeof record['patchedHypothesis'] === 'string' && record['patchedHypothesis'].trim()) {
        return { ...result, patchedHypothesis: record['patchedHypothesis'] };
    }
    return result;
}
export function shouldRequireSemanticVerification(state, mode) {
    if (mode === 'off' || !state.episode || state.episode.contract.kind === 'conversation')
        return false;
    if (mode === 'always')
        return true;
    const episode = state.episode;
    return episode.contract.risk === 'high'
        || episode.route.route === 'plan'
        || episode.route.route === 'explore'
        || episode.contract.kind === 'research';
}
export function resetSemanticVerification(state) {
    const semantic = state.episode?.semanticVerification;
    if (!semantic)
        return;
    semantic.status = semantic.required ? 'pending' : 'not-required';
    semantic.verifiedWorkspaceRevision = undefined;
    semantic.decision = undefined;
    semantic.reason = undefined;
    semantic.contradictions = [];
    semantic.nextEvidence = [];
}
export function applySemanticVerifierResult(state, result) {
    const episode = state.episode;
    if (!episode)
        return { rerouteAllowed: false, message: 'no active episode' };
    const semantic = episode.semanticVerification;
    semantic.attempts++;
    semantic.decision = result.decision;
    semantic.reason = result.reason;
    semantic.contradictions = [...result.contradictions];
    semantic.nextEvidence = [...result.nextEvidence];
    semantic.verifiedWorkspaceRevision = state.workspace.revision;
    if (result.decision === 'pass') {
        semantic.status = 'passed';
        return { rerouteAllowed: false, message: 'semantic verifier passed the current evidence packet' };
    }
    if (result.decision === 'warn') {
        semantic.status = 'warn';
        return { rerouteAllowed: false, message: 'semantic verifier returned warnings; completion remains blocked until resolved or explicitly waived' };
    }
    if (result.decision === 'patch') {
        semantic.status = 'failed';
        if (result.patchedHypothesis) {
            episode.route.hypothesis = result.patchedHypothesis;
            episode.route.epistemic = 'plausible';
            episode.route.evidenceActions = 0;
            episode.route.stallActions = 0;
            episode.route.revision++;
            if (result.nextEvidence[0])
                episode.route.nextEvidence = result.nextEvidence[0];
        }
        return { rerouteAllowed: false, message: 'semantic verifier patched the working hypothesis; route is preserved' };
    }
    if (result.decision === 'fail_route') {
        semantic.status = 'failed';
        episode.route.epistemic = 'contradicted';
        episode.route.stallActions = episode.route.maxEvidenceActions;
        return { rerouteAllowed: true, message: 'semantic verifier rejected the current route; reroute is allowed' };
    }
    semantic.status = 'unknown';
    return { rerouteAllowed: false, message: 'semantic verifier could not decide; more evidence is required' };
}
//# sourceMappingURL=verifier.js.map