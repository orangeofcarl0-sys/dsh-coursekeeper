import { createHash } from 'node:crypto';
import { fingerprint } from './core.js';
import { ageWeight, domainWeight } from './adaptive/similarity.js';
function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
function normalizeList(values) {
    return [...new Set(values.map(value => String(value).trim()).filter(Boolean))].sort();
}
function clip(value, max) { return String(value ?? '').trim().slice(0, max); }
export function sanitizeBranchEvidence(input) {
    const list = (values, maxItems, maxChars) => values.slice(0, maxItems).map(value => clip(value, maxChars)).filter(Boolean);
    return {
        summary: clip(input.summary, 2400),
        artifacts: normalizeList(list(input.artifacts, 64, 320)),
        commands: list(input.commands, 64, 2400),
        outputs: list(input.outputs, 64, 4800),
        unresolvedErrors: list(input.unresolvedErrors, 32, 2400),
        ...(input.acceptanceSatisfied === undefined ? {} : { acceptanceSatisfied: input.acceptanceSatisfied }),
        ...(input.verificationPassed === undefined ? {} : { verificationPassed: input.verificationPassed }),
        ...(input.benchmarkPassed === undefined ? {} : { benchmarkPassed: input.benchmarkPassed }),
        ...(input.patch === undefined ? {} : { patch: clip(input.patch, 24000) }),
    };
}
export function branchCandidateFingerprint(input) {
    const evidence = sanitizeBranchEvidence(input.evidence);
    const canonical = {
        origin: input.origin,
        route: input.route ?? '',
        artifacts: evidence.artifacts,
        commands: evidence.commands,
        outputs: evidence.outputs,
        errors: evidence.unresolvedErrors,
        patch: evidence.patch ?? '',
        acceptance: evidence.acceptanceSatisfied ?? null,
        verification: evidence.verificationPassed ?? null,
        benchmark: evidence.benchmarkPassed ?? null,
    };
    return fingerprint(JSON.stringify(canonical));
}
export function createBranchCandidate(input) {
    const evidence = sanitizeBranchEvidence(input.evidence);
    const normalized = { ...input, evidence };
    return {
        ...normalized,
        fingerprint: input.fingerprint ?? branchCandidateFingerprint(normalized),
        createdAt: input.createdAt ?? new Date().toISOString(),
    };
}
export function trajectoryContaminationScore(state) {
    const episode = state.episode;
    if (!episode)
        return 0;
    let score = 0;
    const falsified = episode.evidence.filter(event => event.kind === 'hypothesis-falsified').length;
    const failures = episode.transitions.filter(t => ['fail-route', 'verifier-fail', 'budget-exhausted'].includes(t.reason)).length;
    const noProgress = episode.evidence.filter(event => event.kind === 'no-progress').length;
    score += Math.min(0.30, falsified * 0.10);
    score += Math.min(0.30, failures * 0.15);
    score += Math.min(0.20, noProgress * 0.07);
    score += Math.min(0.20, state.noInformationStreak * 0.06);
    score += Math.min(0.12, state.repeatedCallCount * 0.03);
    score += Math.min(0.20, episode.route.stallActions * 0.05);
    if (episode.route.epistemic === 'contradicted')
        score += 0.18;
    else if (episode.route.epistemic === 'conflicted')
        score += 0.08;
    if (episode.semanticVerification.decision === 'fail_route')
        score += 0.22;
    else if (episode.semanticVerification.status === 'unknown')
        score += 0.08;
    return clamp(score);
}
function branchBucket(task, triggers) {
    const trigger = [...triggers].sort().join('+') || 'none';
    const uncertainty = task.uncertainty >= 0.7 ? 'u3' : task.uncertainty >= 0.45 ? 'u2' : 'u1';
    const coupling = task.coupling >= 0.7 ? 'c3' : task.coupling >= 0.45 ? 'c2' : 'c1';
    return `${task.kind}|${task.risk}|${uncertainty}|${coupling}|${trigger}`;
}
export function bayesianBranchEstimate(experiences, task, triggers, domain, options) {
    const prior = Math.max(0.5, options.priorStrength / 2);
    let alpha = prior;
    let beta = prior;
    const bucket = branchBucket(task, triggers);
    for (const exp of experiences) {
        if (exp.externalFailure || branchBucket(exp.task, exp.triggers) !== bucket)
            continue;
        const d = domainWeight(domain, exp.domain, options);
        if (d <= 0)
            continue;
        const w = d * ageWeight(exp.at, options.halfLifeDays);
        if (exp.useful && exp.finalReverifyPassed)
            alpha += w;
        else
            beta += w;
    }
    const effectiveN = Math.max(0, alpha + beta - 2 * prior);
    return { alpha, beta, mean: alpha / (alpha + beta), effectiveN };
}
export function branchTriggerDecision(state, task, domain, experiences, options) {
    if (!options.enabled || !state.episode) {
        return { eligible: false, triggers: [], contamination: 0, calibratedProbability: 0.5, effectiveSupport: 0, reason: 'verified branching disabled or no active episode' };
    }
    const episode = state.episode;
    const triggers = [];
    const lastTransition = episode.transitions.at(-1);
    if (options.triggerFailRoute && lastTransition && ['fail-route', 'verifier-fail'].includes(lastTransition.reason))
        triggers.push('fail-route');
    if (options.triggerNoProgress && (state.noInformationStreak >= 3 || episode.route.stallActions >= 3))
        triggers.push('no-progress');
    if (options.triggerLowRouteMargin && episode.adaptive && episode.adaptive.margin < options.routeMarginThreshold)
        triggers.push('low-route-margin');
    if (options.triggerSemanticUnknown && episode.semanticVerification.required && episode.semanticVerification.status === 'unknown')
        triggers.push('semantic-unknown');
    if (episode.semanticVerification.decision === 'fail_route')
        triggers.push('semantic-fail');
    const contamination = trajectoryContaminationScore(state);
    if (contamination >= options.contaminationThreshold)
        triggers.push('contaminated');
    const unique = [...new Set(triggers)];
    const estimate = bayesianBranchEstimate(experiences, task, unique, domain, options);
    const strong = unique.some(trigger => ['fail-route', 'semantic-fail', 'contaminated'].includes(trigger));
    const medium = unique.some(trigger => ['no-progress', 'semantic-unknown'].includes(trigger));
    const weakOnly = unique.length > 0 && !strong && !medium;
    // Cold start remains deterministic: strong events branch; medium events branch on
    // medium/high-risk or sufficiently contaminated episodes. History may suppress
    // weak triggers but never suppress a strong fail-route/contamination signal.
    const baseEligible = strong || (medium && (episode.contract.risk !== 'low' || contamination >= options.contaminationThreshold * 0.8))
        || (weakOnly && episode.contract.risk === 'high');
    const calibratedEligible = estimate.effectiveN < 3 ? baseEligible
        : strong || (baseEligible && estimate.mean >= options.minBranchProbability);
    return {
        eligible: unique.length > 0 && calibratedEligible,
        triggers: unique,
        contamination,
        calibratedProbability: estimate.mean,
        effectiveSupport: estimate.effectiveN,
        reason: unique.length === 0
            ? 'no branch trigger is active'
            : calibratedEligible
                ? `branch eligible: ${unique.join(', ')}; contamination=${contamination.toFixed(2)}; pUseful=${estimate.mean.toFixed(2)}`
                : `branch suppressed by conservative calibration: ${unique.join(', ')}; pUseful=${estimate.mean.toFixed(2)}`,
    };
}
export function assessCandidate(candidate) {
    const evidence = candidate.evidence;
    const reasons = [];
    if (evidence.unresolvedErrors.length > 0)
        reasons.push(`unresolved-errors:${evidence.unresolvedErrors.length}`);
    if (evidence.verificationPassed === false)
        reasons.push('verification-failed');
    if (evidence.benchmarkPassed === false)
        reasons.push('benchmark-failed');
    if (evidence.acceptanceSatisfied === false)
        reasons.push('acceptance-not-satisfied');
    const hardFail = reasons.length > 0;
    if (hardFail)
        return { candidateId: candidate.id, verdict: 'fail', score: 0, reasons };
    let score = 0.35;
    if (evidence.acceptanceSatisfied === true)
        score += 0.20;
    if (evidence.verificationPassed === true)
        score += 0.30;
    if (evidence.benchmarkPassed === true)
        score += 0.10;
    if (evidence.outputs.length > 0)
        score += 0.05;
    const verdict = evidence.acceptanceSatisfied === true && evidence.verificationPassed === true ? 'pass' : 'unknown';
    return { candidateId: candidate.id, verdict, score: clamp(score), reasons: verdict === 'pass' ? ['deterministic-obligations-passed'] : ['requires-semantic-comparison'] };
}
export function deduplicateCandidates(candidates) {
    const seen = new Map();
    const unique = [];
    const duplicates = [];
    for (const candidate of candidates) {
        const previous = seen.get(candidate.fingerprint);
        if (previous) {
            duplicates.push(candidate.id);
            continue;
        }
        seen.set(candidate.fingerprint, candidate.id);
        unique.push(candidate);
    }
    return { unique, duplicates };
}
export function deterministicPrefilter(candidates) {
    const deduped = deduplicateCandidates(candidates).unique;
    const assessments = deduped.map(assessCandidate);
    const survivors = deduped.filter(candidate => assessments.find(a => a.candidateId === candidate.id)?.verdict !== 'fail');
    if (survivors.length === 0)
        return { survivors: [], assessments, noValidCandidate: true };
    const passes = survivors.filter(candidate => assessments.find(a => a.candidateId === candidate.id)?.verdict === 'pass');
    if (passes.length === 1 && survivors.every(candidate => candidate.id === passes[0].id || assessments.find(a => a.candidateId === candidate.id)?.verdict === 'fail')) {
        return { survivors, assessments, selectedCandidateId: passes[0].id, noValidCandidate: false };
    }
    return { survivors, assessments, noValidCandidate: false };
}
function evidenceText(candidate) {
    const e = candidate.evidence;
    return [
        `candidate_id: ${candidate.id}`,
        `origin: ${candidate.origin}`,
        `route: ${candidate.route ?? 'unspecified'}`,
        `summary: ${e.summary}`,
        `artifacts: ${normalizeList(e.artifacts).join(', ') || '(none)'}`,
        `acceptance_satisfied: ${String(e.acceptanceSatisfied ?? 'unknown')}`,
        `verification_passed: ${String(e.verificationPassed ?? 'unknown')}`,
        `benchmark_passed: ${String(e.benchmarkPassed ?? 'unknown')}`,
        `unresolved_errors:\n${e.unresolvedErrors.map(x => `- ${x}`).join('\n') || '- none'}`,
        `commands:\n${e.commands.map(x => `- ${x}`).join('\n') || '- none'}`,
        `observed_outputs:\n${e.outputs.map(x => `- ${x}`).join('\n') || '- none'}`,
        e.patch ? `patch_or_artifact_delta:\n${e.patch.slice(0, 12000)}` : 'patch_or_artifact_delta: (not supplied)',
    ].join('\n');
}
export const DEFAULT_COMPARATIVE_CRITERIA = ['acceptance', 'evidence', 'errors'];
export function comparativeVerifierPrompt(objective, a, b, criteria = DEFAULT_COMPARATIVE_CRITERIA) {
    return [
        'Compare two isolated agent candidates for the same task.',
        'This is fresh-context verification. Do not continue either candidate reasoning narrative and do not reward confidence, verbosity, or effort.',
        'Use observable artifacts, commands, outputs, verification and unresolved errors as evidence. If both are inadequate, choose no_valid_candidate.',
        `Task:\n${objective}`,
        `Criteria: ${criteria.join(', ')}`,
        `Candidate A:\n${evidenceText(a)}`,
        `Candidate B:\n${evidenceText(b)}`,
        'Return JSON only:',
        '{"decision":"a|b|tie|no_valid_candidate","scoreA":0.0,"scoreB":0.0,"confidence":0.0,"reason":"...","criterionScores":{"acceptance":{"a":0.0,"b":0.0}}}',
        'Scores are probabilities of satisfying the task under the named evidence criteria, not style scores.',
    ].join('\n\n');
}
export function parseComparativeVerifierResult(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start)
        return undefined;
    try {
        const raw = JSON.parse(text.slice(start, end + 1));
        if (!['a', 'b', 'tie', 'no_valid_candidate'].includes(String(raw.decision)))
            return undefined;
        const scoreA = clamp(Number(raw.scoreA));
        const scoreB = clamp(Number(raw.scoreB));
        const confidence = clamp(Number(raw.confidence));
        const criterionScores = {};
        if (raw.criterionScores && typeof raw.criterionScores === 'object') {
            for (const [key, value] of Object.entries(raw.criterionScores)) {
                if (!value || typeof value !== 'object')
                    continue;
                criterionScores[key] = { a: clamp(Number(value.a)), b: clamp(Number(value.b)) };
            }
        }
        return {
            decision: raw.decision,
            scoreA,
            scoreB,
            confidence,
            ...(Object.keys(criterionScores).length ? { criterionScores } : {}),
            reason: String(raw.reason ?? '').slice(0, 1200),
        };
    }
    catch {
        return undefined;
    }
}
export function selectPair(a, b, result, options) {
    const bestScore = Math.max(result.scoreA, result.scoreB);
    const margin = Math.abs(result.scoreA - result.scoreB);
    if (result.decision === 'no_valid_candidate' || bestScore < options.minScore) {
        return { status: 'no-valid-candidate', margin, reason: `verifier found no candidate above minimum score ${options.minScore.toFixed(2)}: ${result.reason}` };
    }
    if (result.decision === 'tie' || margin < options.margin) {
        return { status: 'expand', margin, reason: `candidate margin ${margin.toFixed(3)} below ${options.margin.toFixed(3)}; another candidate may be valuable` };
    }
    const candidateId = result.decision === 'a' ? a.id : b.id;
    return { status: 'selected', candidateId, margin, reason: result.reason || `verifier selected ${candidateId}` };
}
export function branchRingPairs(items) {
    if (items.length < 2)
        return [];
    return items.map((item, i) => [item, items[(i + 1) % items.length]]);
}
export function branchPivotRoundPairs(items, pivotIds) {
    const pivots = items.filter(item => pivotIds.includes(item.id));
    const non = items.filter(item => !pivotIds.includes(item.id));
    const pairs = [];
    for (const item of non)
        for (const pivot of pivots)
            pairs.push([item, pivot]);
    for (let i = 0; i < pivots.length; i++)
        for (let j = i + 1; j < pivots.length; j++)
            pairs.push([pivots[i], pivots[j]]);
    return pairs;
}
export function branchSoftWin(scoreA, scoreB) {
    return 1 / (1 + Math.exp(-(clamp(scoreA) - clamp(scoreB))));
}
export function buildBranchExperience(input) {
    const selected = input.candidates.find(candidate => candidate.id === input.selectedCandidateId);
    const current = input.candidates.find(candidate => candidate.origin === 'current');
    const selectedDifferentFromCurrent = Boolean(selected && (!current || selected.id !== current.id));
    const useful = input.finalReverifyPassed && selectedDifferentFromCurrent;
    const at = new Date().toISOString();
    const id = createHash('sha256')
        .update(`${at}\0${input.task.objectiveHash}\0${input.triggers.join(',')}\0${input.selectedCandidateId ?? 'none'}`)
        .digest('hex').slice(0, 24);
    return {
        schemaVersion: 1,
        id,
        at,
        domain: input.domain,
        generatorProtocol: input.generatorProtocol,
        verifierProtocol: input.verifierProtocol,
        task: input.task,
        triggers: [...input.triggers],
        contamination: clamp(input.contamination),
        candidateCount: input.candidates.length,
        ...(selected ? { selectedOrigin: selected.origin } : {}),
        selectedDifferentFromCurrent,
        finalReverifyPassed: input.finalReverifyPassed,
        useful,
        externalFailure: input.externalFailure,
        incrementalCost: {
            verifierCalls: input.verifierCalls,
            branchCandidates: Math.max(0, input.candidates.length - (current ? 1 : 0)),
            ...(input.inputTokens === undefined ? {} : { inputTokens: input.inputTokens }),
            ...(input.cachedInputTokens === undefined ? {} : { cachedInputTokens: input.cachedInputTokens }),
            ...(input.reasoningTokens === undefined ? {} : { reasoningTokens: input.reasoningTokens }),
        },
    };
}
//# sourceMappingURL=branching.js.map