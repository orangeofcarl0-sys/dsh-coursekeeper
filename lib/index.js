import z from '@deepseek-ai/schemastery';
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_BENCHMARK_TOOL_NAMES, DEFAULT_FINISH_TOOL_NAMES, DEFAULT_VERIFICATION_TOOL_NAMES, COURSEKEEPER_CONTROL_TOOL, COURSEKEEPER_STATUS_TOOL, COURSEKEEPER_VERIFY_TOOL, COURSEKEEPER_BRANCH_TOOL, LEGACY_TRAJECTORY_CONTROL_TOOL, LEGACY_TRAJECTORY_VERIFY_TOOL, classifyTaskContract, classifyTool, fingerprint, isTerminalLlmFailure, } from './core.js';
import { acceptHumanTask, applyTrajectoryControl, applyAdaptiveInitialRoute, applyAdaptiveEscalation, blockerReport, completionBlockers, openAcceptanceCount, openVerificationCount, benchmarkBlocker, createGovernorState, currentControlPacket, markHintInjected, mutationGate, rebuildStateFromEvents, refreshPolicyHint, registerToolCall, settleToolCall, verificationPrompt, startBranchWave, registerBranchCandidate, recordBranchSelection, recordNoValidBranchCandidate, reopenAfterBranchApply, } from './state.js';
import { applySemanticVerifierResult, buildEvidencePacket, parseSemanticVerifierResult, verifierPrompt as semanticVerifierPrompt, } from './verifier.js';
import { applyNativeCanonicalProfile, applyRouterAssist, jspaceAssistKernel, observeRequestProtocol } from './profiles.js';
import { DecisionLedger } from './ledger.js';
import { BranchExperienceStore } from './branching-store.js';
import { branchTriggerDecision, createBranchCandidate, deterministicPrefilter, comparativeVerifierPrompt, parseComparativeVerifierResult, selectPair, buildBranchExperience, trajectoryContaminationScore, branchRingPairs, branchPivotRoundPairs, branchSoftWin, } from './branching.js';
import { ExperienceStore, buildTaskSignature, decideAdaptiveRoute, suggestEscalation, buildRouteExperience, inferCompletion, routeChallengerPrompt, parseRouteChallenge, withChallenge, } from './adaptive/index.js';
export * from './core.js';
export * from './debt.js';
export * from './state.js';
export * from './types.js';
export * from './verifier.js';
export * from './profiles.js';
export * from './adaptive/index.js';
export * from './branching.js';
export * from './branching-store.js';
export const name = 'coursekeeper';
export const inject = ['agents', 'sessions', 'systemPrompt', 'tools', 'llm'];
export const Config = z.object({
    mode: z.union(['off', 'shadow', 'active']).default('active'),
    rolloutMode: z.union(['single', 'verified-branching']).default('single'),
    branchLearning: z.union(['off', 'shadow', 'active']).default('shadow'),
    branchExperienceMemory: z.boolean().default(true),
    branchExperiencePath: z.string(),
    branchExperienceMaxEntries: z.natural().min(16).default(2000),
    branchInitialCandidates: z.natural().min(2).max(5).default(2),
    branchMaxCandidates: z.natural().min(2).max(8).default(3),
    branchPivots: z.natural().min(1).max(4).default(1),
    maxBranchWavesPerEpisode: z.natural().min(1).max(4).default(1),
    branchAutoStart: z.boolean().default(true),
    branchTriggerFailRoute: z.boolean().default(true),
    branchTriggerNoProgress: z.boolean().default(true),
    branchTriggerLowRouteMargin: z.boolean().default(true),
    branchTriggerSemanticUnknown: z.boolean().default(true),
    branchContaminationThreshold: z.number().min(0).max(1).default(0.62),
    branchMinProbability: z.number().min(0).max(1).default(0.45),
    branchSelectionMinScore: z.number().min(0).max(1).default(0.55),
    branchSelectionMargin: z.number().min(0).max(1).default(0.08),
    comparativeVerifierProvider: z.string(),
    comparativeVerifierModel: z.string(),
    comparativeVerifierMaxTokens: z.natural().min(128).default(1536),
    maxComparativeVerifierCalls: z.natural().min(1).default(8),
    comparativeVerifierCriteria: z.array(z.string()).default(['acceptance', 'evidence', 'errors']),
    exposeBranchTool: z.boolean().default(false),
    crossProtocolWeight: z.number().min(0).max(1).default(0),
    crossRolloutWeight: z.number().min(0).max(1).default(0.25),
    augmentationProfile: z.union(['governor', 'jspace-assist', 'router-assist', 'hybrid-assist', 'native-canonical']).default('governor'),
    jspaceAssist: z.union(['off', 'lite', 'legacy']).default('off'),
    routerAssist: z.union(['off', 'minimal-first', 'task-aware']).default('off'),
    semanticVerifier: z.union(['off', 'risk', 'always']).default('risk'),
    semanticVerifierProvider: z.string(),
    semanticVerifierModel: z.string(),
    semanticVerifierMaxTokens: z.natural().min(128).default(1536),
    maxSemanticVerifierCalls: z.natural().min(1).default(2),
    capabilityControl: z.union(['advisory', 'guard', 'restrict']).default('guard'),
    adaptiveReasoning: z.union(['off', 'episode', 'phase']).default('off'),
    adaptiveRouting: z.union(['off', 'shadow', 'active']).default('shadow'),
    adaptiveEscalation: z.union(['off', 'rules', 'calibrated']).default('calibrated'),
    routeChallenger: z.union(['off', 'risk']).default('risk'),
    routeChallengerMinRisk: z.union(['low', 'medium', 'high']).default('medium'),
    maxRouteChallengesPerEpisode: z.natural().min(1).default(1),
    experienceMemory: z.boolean().default(true),
    experiencePath: z.string(),
    experienceMaxEntries: z.natural().min(16).default(5000),
    memoryTopK: z.natural().min(1).default(8),
    memoryMinSimilarity: z.number().min(0).max(1).default(0.60),
    experienceHalfLifeDays: z.number().min(1).default(90),
    bayesianCalibration: z.boolean().default(true),
    bayesianPriorStrength: z.number().min(1).default(6),
    memoryWeight: z.number().min(0).max(1).default(0.10),
    bayesianWeight: z.number().min(0).max(1).default(0.10),
    maxAdaptiveAdjustment: z.number().min(0).max(1).default(0.15),
    minEffectiveSupport: z.number().min(0).default(3),
    routeMarginThreshold: z.number().min(0).default(0.08),
    safeExplorationRate: z.number().min(0).max(1).default(0),
    crossProfileWeight: z.number().min(0).max(1).default(0.25),
    crossModelWeight: z.number().min(0).max(1).default(0),
    stalePolicyWeight: z.number().min(0).max(1).default(0.5),
    harnessVersion: z.string(),
    modelRevision: z.string(),
    autoVerify: z.boolean().default(true),
    maxAutomaticContinuations: z.natural().default(1),
    noInformationLimit: z.natural().min(2).default(3),
    maxDynamicHintChars: z.natural().min(160).default(640),
    exposeStatusTool: z.boolean().default(true),
    exposeControlTool: z.boolean().default(true),
    exposeSemanticVerifierTool: z.boolean().default(true),
    ledger: z.boolean().default(true),
    ledgerPath: z.string(),
    maxLedgerBytes: z.natural().min(1024).default(10 * 1024 * 1024),
    benchmarkRequired: z.boolean().default(false),
    benchmarkToolNames: z.array(z.string()).default([...DEFAULT_BENCHMARK_TOOL_NAMES]),
    verificationToolNames: z.array(z.string()).default([...DEFAULT_VERIFICATION_TOOL_NAMES]),
    finishToolNames: z.array(z.string()).default([...DEFAULT_FINISH_TOOL_NAMES]),
    fullBenchmarkMinQueries: z.natural().min(1).default(10_000),
    fullBenchmarkMinRecall: z.number().min(0).max(1).default(0.95),
    benchmarkScoreTolerancePercent: z.number().min(0).max(100).default(2),
    stopRetryOnDeterministicErrors: z.boolean().default(true),
    maxTrackedResults: z.natural().min(8).default(256),
});
function resolvedConfig(input) {
    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
    const adaptive = input.adaptiveReasoning === true ? 'phase'
        : input.adaptiveReasoning === false || input.adaptiveReasoning === undefined ? 'off'
            : input.adaptiveReasoning;
    const profile = input.augmentationProfile ?? 'governor';
    const nativeCanonical = profile === 'native-canonical';
    const profileJSpace = profile === 'jspace-assist' || profile === 'hybrid-assist' ? 'lite' : 'off';
    const profileRouter = profile === 'router-assist' || profile === 'hybrid-assist' ? 'minimal-first' : 'off';
    return {
        mode: input.mode ?? 'active',
        rolloutMode: input.rolloutMode ?? 'single',
        branchLearning: input.branchLearning ?? 'shadow',
        branchExperienceMemory: input.branchExperienceMemory ?? true,
        branchExperiencePath: input.branchExperiencePath ?? join(dshHome, 'coursekeeper', 'branch-experiences-v1.jsonl'),
        branchExperienceMaxEntries: input.branchExperienceMaxEntries ?? 2000,
        branchInitialCandidates: input.branchInitialCandidates ?? 2,
        branchMaxCandidates: Math.max(input.branchInitialCandidates ?? 2, input.branchMaxCandidates ?? 3),
        branchPivots: input.branchPivots ?? 1,
        maxBranchWavesPerEpisode: input.maxBranchWavesPerEpisode ?? 1,
        branchAutoStart: input.branchAutoStart ?? true,
        branchTriggerFailRoute: input.branchTriggerFailRoute ?? true,
        branchTriggerNoProgress: input.branchTriggerNoProgress ?? true,
        branchTriggerLowRouteMargin: input.branchTriggerLowRouteMargin ?? true,
        branchTriggerSemanticUnknown: input.branchTriggerSemanticUnknown ?? true,
        branchContaminationThreshold: input.branchContaminationThreshold ?? 0.62,
        branchMinProbability: input.branchMinProbability ?? 0.45,
        branchSelectionMinScore: input.branchSelectionMinScore ?? 0.55,
        branchSelectionMargin: input.branchSelectionMargin ?? 0.08,
        ...(input.comparativeVerifierProvider ? { comparativeVerifierProvider: input.comparativeVerifierProvider } : {}),
        ...(input.comparativeVerifierModel ? { comparativeVerifierModel: input.comparativeVerifierModel } : {}),
        comparativeVerifierMaxTokens: input.comparativeVerifierMaxTokens ?? 1536,
        maxComparativeVerifierCalls: input.maxComparativeVerifierCalls ?? 8,
        comparativeVerifierCriteria: input.comparativeVerifierCriteria ?? ['acceptance', 'evidence', 'errors'],
        exposeBranchTool: input.exposeBranchTool ?? ((input.rolloutMode ?? 'single') === 'verified-branching'),
        crossProtocolWeight: input.crossProtocolWeight ?? 0,
        crossRolloutWeight: input.crossRolloutWeight ?? 0.25,
        augmentationProfile: profile,
        jspaceAssist: nativeCanonical ? 'off' : (input.jspaceAssist ?? profileJSpace),
        routerAssist: nativeCanonical ? 'off' : (input.routerAssist ?? profileRouter),
        semanticVerifier: input.semanticVerifier ?? 'risk',
        ...(input.semanticVerifierProvider ? { semanticVerifierProvider: input.semanticVerifierProvider } : {}),
        ...(input.semanticVerifierModel ? { semanticVerifierModel: input.semanticVerifierModel } : {}),
        semanticVerifierMaxTokens: input.semanticVerifierMaxTokens ?? 1536,
        maxSemanticVerifierCalls: input.maxSemanticVerifierCalls ?? 2,
        capabilityControl: input.capabilityControl ?? 'guard',
        adaptiveReasoning: nativeCanonical ? 'off' : adaptive,
        adaptiveRouting: input.adaptiveRouting ?? 'shadow',
        adaptiveEscalation: input.adaptiveEscalation ?? 'calibrated',
        routeChallenger: input.routeChallenger ?? 'risk',
        routeChallengerMinRisk: input.routeChallengerMinRisk ?? 'medium',
        maxRouteChallengesPerEpisode: input.maxRouteChallengesPerEpisode ?? 1,
        experienceMemory: input.experienceMemory ?? true,
        experiencePath: input.experiencePath ?? join(dshHome, 'coursekeeper', 'experiences-v1.jsonl'),
        experienceMaxEntries: input.experienceMaxEntries ?? 5000,
        memoryTopK: input.memoryTopK ?? 8,
        memoryMinSimilarity: input.memoryMinSimilarity ?? 0.60,
        experienceHalfLifeDays: input.experienceHalfLifeDays ?? 90,
        bayesianCalibration: input.bayesianCalibration ?? true,
        bayesianPriorStrength: input.bayesianPriorStrength ?? 6,
        memoryWeight: input.memoryWeight ?? 0.10,
        bayesianWeight: input.bayesianWeight ?? 0.10,
        maxAdaptiveAdjustment: input.maxAdaptiveAdjustment ?? 0.15,
        minEffectiveSupport: input.minEffectiveSupport ?? 3,
        routeMarginThreshold: input.routeMarginThreshold ?? 0.08,
        safeExplorationRate: input.safeExplorationRate ?? 0,
        crossProfileWeight: input.crossProfileWeight ?? 0.25,
        crossModelWeight: input.crossModelWeight ?? 0,
        stalePolicyWeight: input.stalePolicyWeight ?? 0.5,
        harnessVersion: input.harnessVersion ?? 'dsh-0.1.x',
        modelRevision: input.modelRevision ?? 'unspecified',
        autoVerify: input.autoVerify ?? true,
        maxAutomaticContinuations: input.maxAutomaticContinuations ?? 1,
        noInformationLimit: input.noInformationLimit ?? 3,
        maxDynamicHintChars: input.maxDynamicHintChars ?? 640,
        exposeStatusTool: input.exposeStatusTool ?? (nativeCanonical ? false : true),
        exposeControlTool: input.exposeControlTool ?? (nativeCanonical ? false : true),
        exposeSemanticVerifierTool: input.exposeSemanticVerifierTool ?? (nativeCanonical ? false : true),
        ledger: input.ledger ?? true,
        ledgerPath: input.ledgerPath ?? join(dshHome, 'coursekeeper', 'decisions.jsonl'),
        maxLedgerBytes: input.maxLedgerBytes ?? 10 * 1024 * 1024,
        benchmarkRequired: input.benchmarkRequired ?? false,
        benchmarkToolNames: input.benchmarkToolNames ?? [...DEFAULT_BENCHMARK_TOOL_NAMES],
        verificationToolNames: input.verificationToolNames ?? [...DEFAULT_VERIFICATION_TOOL_NAMES],
        finishToolNames: input.finishToolNames ?? [...DEFAULT_FINISH_TOOL_NAMES],
        fullBenchmarkMinQueries: input.fullBenchmarkMinQueries ?? 10_000,
        fullBenchmarkMinRecall: input.fullBenchmarkMinRecall ?? 0.95,
        benchmarkScoreTolerancePercent: input.benchmarkScoreTolerancePercent ?? 2,
        stopRetryOnDeterministicErrors: input.stopRetryOnDeterministicErrors ?? true,
        maxTrackedResults: input.maxTrackedResults ?? 256,
    };
}
function newEpisodeMetrics() {
    return { requests: 0, steps: 0, toolCalls: 0, verifierCalls: 0, routeChallenges: 0, recoveries: 0, comparativeVerifierCalls: 0, branchCandidates: 0 };
}
function normalizedFamily(value) {
    return String(value ?? 'unknown').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 96) || 'unknown';
}
function riskRank(risk) { return risk === 'high' ? 2 : risk === 'medium' ? 1 : 0; }
function contentText(content) {
    return (content ?? []).map((block) => {
        if (typeof block === 'string')
            return block;
        if (block?.type === 'text' || block?.type === 'reasoning')
            return String(block.text ?? '');
        if (block?.type === 'tool-result')
            return contentText(block.content ?? []);
        return '';
    }).join('\n');
}
function parseArguments(raw) {
    if (typeof raw !== 'string')
        return raw;
    try {
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
function pluginMessage(text, purpose) {
    return createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'plugin', plugin: `coursekeeper/${purpose}` },
    });
}
function insertAfterLastHuman(messages, inserted) {
    const output = [...messages];
    const index = output.findLastIndex(message => message?.source?.kind === 'user');
    output.splice(index < 0 ? output.length : index + 1, 0, inserted);
    return output;
}
function effortRank(id, index) {
    const value = id.toLowerCase();
    if (value === 'max')
        return 100;
    if (value === 'xhigh')
        return 90;
    if (value === 'high')
        return 80;
    if (value === 'medium')
        return 60;
    if (value === 'low')
        return 40;
    if (value === 'off' || value === 'none' || value === 'disabled')
        return 0;
    return 50 + index;
}
function deepestEffort(info) {
    const efforts = info?.reasoning?.efforts;
    if (!Array.isArray(efforts) || efforts.length === 0)
        return undefined;
    return [...efforts]
        .sort((a, b) => effortRank(String(b.id), efforts.indexOf(b)) - effortRank(String(a.id), efforts.indexOf(a)))
        .find(effort => effortRank(String(effort.id), efforts.indexOf(effort)) > 0)?.id;
}
function phaseNeedsDepth(phase) {
    return phase === 'inspect' || phase === 'design' || phase === 'recover';
}
function episodeNeedsDepth(state) {
    const episode = state.episode;
    if (!episode)
        return false;
    return episode.route.route === 'plan' || episode.route.route === 'explore'
        || (episode.route.route === 'inspect' && (episode.contract.risk === 'high' || episode.contract.complexity >= 0.68));
}
export function apply(ctx, inputConfig = {}) {
    const config = resolvedConfig(inputConfig);
    const runtimeStates = new Map();
    const sessionStates = new WeakMap();
    const modelInfo = new Map();
    const ledger = new DecisionLedger({ enabled: config.ledger, path: config.ledgerPath, maxBytes: config.maxLedgerBytes });
    const experienceStore = new ExperienceStore({ enabled: config.experienceMemory, path: config.experiencePath, maxInMemory: config.experienceMaxEntries });
    const branchExperienceStore = new BranchExperienceStore({ enabled: config.branchExperienceMemory, path: config.branchExperiencePath, maxInMemory: config.branchExperienceMaxEntries });
    void experienceStore.ready();
    void branchExperienceStore.ready();
    const stateOptions = () => ({
        maxDynamicHintChars: config.maxDynamicHintChars,
        noInformationLimit: config.noInformationLimit,
        fullBenchmarkMinQueries: config.fullBenchmarkMinQueries,
        fullBenchmarkMinRecall: config.fullBenchmarkMinRecall,
        benchmarkScoreTolerancePercent: config.benchmarkScoreTolerancePercent,
        benchmarkRequired: config.benchmarkRequired,
        benchmarkToolNames: config.benchmarkToolNames,
        verificationToolNames: config.verificationToolNames,
        finishToolNames: config.finishToolNames,
        semanticVerifierMode: config.semanticVerifier,
    });
    const classifyExecution = (execution) => classifyTool(execution.name, parseArguments(execution.arguments ?? {}), {
        benchmarkToolNames: config.benchmarkToolNames,
        verificationToolNames: config.verificationToolNames,
        finishToolNames: config.finishToolNames,
        controlToolNames: [COURSEKEEPER_CONTROL_TOOL, COURSEKEEPER_VERIFY_TOOL, COURSEKEEPER_BRANCH_TOOL, LEGACY_TRAJECTORY_CONTROL_TOOL, LEGACY_TRAJECTORY_VERIFY_TOOL],
    });
    const stateFor = (agent) => {
        let runtime = runtimeStates.get(agent);
        if (runtime)
            return runtime;
        const governor = Array.isArray(agent?.session?.events)
            ? rebuildStateFromEvents(agent.session.events, stateOptions())
            : createGovernorState();
        runtime = {
            agent, governor, restrictionDenied: [], effortOverrideApplied: false, semanticVerifierInFlight: false,
            metrics: newEpisodeMetrics(), externalFailure: false, routeChallengeCount: 0, branchVerifierInFlight: false, suppressedVisiblePolicies: 0,
        };
        runtimeStates.set(agent, runtime);
        if (agent?.session)
            sessionStates.set(agent.session, runtime);
        installGuard(runtime);
        refreshRestriction(runtime);
        ledger.record({ event: 'state/rebuilt', sessionId: agent?.id, events: agent?.session?.events?.length ?? 0, episode: governor.episode?.id ?? null });
        return runtime;
    };
    const generatorProtocolFingerprint = (runtime) => fingerprint(JSON.stringify({
        profile: config.augmentationProfile,
        assemblyHash: runtime.governor.assemblyHash ?? 'unobserved',
        nativeToolSurface: runtime.nativeCanonicalSurface?.toolSurfaceHash ?? 'none',
        nativePersonaExact: runtime.nativeCanonicalSurface?.personaExact ?? null,
        nativeToolPrefix: runtime.nativeCanonicalSurface?.toolPrefix ?? [],
    }));
    const domainFor = (runtime) => ({
        providerFamily: normalizedFamily(runtime.lastProvider ?? runtime.agent?.options?.provider),
        modelFamily: normalizedFamily(runtime.lastModel ?? runtime.agent?.options?.model),
        modelRevision: config.modelRevision,
        augmentationProfile: config.augmentationProfile,
        harnessVersion: config.harnessVersion,
        policySchemaVersion: 'coursekeeper-adaptive-v2',
        protocolFingerprint: generatorProtocolFingerprint(runtime),
        rolloutMode: config.rolloutMode,
    });
    const metricsFor = (runtime) => ({
        requests: runtime.metrics.requests,
        steps: runtime.metrics.steps,
        toolCalls: runtime.metrics.toolCalls,
        evidenceActions: runtime.governor.episode?.evidence.filter(event => event.weight > 0).length ?? 0,
        verifierCalls: runtime.metrics.verifierCalls,
        routeChallenges: runtime.metrics.routeChallenges,
        reroutes: runtime.governor.episode?.transitions.length ?? 0,
        recoveries: runtime.metrics.recoveries,
        ...(runtime.metrics.inputTokens === undefined ? {} : { inputTokens: runtime.metrics.inputTokens }),
        ...(runtime.metrics.cachedInputTokens === undefined ? {} : { cachedInputTokens: runtime.metrics.cachedInputTokens }),
        ...(runtime.metrics.reasoningTokens === undefined ? {} : { reasoningTokens: runtime.metrics.reasoningTokens }),
    });
    const finalizeExperience = (runtime, forceCompletion) => {
        const state = runtime.governor;
        const episode = state.episode;
        if (!episode)
            return;
        const completion = forceCompletion ?? inferCompletion(state, config.benchmarkRequired);
        finalizeBranchExperience(runtime, completion === 'success');
        if (runtime.experienceRecordedEpisode === episode.id || !config.experienceMemory)
            return;
        const signature = runtime.taskSignature ?? buildTaskSignature(episode.contract, state.knownArtifacts);
        const domain = runtime.calibrationDomain ?? domainFor(runtime);
        const experience = buildRouteExperience(state, signature, domain, metricsFor(runtime), completion, runtime.externalFailure, config.benchmarkRequired);
        if (!experience)
            return;
        experienceStore.append(experience);
        runtime.experienceRecordedEpisode = episode.id;
        ledger.record({
            event: 'adaptive/experience', sessionId: runtime.agent?.id, episode: episode.id,
            initialRoute: experience.initialRoute, finalRoute: experience.finalRoute, completion: experience.completion,
            routeSignals: experience.routeSignals, transitions: experience.transitions, domain: experience.domain,
        });
    };
    const verifierProtocolFor = (runtime) => {
        let scoring = 'structured';
        try {
            scoring = (ctx.coursekeeperComparativeVerifier?.scoring ?? 'structured');
        }
        catch { /* optional host capability absent */ }
        return {
            profile: 'fresh-evidence-evaluator-v1',
            providerFamily: normalizedFamily(config.comparativeVerifierProvider ?? runtime.lastProvider ?? runtime.agent?.options?.provider),
            modelFamily: normalizedFamily(config.comparativeVerifierModel ?? runtime.lastModel ?? runtime.agent?.options?.model),
            context: 'fresh',
            includesGeneratorReasoning: false,
            scoring,
        };
    };
    const finalizeBranchExperience = (runtime, finalReverifyPassed) => {
        const episode = runtime.governor.episode;
        const wave = episode?.branching.current;
        if (!episode || !wave || wave.candidates.size === 0 || runtime.branchExperienceRecordedWave === wave.id || !config.branchExperienceMemory)
            return;
        const signature = runtime.taskSignature ?? buildTaskSignature(episode.contract, runtime.governor.knownArtifacts);
        const domain = runtime.calibrationDomain ?? domainFor(runtime);
        const row = buildBranchExperience({
            domain,
            generatorProtocol: { profile: config.augmentationProfile, fingerprint: generatorProtocolFingerprint(runtime) },
            verifierProtocol: verifierProtocolFor(runtime),
            task: signature,
            triggers: wave.triggers,
            contamination: wave.contamination,
            candidates: [...wave.candidates.values()],
            selectedCandidateId: wave.selectedCandidateId,
            finalReverifyPassed,
            externalFailure: runtime.externalFailure,
            verifierCalls: wave.verifierCalls,
        });
        branchExperienceStore.append(row);
        runtime.branchExperienceRecordedWave = wave.id;
        ledger.record({
            event: 'branch/experience', sessionId: runtime.agent?.id, episode: episode.id, wave: wave.id,
            useful: row.useful, selectedOrigin: row.selectedOrigin ?? null, finalReverifyPassed,
            triggers: row.triggers, candidateCount: row.candidateCount, domain: row.domain,
        });
    };
    const currentBranchCandidate = (runtime) => {
        const state = runtime.governor;
        const episode = state.episode;
        if (!episode)
            return undefined;
        const recent = episode.evidence.slice(-16).map(event => `${event.kind}: ${event.summary}`);
        const candidate = createBranchCandidate({
            id: `w${episode.branching.wavesStarted || 1}-current`,
            origin: 'current',
            route: episode.route.route,
            evidence: {
                summary: `Current main trajectory at route=${episode.route.route}, phase=${episode.phase}, workspaceRevision=${state.workspace.revision}.`,
                artifacts: [...state.knownArtifacts],
                commands: [],
                outputs: recent,
                unresolvedErrors: episode.recoveryBlocker ? [episode.recoveryBlocker] : [],
                ...(openAcceptanceCount(state) === 0 ? { acceptanceSatisfied: true } : {}),
                ...(openVerificationCount(state) === 0 ? { verificationPassed: true } : {}),
                ...(benchmarkBlocker(state, stateOptions()) === undefined ? { benchmarkPassed: true } : {}),
            },
        });
        return candidate;
    };
    const resolveBranchRuntime = (runtime) => {
        if (runtime.branchRuntime)
            return runtime.branchRuntime;
        let candidate;
        try {
            // coursekeeperBranching is an optional host capability, not a required
            // cordis injection: accessing an uninjected context property throws.
            candidate = ctx.coursekeeperBranching;
        }
        catch {
            candidate = undefined;
        }
        if (candidate?.workspace?.checkpoint && candidate?.workspace?.fork && candidate?.workspace?.apply && candidate?.executor?.execute) {
            runtime.branchRuntime = candidate;
            return runtime.branchRuntime;
        }
        return undefined;
    };
    const branchPolicyOptions = () => ({
        enabled: config.rolloutMode === 'verified-branching',
        triggerFailRoute: config.branchTriggerFailRoute,
        triggerNoProgress: config.branchTriggerNoProgress,
        triggerLowRouteMargin: config.branchTriggerLowRouteMargin,
        triggerSemanticUnknown: config.branchTriggerSemanticUnknown,
        contaminationThreshold: config.branchContaminationThreshold,
        routeMarginThreshold: config.routeMarginThreshold,
        minBranchProbability: config.branchMinProbability,
        priorStrength: config.bayesianPriorStrength,
        halfLifeDays: config.experienceHalfLifeDays,
        crossProfileWeight: config.crossProfileWeight,
        crossModelWeight: config.crossModelWeight,
        stalePolicyWeight: config.stalePolicyWeight,
        crossProtocolWeight: config.crossProtocolWeight,
        crossRolloutWeight: config.crossRolloutWeight,
    });
    const evaluateBranchTrigger = async (runtime) => {
        if (config.rolloutMode !== 'verified-branching' || !runtime.governor.episode)
            return undefined;
        await branchExperienceStore.ready();
        const signature = runtime.taskSignature ?? buildTaskSignature(runtime.governor.episode.contract, runtime.governor.knownArtifacts);
        const domain = runtime.calibrationDomain ?? domainFor(runtime);
        // Shadow learning observes the calibrated decision but cannot suppress the
        // deterministic cold-start branching policy. Active learning may suppress
        // only weak/medium triggers; strong fail-route/contamination signals remain hard.
        const calibrated = branchTriggerDecision(runtime.governor, signature, domain, branchExperienceStore.values(), branchPolicyOptions());
        const base = branchTriggerDecision(runtime.governor, signature, domain, [], branchPolicyOptions());
        const applied = config.branchLearning === 'active' ? calibrated : base;
        runtime.branchTrigger = applied;
        if (config.branchLearning === 'shadow') {
            ledger.record({ event: 'branch/calibration-shadow', sessionId: runtime.agent?.id, episode: runtime.governor.episode.id, base, calibrated });
        }
        return applied;
    };
    const runComparativeVerifier = async (runtime, a, b, signal) => {
        const episode = runtime.governor.episode;
        if (!episode)
            return undefined;
        let external;
        try {
            external = ctx.coursekeeperComparativeVerifier;
        }
        catch {
            external = undefined;
        }
        const wave = episode.branching.current;
        if (runtime.branchVerifierInFlight || (wave && wave.verifierCalls >= config.maxComparativeVerifierCalls))
            return undefined;
        if (external?.compare) {
            runtime.branchVerifierInFlight = true;
            runtime.metrics.comparativeVerifierCalls++;
            if (wave) {
                wave.verifierCalls++;
                wave.comparisonCount++;
            }
            try {
                const raw = await external.compare({
                    objective: episode.contract.objective,
                    candidateA: a,
                    candidateB: b,
                    criteria: config.comparativeVerifierCriteria,
                    protocol: verifierProtocolFor(runtime),
                }, signal);
                if (typeof raw === 'string')
                    return parseComparativeVerifierResult(raw);
                if (raw && ['a', 'b', 'tie', 'no_valid_candidate'].includes(String(raw.decision)))
                    return raw;
                return undefined;
            }
            catch (error) {
                ledger.record({ event: 'branch/verifier-error', sessionId: runtime.agent?.id, episode: episode.id, backend: 'external', error: error instanceof Error ? error.message : String(error) });
                return undefined;
            }
            finally {
                runtime.branchVerifierInFlight = false;
            }
        }
        const provider = config.comparativeVerifierProvider ?? config.semanticVerifierProvider ?? runtime.lastProvider ?? runtime.agent?.options?.provider;
        const model = config.comparativeVerifierModel ?? config.semanticVerifierModel ?? runtime.lastModel ?? runtime.agent?.options?.model;
        if (!provider || !model)
            return undefined;
        runtime.branchVerifierInFlight = true;
        runtime.metrics.comparativeVerifierCalls++;
        if (wave) {
            wave.verifierCalls++;
            wave.comparisonCount++;
        }
        let text = '';
        try {
            const stream = ctx.llm.stream({
                provider,
                model,
                system: 'You are a fresh-context comparative verifier. Judge execution evidence, not agent confidence or reasoning style. You may reject both candidates.',
                messages: [{ role: 'user', content: [{ type: 'text', text: comparativeVerifierPrompt(episode.contract.objective, a, b, config.comparativeVerifierCriteria) }] }],
                maxTokens: config.comparativeVerifierMaxTokens,
            });
            for await (const chunk of stream) {
                if (signal?.aborted)
                    break;
                if (chunk?.type === 'text-delta')
                    text += String(chunk.text ?? '');
                else if (chunk?.type === 'block-end' && chunk?.block?.type === 'text' && text.length === 0)
                    text += String(chunk.block.text ?? '');
            }
            return parseComparativeVerifierResult(text);
        }
        catch (error) {
            ledger.record({ event: 'branch/verifier-error', sessionId: runtime.agent?.id, episode: episode.id, error: error instanceof Error ? error.message : String(error) });
            return undefined;
        }
        finally {
            runtime.branchVerifierInFlight = false;
        }
    };
    const alternateRouteForBranch = (runtime) => {
        const adaptive = runtime.governor.episode?.adaptive;
        if (!adaptive)
            return undefined;
        return [...adaptive.eligible]
            .filter(route => route !== runtime.governor.episode?.route.route)
            .sort((a, b) => (adaptive.fusedScores[b] ?? -Infinity) - (adaptive.fusedScores[a] ?? -Infinity))[0];
    };
    const generateBranchCandidate = async (runtime, provider, checkpoint, index) => {
        const episode = runtime.governor.episode;
        const wave = episode?.branching.current;
        if (!episode || !wave)
            return undefined;
        const candidateId = `w${wave.id}-c${index}`;
        try {
            const fork = await provider.workspace.fork(checkpoint, candidateId);
            const route = index === 1 ? alternateRouteForBranch(runtime) : undefined;
            const raw = await provider.executor.execute({
                candidateId,
                workspaceRef: fork.workspaceRef,
                objective: episode.contract.objective,
                ...(route ? { route } : {}),
                freshContext: true,
                includeGeneratorReasoning: false,
            });
            const candidate = createBranchCandidate({ ...raw, id: candidateId, workspaceRef: fork.workspaceRef, origin: route ? 'route-alternate' : 'fresh', ...(route && !raw.route ? { route } : {}) });
            runtime.metrics.branchCandidates++;
            const registered = registerBranchCandidate(runtime.governor, candidate);
            ledger.record({ event: 'branch/candidate', sessionId: runtime.agent?.id, episode: episode.id, wave: wave.id, candidateId, registered, fingerprint: candidate.fingerprint, route: candidate.route ?? null });
            if (!registered.ok)
                await provider.workspace.dispose?.(fork.workspaceRef);
            return registered.ok ? candidate : undefined;
        }
        catch (error) {
            ledger.record({ event: 'branch/candidate-error', sessionId: runtime.agent?.id, episode: episode.id, wave: wave.id, candidateId, error: error instanceof Error ? error.message : String(error) });
            return undefined;
        }
    };
    const disposeBranchForks = async (runtime) => {
        const wave = runtime.governor.episode?.branching.current;
        const provider = resolveBranchRuntime(runtime);
        if (!wave || !provider?.workspace.dispose)
            return;
        const refs = [...new Set([...wave.candidates.values()].map(candidate => candidate.workspaceRef).filter((ref) => Boolean(ref)))];
        for (const ref of refs) {
            try {
                await provider.workspace.dispose(ref);
            }
            catch (error) {
                ledger.record({ event: 'branch/dispose-error', sessionId: runtime.agent?.id, episode: runtime.governor.episode?.id, workspaceRef: ref, error: error instanceof Error ? error.message : String(error) });
            }
        }
    };
    const applySelectedBranch = async (runtime, candidate) => {
        const episode = runtime.governor.episode;
        const wave = episode?.branching.current;
        if (!episode || !wave)
            return false;
        if (candidate.origin === 'current') {
            wave.status = 'applied';
            wave.requiresReverify = false;
            episode.branching.lastOutcome = 'selected-original';
            episode.recoveryBlocker = undefined;
            ledger.record({ event: 'branch/original-retained', sessionId: runtime.agent?.id, episode: episode.id, wave: wave.id, candidateId: candidate.id });
            await disposeBranchForks(runtime);
            return true;
        }
        const provider = resolveBranchRuntime(runtime);
        if (!provider)
            return false;
        const applied = await provider.workspace.apply(candidate);
        if (!applied.ok) {
            wave.status = 'blocked';
            episode.branching.lastOutcome = 'blocked';
            episode.recoveryBlocker = `Selected branch candidate could not be applied: ${applied.reason ?? 'workspace provider rejected apply'}`;
            episode.phase = 'blocked';
            return false;
        }
        const appliedCandidate = applied.artifacts?.length
            ? createBranchCandidate({ ...candidate, evidence: { ...candidate.evidence, artifacts: applied.artifacts } })
            : candidate;
        const reopened = reopenAfterBranchApply(runtime.governor, appliedCandidate, 0, stateOptions());
        ledger.record({ event: 'branch/applied', sessionId: runtime.agent?.id, episode: episode.id, wave: wave.id, candidateId: candidate.id, applied, reopened });
        refreshRestriction(runtime);
        if (reopened.ok)
            await disposeBranchForks(runtime);
        return reopened.ok;
    };
    const selectBranchCandidates = async (runtime, signal) => {
        const episode = runtime.governor.episode;
        const wave = episode?.branching.current;
        if (!episode || !wave || wave.candidates.size < 2)
            return false;
        wave.status = 'comparing';
        const pre = deterministicPrefilter([...wave.candidates.values()]);
        if (pre.noValidCandidate) {
            recordNoValidBranchCandidate(runtime.governor, 'all candidates failed deterministic prefilter');
            ledger.record({ event: 'branch/no-valid-candidate', sessionId: runtime.agent?.id, episode: episode.id, wave: wave.id, stage: 'deterministic' });
            await disposeBranchForks(runtime);
            return false;
        }
        if (pre.selectedCandidateId) {
            const chosen = wave.candidates.get(pre.selectedCandidateId);
            recordBranchSelection(runtime.governor, chosen.id, 'sole deterministic survivor');
            return applySelectedBranch(runtime, chosen);
        }
        const survivors = pre.survivors;
        if (survivors.length < 2)
            return false;
        if (survivors.length === 2) {
            const result = await runComparativeVerifier(runtime, survivors[0], survivors[1], signal);
            if (!result) {
                wave.status = 'collecting';
                return false;
            }
            const selection = selectPair(survivors[0], survivors[1], result, { minScore: config.branchSelectionMinScore, margin: config.branchSelectionMargin });
            ledger.record({ event: 'branch/comparison', sessionId: runtime.agent?.id, episode: episode.id, wave: wave.id, a: survivors[0].id, b: survivors[1].id, result, selection });
            if (selection.status === 'selected' && selection.candidateId) {
                const chosen = wave.candidates.get(selection.candidateId);
                recordBranchSelection(runtime.governor, chosen.id, selection.reason);
                return applySelectedBranch(runtime, chosen);
            }
            if (selection.status === 'no-valid-candidate') {
                recordNoValidBranchCandidate(runtime.governor, selection.reason);
                await disposeBranchForks(runtime);
                return false;
            }
            if (wave.candidates.size >= config.branchMaxCandidates) {
                recordNoValidBranchCandidate(runtime.governor, `selection remained ambiguous at candidate budget ${config.branchMaxCandidates}: ${selection.reason}`);
                await disposeBranchForks(runtime);
            }
            else
                wave.status = 'collecting';
            return false;
        }
        const compareAndAggregate = async (pairs, aggregate, seen) => {
            let valid = 0;
            for (const [a, b] of pairs) {
                const pairKey = [a.id, b.id].sort().join('\u0000');
                if (seen.has(pairKey))
                    continue;
                seen.add(pairKey);
                const result = await runComparativeVerifier(runtime, a, b, signal);
                if (!result || result.decision === 'no_valid_candidate')
                    continue;
                valid++;
                const softA = branchSoftWin(result.scoreA, result.scoreB);
                const aa = aggregate.get(a.id) ?? { evidenceScore: 0, evidenceCount: 0, wins: 0, comparisons: 0 };
                aa.evidenceScore += result.scoreA;
                aa.evidenceCount++;
                aa.wins += softA;
                aa.comparisons++;
                aggregate.set(a.id, aa);
                const bb = aggregate.get(b.id) ?? { evidenceScore: 0, evidenceCount: 0, wins: 0, comparisons: 0 };
                bb.evidenceScore += result.scoreB;
                bb.evidenceCount++;
                bb.wins += 1 - softA;
                bb.comparisons++;
                aggregate.set(b.id, bb);
                ledger.record({ event: 'branch/comparison', sessionId: runtime.agent?.id, episode: episode.id, wave: wave.id, a: a.id, b: b.id, result });
            }
            return valid;
        };
        const aggregate = new Map();
        const seen = new Set();
        let validComparisons = 0;
        if (survivors.length === 3) {
            const pairs = [];
            for (let i = 0; i < survivors.length; i++)
                for (let j = i + 1; j < survivors.length; j++)
                    pairs.push([survivors[i], survivors[j]]);
            validComparisons += await compareAndAggregate(pairs, aggregate, seen);
        }
        else {
            // N>=4: bounded Probabilistic Pivot Tournament. The ring gives every
            // candidate one A and one B slot; only empirical leaders become pivots.
            validComparisons += await compareAndAggregate(branchRingPairs(survivors), aggregate, seen);
            const ringRanked = survivors.map(candidate => {
                const row = aggregate.get(candidate.id);
                return { candidate, preference: row && row.comparisons ? row.wins / row.comparisons : 0.5 };
            }).sort((a, b) => b.preference - a.preference || a.candidate.id.localeCompare(b.candidate.id));
            const pivotIds = ringRanked.slice(0, Math.min(config.branchPivots, survivors.length)).map(row => row.candidate.id);
            validComparisons += await compareAndAggregate(branchPivotRoundPairs(survivors, pivotIds), aggregate, seen);
            ledger.record({ event: 'branch/pivot-tournament', sessionId: runtime.agent?.id, episode: episode.id, wave: wave.id, candidates: survivors.length, pivots: pivotIds, comparisons: seen.size });
        }
        if (validComparisons === 0 || aggregate.size === 0) {
            recordNoValidBranchCandidate(runtime.governor, 'comparative verifier produced no valid candidate comparison');
            await disposeBranchForks(runtime);
            return false;
        }
        const ranked = survivors.map(candidate => {
            const row = aggregate.get(candidate.id);
            return {
                candidate,
                preference: row && row.comparisons ? row.wins / row.comparisons : 0.5,
                evidenceScore: row && row.evidenceCount ? row.evidenceScore / row.evidenceCount : 0,
            };
        }).sort((a, b) => b.preference - a.preference || b.evidenceScore - a.evidenceScore || a.candidate.id.localeCompare(b.candidate.id));
        const best = ranked[0], second = ranked[1];
        const margin = best.preference - (second?.preference ?? 0);
        if (best.evidenceScore < config.branchSelectionMinScore) {
            recordNoValidBranchCandidate(runtime.governor, `best evidence score ${best.evidenceScore.toFixed(3)} below minimum ${config.branchSelectionMinScore.toFixed(3)}`);
            await disposeBranchForks(runtime);
            return false;
        }
        if (second && margin < config.branchSelectionMargin) {
            if (wave.candidates.size >= config.branchMaxCandidates) {
                recordNoValidBranchCandidate(runtime.governor, `selection margin ${margin.toFixed(3)} remained below ${config.branchSelectionMargin.toFixed(3)} at candidate budget ${config.branchMaxCandidates}`);
                await disposeBranchForks(runtime);
            }
            else
                wave.status = 'collecting';
            return false;
        }
        recordBranchSelection(runtime.governor, best.candidate.id, `verifier preference ${best.preference.toFixed(3)} evidence ${best.evidenceScore.toFixed(3)} margin ${margin.toFixed(3)}`);
        return applySelectedBranch(runtime, best.candidate);
    };
    const maybeAutoBranch = async (runtime, signal) => {
        if (config.rolloutMode !== 'verified-branching' || !config.branchAutoStart || !runtime.governor.episode)
            return;
        const episode = runtime.governor.episode;
        if (episode.branching.wavesStarted >= config.maxBranchWavesPerEpisode)
            return;
        if (episode.branching.current && ['collecting', 'comparing', 'selected'].includes(episode.branching.current.status))
            return;
        const decision = await evaluateBranchTrigger(runtime);
        if (!decision?.eligible)
            return;
        const provider = resolveBranchRuntime(runtime);
        if (!provider) {
            ledger.record({ event: 'branch/suggested', sessionId: runtime.agent?.id, episode: episode.id, decision, runtimeAvailable: false });
            return;
        }
        let checkpoint;
        try {
            checkpoint = await provider.workspace.checkpoint({ episodeId: episode.id, workspaceRevision: runtime.governor.workspace.revision, preferred: runtime.governor.workspace.revision === 0 ? 'pre-mutation' : 'restart' });
        }
        catch (error) {
            ledger.record({ event: 'branch/checkpoint-error', sessionId: runtime.agent?.id, episode: episode.id, error: error instanceof Error ? error.message : String(error) });
            return;
        }
        if (checkpoint.capability === 'none' || !checkpoint.ref) {
            ledger.record({ event: 'branch/suggested', sessionId: runtime.agent?.id, episode: episode.id, decision, runtimeAvailable: true, checkpoint });
            return;
        }
        const started = startBranchWave(runtime.governor, decision, checkpoint.capability, checkpoint.ref);
        if (!started.ok)
            return;
        const current = currentBranchCandidate(runtime);
        if (current)
            registerBranchCandidate(runtime.governor, current);
        const target = Math.max(2, Math.min(config.branchInitialCandidates, config.branchMaxCandidates));
        for (let i = 1; i < target; i++)
            await generateBranchCandidate(runtime, provider, checkpoint, i);
        let selected = await selectBranchCandidates(runtime, signal);
        let count = runtime.governor.episode?.branching.current?.candidates.size ?? 0;
        while (!selected && runtime.governor.episode?.branching.current?.status === 'collecting' && count < config.branchMaxCandidates) {
            const next = await generateBranchCandidate(runtime, provider, checkpoint, count);
            if (!next)
                break;
            count = runtime.governor.episode?.branching.current?.candidates.size ?? count + 1;
            selected = await selectBranchCandidates(runtime, signal);
        }
        if (!selected && episode.branching.current?.status === 'collecting' && (episode.branching.current.candidates.size >= config.branchMaxCandidates || episode.branching.current.verifierCalls >= config.maxComparativeVerifierCalls)) {
            recordNoValidBranchCandidate(runtime.governor, `branch budget exhausted without a confident winner (candidates=${episode.branching.current.candidates.size}, verifierCalls=${episode.branching.current.verifierCalls})`);
            await disposeBranchForks(runtime);
        }
        ledger.record({ event: 'branch/wave-complete', sessionId: runtime.agent?.id, episode: episode.id, wave: episode.branching.current?.id ?? null, status: episode.branching.current?.status ?? null, candidates: episode.branching.current?.candidates.size ?? 0 });
    };
    const resetEpisodeRuntime = (runtime) => {
        runtime.adaptivePreparedKey = undefined;
        runtime.taskSignature = undefined;
        runtime.calibrationDomain = undefined;
        runtime.metrics = newEpisodeMetrics();
        runtime.externalFailure = false;
        runtime.experienceRecordedEpisode = undefined;
        runtime.routeChallengeCount = 0;
        runtime.branchTrigger = undefined;
        runtime.branchExperienceRecordedWave = undefined;
        runtime.nativeCanonicalSurface = undefined;
        runtime.nativeCanonicalBaselineToolHash = undefined;
        runtime.protocolRequest = undefined;
        runtime.suppressedVisiblePolicies = 0;
    };
    const adaptivePolicyOptions = () => ({
        mode: config.adaptiveRouting,
        memoryTopK: config.memoryTopK,
        memoryMinSimilarity: config.memoryMinSimilarity,
        halfLifeDays: config.experienceHalfLifeDays,
        priorStrength: config.bayesianPriorStrength,
        memoryWeight: config.memoryWeight,
        bayesianWeight: config.bayesianCalibration ? config.bayesianWeight : 0,
        maxAdjustment: config.maxAdaptiveAdjustment,
        minEffectiveSupport: config.minEffectiveSupport,
        marginThreshold: config.routeMarginThreshold,
        safeExplorationRate: config.safeExplorationRate,
        explorationSample: Math.random(),
        crossProfileWeight: config.crossProfileWeight,
        crossModelWeight: config.crossModelWeight,
        stalePolicyWeight: config.stalePolicyWeight,
        crossProtocolWeight: config.crossProtocolWeight,
        crossRolloutWeight: config.crossRolloutWeight,
    });
    const runRouteChallenger = async (runtime, signature, decision) => {
        const episode = runtime.governor.episode;
        if (!episode || config.routeChallenger === 'off' || config.adaptiveRouting !== 'active' || !decision.challengerEligible
            || riskRank(episode.contract.risk) < riskRank(config.routeChallengerMinRisk) || runtime.routeChallengeCount >= config.maxRouteChallengesPerEpisode)
            return decision;
        const provider = config.semanticVerifierProvider ?? runtime.lastProvider ?? runtime.agent?.options?.provider;
        const model = config.semanticVerifierModel ?? runtime.lastModel ?? runtime.agent?.options?.model;
        if (!provider || !model)
            return decision;
        runtime.routeChallengeCount++;
        runtime.metrics.routeChallenges++;
        let text = '';
        try {
            const stream = ctx.llm.stream({
                provider, model,
                system: 'You are a route challenger. Judge only which evidence-acquisition route is safer and more efficient; do not solve the task.',
                messages: [{ role: 'user', content: [{ type: 'text', text: routeChallengerPrompt(signature, decision, episode.contract.objective) }] }],
                maxTokens: Math.min(512, config.semanticVerifierMaxTokens),
            });
            for await (const chunk of stream) {
                if (chunk?.type === 'text-delta')
                    text += String(chunk.text ?? '');
                else if (chunk?.type === 'block-end' && chunk?.block?.type === 'text' && text.length === 0)
                    text += String(chunk.block.text ?? '');
            }
            const result = parseRouteChallenge(text, decision.eligible);
            if (!result)
                return { ...decision, challenged: true, reason: 'route challenger output was unparseable; adaptive decision retained' };
            const selected = result.decision === 'challenge' ? result.route : decision.adaptiveRoute;
            ledger.record({ event: 'adaptive/challenger', sessionId: runtime.agent?.id, episode: episode.id, proposed: decision.adaptiveRoute, selected, decision: result.decision, reason: result.reason });
            return withChallenge(decision, selected, `route challenger ${result.decision}: ${result.reason}`);
        }
        catch (error) {
            ledger.record({ event: 'adaptive/challenger-error', sessionId: runtime.agent?.id, episode: episode.id, error: error instanceof Error ? error.message : String(error) });
            return { ...decision, challenged: true, reason: 'route challenger failed; adaptive decision retained' };
        }
    };
    const prepareAdaptiveRoute = async (runtime) => {
        const state = runtime.governor;
        const episode = state.episode;
        if (!episode || config.adaptiveRouting === 'off')
            return;
        const key = `${episode.id}:${episode.humanRound}`;
        if (runtime.adaptivePreparedKey === key)
            return;
        await experienceStore.ready();
        const signature = buildTaskSignature(episode.contract, state.knownArtifacts);
        const domain = domainFor(runtime);
        let decision = decideAdaptiveRoute(episode.contract, signature, domain, experienceStore.values(), adaptivePolicyOptions());
        decision = await runRouteChallenger(runtime, signature, decision);
        runtime.taskSignature = signature;
        runtime.calibrationDomain = domain;
        runtime.adaptivePreparedKey = key;
        applyAdaptiveInitialRoute(state, decision, stateOptions());
        ledger.record({
            event: 'adaptive/route', sessionId: runtime.agent?.id, episode: episode.id, humanRound: episode.humanRound,
            mode: config.adaptiveRouting, bucket: decision.bucket, baseRoute: decision.baseRoute,
            adaptiveRoute: decision.adaptiveRoute, appliedRoute: decision.appliedRoute, margin: decision.margin,
            support: decision.effectiveSupport, challenged: decision.challenged, reason: decision.reason,
        });
        void maybeAutoBranch(runtime);
    };
    const maybeEscalate = (runtime, sequence) => {
        if (config.adaptiveEscalation === 'off' || !runtime.governor.episode)
            return;
        const domain = runtime.calibrationDomain ?? domainFor(runtime);
        const suggestion = suggestEscalation(runtime.governor, experienceStore.values(), domain, {
            noInformationLimit: config.noInformationLimit,
            calibrated: config.adaptiveEscalation === 'calibrated',
            halfLifeDays: config.experienceHalfLifeDays,
            priorStrength: config.bayesianPriorStrength,
            crossProfileWeight: config.crossProfileWeight,
            crossModelWeight: config.crossModelWeight,
            stalePolicyWeight: config.stalePolicyWeight,
            crossProtocolWeight: config.crossProtocolWeight,
            crossRolloutWeight: config.crossRolloutWeight,
        });
        if (!suggestion)
            return;
        if (config.adaptiveRouting === 'shadow') {
            ledger.record({ event: 'adaptive/escalation-shadow', sessionId: runtime.agent?.id, episode: runtime.governor.episode.id, ...suggestion });
            return;
        }
        if (config.adaptiveRouting !== 'active')
            return;
        const result = applyAdaptiveEscalation(runtime.governor, suggestion.to, suggestion.reason, suggestion.detail, sequence, stateOptions());
        if (result.ok) {
            runtime.metrics.recoveries++;
            refreshRestriction(runtime);
            ledger.record({ event: 'adaptive/escalation', sessionId: runtime.agent?.id, episode: runtime.governor.episode.id, ...suggestion, result: result.message });
        }
    };
    const runSemanticVerifier = async (runtime, signal) => {
        const state = runtime.governor;
        const episode = state.episode;
        const semantic = episode?.semanticVerification;
        if (!episode || !semantic?.required)
            return true;
        if (semantic.status === 'passed' && semantic.verifiedWorkspaceRevision === state.workspace.revision)
            return true;
        if (runtime.semanticVerifierInFlight)
            return false;
        if (semantic.attempts >= config.maxSemanticVerifierCalls)
            return false;
        const packet = buildEvidencePacket(state);
        if (!packet)
            return false;
        const provider = config.semanticVerifierProvider ?? runtime.lastProvider ?? runtime.agent?.options?.provider;
        const model = config.semanticVerifierModel ?? runtime.lastModel ?? runtime.agent?.options?.model;
        if (!provider || !model) {
            semantic.status = 'unknown';
            semantic.reason = 'semantic verifier route unavailable: no provider/model has been observed';
            semantic.attempts++;
            refreshPolicyHint(state, stateOptions());
            return false;
        }
        runtime.semanticVerifierInFlight = true;
        runtime.metrics.verifierCalls++;
        semantic.status = 'running';
        let text = '';
        try {
            const stream = ctx.llm.stream({
                provider,
                model,
                system: 'You are an independent verifier. You receive evidence packets, not the main model reasoning. Be concise, skeptical, and evidence-bound.',
                messages: [{ role: 'user', content: [{ type: 'text', text: semanticVerifierPrompt(packet) }] }],
                maxTokens: config.semanticVerifierMaxTokens,
            });
            for await (const chunk of stream) {
                if (signal?.aborted)
                    break;
                if (chunk?.type === 'text-delta') {
                    text += String(chunk.text ?? '');
                }
                else if (text.length === 0) {
                    // Some runtimes emit no text-delta on failure and fold the
                    // terminal state into a finish block; capture its text so the
                    // failure is at least attributable instead of silently empty.
                    if (chunk?.type === 'block-end' && chunk?.block?.type === 'text')
                        text += String(chunk.block.text ?? '');
                    else if (chunk?.type === 'finish') {
                        const finishText = typeof chunk.text === 'string' ? chunk.text
                            : chunk?.block && typeof chunk.block === 'object' && typeof chunk.block.text === 'string' ? chunk.block.text
                                : typeof chunk.reason === 'string' ? chunk.reason
                                    : '';
                        text += finishText;
                    }
                }
            }
            if (!text.trim()) {
                semantic.status = 'unknown';
                semantic.reason = 'semantic verifier returned empty output (provider stream emitted no text)';
                semantic.attempts++;
                semantic.verifiedWorkspaceRevision = state.workspace.revision;
                ledger.record({ event: 'semantic-verifier/empty', sessionId: runtime.agent?.id, episode: episode.id, provider, model, outputHash: fingerprint(text) });
                refreshPolicyHint(state, stateOptions());
                return false;
            }
            const result = parseSemanticVerifierResult(text);
            if (!result) {
                semantic.status = 'unknown';
                semantic.reason = 'semantic verifier returned unparseable output';
                semantic.attempts++;
                semantic.verifiedWorkspaceRevision = state.workspace.revision;
                ledger.record({ event: 'semantic-verifier/unparseable', sessionId: runtime.agent?.id, episode: episode.id, provider, model, outputHash: fingerprint(text) });
                refreshPolicyHint(state, stateOptions());
                return false;
            }
            const applied = applySemanticVerifierResult(state, result);
            if (result.decision === 'fail_route') {
                episode.recoveryBlocker = `Independent verifier rejected route ${episode.route.route}. Reroute with cause=verifier-fail before completion.`;
                episode.phase = 'recover';
            }
            else if (result.decision === 'patch') {
                episode.recoveryBlocker = undefined;
                episode.phase = 'inspect';
            }
            else if (result.decision === 'warn' || result.decision === 'unknown') {
                episode.recoveryBlocker = result.nextEvidence[0]
                    ? `Independent verifier requires more evidence: ${result.nextEvidence[0]}`
                    : `Independent verifier did not pass: ${result.reason}`;
                episode.phase = 'verify';
            }
            else if (result.decision === 'pass') {
                episode.recoveryBlocker = undefined;
            }
            refreshPolicyHint(state, stateOptions());
            ledger.record({
                event: 'semantic-verifier/result', sessionId: runtime.agent?.id, episode: episode.id,
                provider, model, decision: result.decision, reason: result.reason,
                contradictions: result.contradictions, nextEvidence: result.nextEvidence,
                workspaceRevision: state.workspace.revision, applied: applied.message,
            });
            if (result.decision === 'fail_route' || result.decision === 'unknown')
                void maybeAutoBranch(runtime, signal);
            return result.decision === 'pass';
        }
        catch (error) {
            semantic.status = 'unknown';
            semantic.reason = error instanceof Error ? error.message : String(error);
            semantic.attempts++;
            semantic.verifiedWorkspaceRevision = state.workspace.revision;
            refreshPolicyHint(state, stateOptions());
            ledger.record({ event: 'semantic-verifier/error', sessionId: runtime.agent?.id, episode: episode.id, error: semantic.reason });
            return false;
        }
        finally {
            runtime.semanticVerifierInFlight = false;
        }
    };
    const releaseRestriction = (runtime, reason) => {
        runtime.restrictionDispose?.();
        runtime.restrictionDispose = undefined;
        if (runtime.restrictionDenied.length > 0) {
            ledger.record({ event: 'restriction/released', sessionId: runtime.agent?.id, reason, denied: runtime.restrictionDenied });
        }
        runtime.restrictionDenied = [];
    };
    const refreshRestriction = (runtime) => {
        if (config.capabilityControl !== 'restrict' || config.mode !== 'active') {
            releaseRestriction(runtime, 'mode-not-restrict');
            return;
        }
        const gate = mutationGate(runtime.governor);
        if (gate.allowed) {
            releaseRestriction(runtime, 'evidence-gate-open');
            return;
        }
        if (runtime.restrictionDispose)
            return;
        try {
            const names = ctx.tools.schemas(runtime.agent).map((tool) => tool.name);
            const denied = ['write', 'edit'].filter(name => names.includes(name));
            if (names.includes('str_replace_editor') && names.includes('read'))
                denied.push('str_replace_editor');
            if (denied.length === 0)
                return;
            runtime.restrictionDenied = denied;
            runtime.restrictionDispose = runtime.agent.ctx.tools.restrict({ deny: denied });
            ledger.record({ event: 'restriction/applied', sessionId: runtime.agent?.id, denied, reason: gate.reason });
        }
        catch (error) {
            ledger.record({ event: 'restriction/rejected', sessionId: runtime.agent?.id, error: error instanceof Error ? error.message : String(error) });
        }
    };
    function installGuard(runtime) {
        if (runtime.guardDispose || config.mode !== 'active')
            return;
        try {
            runtime.guardDispose = runtime.agent.ctx.tools.guard((execution) => {
                const semantics = classifyExecution(execution);
                if (semantics.effect === 'finish') {
                    const blockers = completionBlockers(runtime.governor, stateOptions());
                    if (blockers.length > 0)
                        return `coursekeeper blocked ${execution.name}: ${blockers.join(' ')}`;
                    return undefined;
                }
                if (config.capabilityControl !== 'guard')
                    return undefined;
                if (semantics.effect !== 'mutate' && !semantics.riskyMutation)
                    return undefined;
                const gate = mutationGate(runtime.governor);
                if (gate.allowed)
                    return undefined;
                ledger.record({ event: 'mutation/blocked', sessionId: runtime.agent?.id, tool: execution.name, reason: gate.reason });
                return `coursekeeper blocked mutation: ${gate.reason}`;
            });
        }
        catch (error) {
            ledger.record({ event: 'guard/rejected', sessionId: runtime.agent?.id, error: error instanceof Error ? error.message : String(error) });
        }
    }
    ctx.on('agent/created', ({ agent }) => { stateFor(agent); });
    ctx.on('agent/disposed', ({ agent }) => {
        const runtime = runtimeStates.get(agent);
        if (runtime) {
            finalizeExperience(runtime);
            runtime.guardDispose?.();
            releaseRestriction(runtime, 'agent-disposed');
        }
        runtimeStates.delete(agent);
    });
    // Durable human input is available here before first assembly.
    ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
        if (config.mode === 'off' || message?.source?.kind !== 'user')
            return;
        const runtime = stateFor(agent);
        const state = runtime.governor;
        const text = contentText(message.content ?? []);
        const previous = state.episode;
        const preview = classifyTaskContract(text, previous ? { objective: previous.contract.objective, artifacts: new Set([...state.knownArtifacts, ...previous.contract.artifacts]) } : undefined);
        if (previous && preview.relation === 'new')
            finalizeExperience(runtime);
        const previousEpisodeId = previous?.id;
        acceptHumanTask(state, text, Number(turn ?? 0), state.planMode, stateOptions());
        if (state.episode?.id !== previousEpisodeId)
            resetEpisodeRuntime(runtime);
        else {
            runtime.adaptivePreparedKey = undefined;
            runtime.taskSignature = undefined;
            runtime.calibrationDomain = undefined;
        }
        refreshRestriction(runtime);
        ledger.record({
            event: 'policy/decided', sessionId: agent.id, turn, messageId: message.id,
            messageHash: fingerprint(text), episode: state.episode?.id ?? null,
            relation: state.episode?.contract.relation, kind: state.episode?.contract.kind,
            route: state.episode?.route.route, phase: state.episode?.phase, risk: state.episode?.contract.risk,
            capabilityControl: config.capabilityControl, adaptiveRouting: config.adaptiveRouting,
        });
    });
    // Default governor mode preserves the official surface. Router-assist is an explicit
    // experimental compatibility mode and is therefore allowed to reshape only the first request.
    ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
        const assembled = await next();
        const agent = context.agent;
        if (!agent || config.mode === 'off')
            return assembled;
        const runtime = stateFor(agent);
        await prepareAdaptiveRoute(runtime);
        refreshRestriction(runtime);
        let output = assembled;
        let routerChanged = false;
        let nativeCanonicalChanged = false;
        if (config.mode === 'active' && config.augmentationProfile === 'native-canonical') {
            const canonical = applyNativeCanonicalProfile(assembled);
            output = { ...assembled, sections: canonical.sections, tools: canonical.tools };
            nativeCanonicalChanged = canonical.changed;
            const toolSurfaceHash = fingerprint(canonical.tools);
            if (!runtime.nativeCanonicalBaselineToolHash)
                runtime.nativeCanonicalBaselineToolHash = toolSurfaceHash;
            runtime.nativeCanonicalSurface = {
                personaExact: canonical.personaExact, personaFirst: canonical.personaFirst,
                toolPrefix: canonical.toolPrefix, toolPrefixMatch: canonical.toolPrefixMatch,
                auxiliaryToolsAtEnd: canonical.auxiliaryToolsAtEnd, deviations: canonical.deviations,
                toolSurfaceHash, stable: runtime.nativeCanonicalBaselineToolHash === toolSurfaceHash,
            };
            ledger.record({
                event: 'protocol/native-canonical', sessionId: agent.id, episode: runtime.governor.episode?.id ?? null,
                personaExact: canonical.personaExact, personaFirst: canonical.personaFirst, toolPrefix: canonical.toolPrefix,
                toolPrefixMatch: canonical.toolPrefixMatch, auxiliaryToolsAtEnd: canonical.auxiliaryToolsAtEnd,
                stable: runtime.nativeCanonicalSurface.stable, deviations: canonical.deviations,
            });
        }
        if (config.mode === 'active' && config.augmentationProfile !== 'native-canonical' && config.routerAssist !== 'off' && runtime.governor.episode) {
            const promoted = Array.isArray(agent?.session?.events) && agent.session.events.some((event) => event?.type === 'tool/call');
            const assisted = applyRouterAssist(assembled, runtime.governor.episode.route.route, config.routerAssist, promoted);
            if (assisted.changed) {
                output = { ...assembled, sections: assisted.sections, tools: assisted.tools };
                routerChanged = true;
            }
        }
        runtime.governor.assemblyHash = fingerprint({ sections: output.sections, tools: output.tools, variables: output.variables });
        ledger.record({
            event: 'request/assembled', sessionId: agent.id, assemblyHash: runtime.governor.assemblyHash,
            augmentationProfile: config.augmentationProfile, routerAssist: config.routerAssist, routerChanged, nativeCanonicalChanged,
            sectionNames: output.sections?.map((section) => section.name) ?? [],
            toolNames: output.tools?.map((tool) => tool.name) ?? [],
        });
        return output;
    });
    ctx.on('agent/pre-step', async ({ agent }, next) => {
        const decision = await next();
        if (decision?.kind === 'reject' || config.mode !== 'active')
            return decision;
        const runtime = stateFor(agent);
        const state = runtime.governor;
        if (config.augmentationProfile === 'native-canonical') {
            if (state.pendingHint && state.injectedRevision < state.policyRevision) {
                runtime.suppressedVisiblePolicies++;
                state.injectedRevision = state.policyRevision;
                state.pendingHint = undefined;
                ledger.record({ event: 'protocol/policy-suppressed', sessionId: agent.id, episode: state.episode?.id ?? null });
            }
            return decision;
        }
        const additions = [];
        const episodeId = state.episode?.id;
        if (episodeId !== undefined && config.jspaceAssist !== 'off' && runtime.jspaceInjectedEpisode !== episodeId) {
            additions.push(jspaceAssistKernel(config.jspaceAssist));
            runtime.jspaceInjectedEpisode = episodeId;
        }
        if (state.pendingHint && state.injectedRevision < state.policyRevision)
            additions.push(state.pendingHint);
        if (additions.length === 0)
            return decision;
        const message = pluginMessage(additions.filter(Boolean).join('\n'), additions.some(text => text.includes('<coursekeeper-kernel')) ? 'kernel-policy' : 'policy');
        if (state.pendingHint && state.injectedRevision < state.policyRevision)
            markHintInjected(state);
        return { ...decision, messages: insertAfterLastHuman(decision.messages ?? [], message) };
    });
    ctx.on('agent/request', async ({ agent, signal }, next) => {
        const proposed = await next();
        const runtime = stateFor(agent);
        runtime.metrics.requests++;
        runtime.lastProvider = proposed?.provider ?? runtime.lastProvider;
        runtime.lastModel = proposed?.model ?? runtime.lastModel;
        if (config.augmentationProfile === 'native-canonical') {
            runtime.protocolRequest = observeRequestProtocol(proposed?.messages ?? []);
            ledger.record({ event: 'protocol/request-observed', sessionId: agent.id, episode: runtime.governor.episode?.id ?? null, ...runtime.protocolRequest });
        }
        if (config.mode !== 'active' || config.adaptiveReasoning === 'off')
            return proposed;
        const state = runtime.governor;
        const wantsDepth = config.adaptiveReasoning === 'episode' ? episodeNeedsDepth(state) : phaseNeedsDepth(state.episode?.phase ?? '');
        if (!wantsDepth) {
            if (!runtime.effortOverrideApplied)
                return proposed;
            const { reasoningEffort: _ignored, ...restored } = proposed;
            runtime.effortOverrideApplied = false;
            state.episode && (state.episode.effortOverride = undefined);
            return restored;
        }
        if (config.adaptiveReasoning === 'episode' && state.episode?.effortOverride) {
            runtime.effortOverrideApplied = true;
            return { ...proposed, reasoningEffort: ReasoningEffortId(state.episode.effortOverride) };
        }
        const key = `${proposed.provider}\u0000${proposed.model}`;
        let pending = modelInfo.get(key);
        if (!pending) {
            pending = Promise.resolve(ctx.llm.resolveModelInfo(proposed.provider, proposed.model, signal));
            modelInfo.set(key, pending);
        }
        try {
            const info = await pending;
            signal?.throwIfAborted?.();
            const effort = deepestEffort(info);
            if (!effort || String(proposed.reasoningEffort ?? '') === String(effort))
                return proposed;
            runtime.effortOverrideApplied = true;
            if (config.adaptiveReasoning === 'episode' && state.episode)
                state.episode.effortOverride = String(effort);
            ledger.record({ event: 'reasoning/selected', sessionId: agent.id, mode: config.adaptiveReasoning, route: state.episode?.route.route, phase: state.episode?.phase, effort: String(effort) });
            return { ...proposed, reasoningEffort: ReasoningEffortId(String(effort)) };
        }
        catch (error) {
            modelInfo.delete(key);
            ledger.record({ event: 'reasoning/unavailable', sessionId: agent.id, error: error instanceof Error ? error.message : String(error) });
            return proposed;
        }
    });
    ctx.on('agent/request-error', async ({ agent, turn, step, provider, failure }, next) => {
        if (config.mode === 'off')
            return next();
        const runtime = stateFor(agent);
        runtime.externalFailure = true;
        if (!config.stopRetryOnDeterministicErrors || !isTerminalLlmFailure(failure))
            return next();
        if (runtime.governor.episode) {
            runtime.governor.episode.phase = 'blocked';
            runtime.governor.episode.blockedReason = `Model request is not retryable: ${failure?.code ?? 'invalid_request_error'}${failure?.status ? ` (HTTP ${failure.status})` : ''}. ${failure?.message ?? ''}`;
        }
        ledger.record({ event: 'request/terminal-error', sessionId: agent.id, turn, step, provider, status: failure?.status ?? null, code: failure?.code, message: failure?.message });
        return undefined;
    });
    ctx.on('session/event', (session, event) => {
        const runtime = sessionStates.get(session);
        if (!runtime || config.mode === 'off')
            return;
        const state = runtime.governor;
        switch (event.type) {
            case 'tool/call': {
                const toolName = String(event.data.name);
                // Coursekeeper control is applied synchronously by its own execute() for immediate feedback.
                if (toolName === COURSEKEEPER_CONTROL_TOOL || toolName === COURSEKEEPER_BRANCH_TOOL || toolName === LEGACY_TRAJECTORY_CONTROL_TOOL)
                    break;
                runtime.metrics.toolCalls++;
                registerToolCall(state, String(event.data.callId), toolName, parseArguments(event.data.arguments), event.seq, stateOptions());
                break;
            }
            case 'tool/code-dispatch-start':
                runtime.metrics.toolCalls++;
                registerToolCall(state, String(event.data.subCallId), String(event.data.name), event.data.arguments, event.seq, stateOptions());
                break;
            case 'tool/result': {
                const block = event.data.message.content?.[0];
                if (block?.type !== 'tool-result')
                    break;
                const callId = String(event.data.message.source.callId);
                const result = settleToolCall(state, callId, { isError: block.isError === true, content: contentText(block.content ?? []), meta: event.data.meta }, event.seq, stateOptions());
                if (result)
                    ledger.record({ event: 'tool/observed', sessionId: runtime.agent.id, seq: event.seq, callId, progress: result.kind, weight: result.weight, summary: result.summary, workspaceRevision: state.workspace.revision });
                refreshRestriction(runtime);
                maybeEscalate(runtime, event.seq);
                void maybeAutoBranch(runtime);
                break;
            }
            case 'tool/code-dispatch': {
                const result = settleToolCall(state, String(event.data.subCallId), { isError: event.data.isError === true, content: contentText(event.data.content ?? []), meta: event.data.meta }, event.seq, stateOptions());
                if (result)
                    ledger.record({ event: 'tool/observed', sessionId: runtime.agent.id, seq: event.seq, progress: result.kind, weight: result.weight, summary: result.summary, workspaceRevision: state.workspace.revision });
                refreshRestriction(runtime);
                maybeEscalate(runtime, event.seq);
                void maybeAutoBranch(runtime);
                break;
            }
            case 'plan/mode':
                state.planMode = event.data.active === true;
                if (state.planMode)
                    releaseRestriction(runtime, 'plan-mode');
                break;
            case 'step/end':
                runtime.metrics.steps++;
                break;
            case 'llm/usage': {
                const usage = event.data?.usage ?? event.data ?? {};
                const input = Number(usage.inputTokens ?? usage.input_tokens);
                const cached = Number(usage.cachedInputTokens ?? usage.cached_input_tokens);
                const reasoning = Number(usage.reasoningTokens ?? usage.reasoning_tokens);
                if (Number.isFinite(input))
                    runtime.metrics.inputTokens = (runtime.metrics.inputTokens ?? 0) + input;
                if (Number.isFinite(cached))
                    runtime.metrics.cachedInputTokens = (runtime.metrics.cachedInputTokens ?? 0) + cached;
                if (Number.isFinite(reasoning))
                    runtime.metrics.reasoningTokens = (runtime.metrics.reasoningTokens ?? 0) + reasoning;
                break;
            }
            case 'turn/end':
                if (state.turn?.turn === event.data.turn)
                    state.turn = undefined;
                ledger.record({ event: 'turn/ended', sessionId: runtime.agent.id, turn: event.data.turn, reason: event.data.reason?.kind, route: state.episode?.route.route, phase: state.episode?.phase, blockers: completionBlockers(state, stateOptions()) });
                break;
        }
    });
    ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
        if (config.mode !== 'active' || !config.autoVerify || signal?.aborted)
            return;
        const runtime = stateFor(agent);
        const state = runtime.governor;
        if (state.planMode)
            return;
        await maybeAutoBranch(runtime, signal);
        let blockers = completionBlockers(state, stateOptions());
        if (blockers.length === 0)
            return;
        // Semantic verification is intentionally last: deterministic acceptance,
        // readback, tests and benchmarks must be closed before paying for a model judge.
        const nonSemantic = blockers.filter(blocker => !blocker.startsWith('Independent semantic verification remains:'));
        const semantic = state.episode?.semanticVerification;
        if (nonSemantic.length === 0 && semantic?.required && semantic.status !== 'passed') {
            const passed = await runSemanticVerifier(runtime, signal);
            blockers = completionBlockers(state, stateOptions());
            if (passed && blockers.length === 0)
                return;
        }
        if (!state.turn || state.turn.turn !== turn)
            state.turn = { turn, automaticContinuations: 0, blockerReported: false, calls: new Map() };
        if (state.turn.automaticContinuations < config.maxAutomaticContinuations) {
            state.turn.automaticContinuations++;
            if (state.episode)
                state.episode.phase = state.episode.semanticVerification.required && state.episode.semanticVerification.status !== 'passed' ? 'verify' : state.episode.phase;
            const text = verificationPrompt(state, stateOptions());
            agent.steer(pluginMessage(text, 'verification'));
            ledger.record({ event: 'verification/continued', sessionId: agent.id, turn, attempt: state.turn.automaticContinuations, blockers, semantic: state.episode?.semanticVerification.status ?? null });
            return;
        }
        if (state.turn.blockerReported)
            return;
        state.turn.blockerReported = true;
        if (state.episode) {
            state.episode.phase = 'blocked';
            state.episode.blockedReason = blockers.join(' ');
        }
        agent.steer(pluginMessage(blockerReport(state, stateOptions()), 'blocker-report'));
        ledger.record({ event: 'verification/blocked', sessionId: agent.id, turn, blockers, semantic: state.episode?.semanticVerification.status ?? null });
    });
    if (config.exposeControlTool) {
        ctx.effect(() => ctx.tools.register(defineTool({
            name: COURSEKEEPER_CONTROL_TOOL,
            description: 'Commit/reroute/falsify/support the current course, or satisfy/waive an acceptance obligation. Route changes obey commitment hysteresis.',
            parameters: {
                action: { type: 'string', required: true, enum: ['commit', 'reroute', 'falsify', 'support', 'accept', 'waive'] },
                route: { type: 'string', enum: ['direct', 'inspect', 'plan', 'explore'] },
                cause: { type: 'string', description: 'For reroute: falsified / contradicted / verifier-fail / budget-exhausted / user-correction.' },
                hypothesis: { type: 'string' },
                falsifier: { type: 'string' },
                next_evidence: { type: 'string' },
                min_evidence_actions: { type: 'number' },
                max_evidence_actions: { type: 'number' },
                epistemic: { type: 'string', enum: ['unsupported', 'plausible', 'supported', 'conflicted', 'contradicted'] },
                obligation_id: { type: 'string' },
                evidence: { type: 'string' },
                reason: { type: 'string' },
            },
            output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
            async execute(args, exec) {
                const agent = exec.agent;
                if (!agent)
                    return JSON.stringify({ ok: false, message: 'no owning agent' });
                const runtime = stateFor(agent);
                const result = applyTrajectoryControl(runtime.governor, args, 0, stateOptions());
                refreshRestriction(runtime);
                ledger.record({ event: 'coursekeeper/control', sessionId: agent.id, action: args.action, result, route: runtime.governor.episode?.route.route, hypothesis: runtime.governor.episode?.route.hypothesis ?? null });
                return JSON.stringify(result);
            },
            presentCall: () => ({ card: 'generic', title: 'Coursekeeper control', kind: 'write' }),
        })));
    }
    if (config.exposeSemanticVerifierTool && config.semanticVerifier !== 'off') {
        ctx.effect(() => ctx.tools.register(defineTool({
            name: COURSEKEEPER_VERIFY_TOOL,
            description: 'Run the independent semantic verifier on the current evidence packet. Deterministic acceptance/test/benchmark obligations must be closed first unless force=true.',
            parameters: { force: { type: 'boolean', description: 'Allow semantic verification before deterministic obligations are closed (research/debug only).' } },
            output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
            async execute(args, exec) {
                const agent = exec.agent;
                if (!agent)
                    return JSON.stringify({ ok: false, message: 'no owning agent' });
                const runtime = stateFor(agent);
                const blockers = completionBlockers(runtime.governor, stateOptions());
                const deterministic = blockers.filter(blocker => !blocker.startsWith('Independent semantic verification remains:'));
                if (deterministic.length > 0 && args.force !== true) {
                    return JSON.stringify({ ok: false, message: 'deterministic obligations remain; semantic verifier deferred', blockers: deterministic });
                }
                const passed = await runSemanticVerifier(runtime);
                return JSON.stringify({ ok: passed, semanticVerification: runtime.governor.episode?.semanticVerification ?? null, blockers: completionBlockers(runtime.governor, stateOptions()) });
            },
            presentCall: () => ({ card: 'generic', title: 'Semantic verifier', kind: 'read' }),
        })));
    }
    if (config.exposeBranchTool && config.rolloutMode === 'verified-branching') {
        ctx.effect(() => ctx.tools.register(defineTool({
            name: COURSEKEEPER_BRANCH_TOOL,
            description: 'Control Verified Branching: inspect/start a branch wave, register isolated candidate evidence, compare candidates, or confirm the selected candidate was applied. This tool never treats selection as final verification.',
            parameters: {
                action: { type: 'string', required: true, enum: ['evaluate', 'start', 'register', 'select', 'apply', 'abort', 'status'] },
                candidate_id: { type: 'string' },
                origin: { type: 'string', enum: ['current', 'fresh', 'route-alternate', 'external'] },
                route: { type: 'string', enum: ['direct', 'inspect', 'plan', 'explore'] },
                workspace_ref: { type: 'string' },
                summary: { type: 'string' },
                artifacts: { type: 'array', items: { type: 'string' } },
                commands: { type: 'array', items: { type: 'string' } },
                outputs: { type: 'array', items: { type: 'string' } },
                unresolved_errors: { type: 'array', items: { type: 'string' } },
                patch: { type: 'string' },
                acceptance_satisfied: { type: 'boolean' },
                verification_passed: { type: 'boolean' },
                benchmark_passed: { type: 'boolean' },
                confirmed_applied: { type: 'boolean', description: 'For manual/external apply only: assert that the selected alternate candidate has already been applied to the main workspace.' },
                reason: { type: 'string' },
            },
            output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
            async execute(args, exec) {
                const agent = exec.agent;
                if (!agent)
                    return JSON.stringify({ ok: false, message: 'no owning agent' });
                const runtime = stateFor(agent);
                const state = runtime.governor;
                const episode = state.episode;
                if (!episode)
                    return JSON.stringify({ ok: false, message: 'no active episode' });
                const action = String(args.action ?? '');
                if (action === 'evaluate') {
                    const decision = await evaluateBranchTrigger(runtime);
                    return JSON.stringify({ ok: true, decision, runtimeAvailable: Boolean(resolveBranchRuntime(runtime)), branching: episode.branching }, (_k, v) => v instanceof Map ? Object.fromEntries(v) : v, 2);
                }
                if (action === 'start') {
                    if (episode.branching.wavesStarted >= config.maxBranchWavesPerEpisode)
                        return JSON.stringify({ ok: false, message: 'maximum branch waves reached for this episode' });
                    const evaluated = await evaluateBranchTrigger(runtime);
                    const decision = evaluated?.eligible ? evaluated : {
                        eligible: true,
                        triggers: ['manual'],
                        contamination: trajectoryContaminationScore(state),
                        calibratedProbability: evaluated?.calibratedProbability ?? 0.5,
                        effectiveSupport: evaluated?.effectiveSupport ?? 0,
                        reason: String(args.reason ?? 'manual verified-branching request'),
                    };
                    let checkpoint = { capability: 'none', reason: 'manual candidate collection' };
                    const provider = resolveBranchRuntime(runtime);
                    if (provider) {
                        try {
                            checkpoint = await provider.workspace.checkpoint({ episodeId: episode.id, workspaceRevision: state.workspace.revision, preferred: state.workspace.revision === 0 ? 'pre-mutation' : 'restart' });
                        }
                        catch (error) {
                            checkpoint = { capability: 'none', reason: error instanceof Error ? error.message : String(error) };
                        }
                    }
                    const started = startBranchWave(state, decision, checkpoint.capability, checkpoint.ref);
                    if (started.ok) {
                        const current = currentBranchCandidate(runtime);
                        if (current)
                            registerBranchCandidate(state, current);
                    }
                    return JSON.stringify({ ...started, checkpoint, branching: episode.branching }, (_k, v) => v instanceof Map ? Object.fromEntries(v) : v, 2);
                }
                if (action === 'register') {
                    const wave = episode.branching.current;
                    if (!wave)
                        return JSON.stringify({ ok: false, message: 'start a branch wave first' });
                    if (wave.candidates.size >= config.branchMaxCandidates)
                        return JSON.stringify({ ok: false, message: `candidate budget exhausted (${config.branchMaxCandidates})` });
                    const candidateId = String(args.candidate_id ?? `w${wave.id}-external-${wave.candidates.size + 1}`);
                    const candidate = createBranchCandidate({
                        id: candidateId,
                        origin: args.origin ?? 'external',
                        ...(args.route ? { route: args.route } : {}),
                        ...(args.workspace_ref ? { workspaceRef: String(args.workspace_ref) } : {}),
                        evidence: {
                            summary: String(args.summary ?? ''),
                            artifacts: Array.isArray(args.artifacts) ? args.artifacts.map(String) : [],
                            commands: Array.isArray(args.commands) ? args.commands.map(String) : [],
                            outputs: Array.isArray(args.outputs) ? args.outputs.map(String) : [],
                            unresolvedErrors: Array.isArray(args.unresolved_errors) ? args.unresolved_errors.map(String) : [],
                            ...(typeof args.acceptance_satisfied === 'boolean' ? { acceptanceSatisfied: args.acceptance_satisfied } : {}),
                            ...(typeof args.verification_passed === 'boolean' ? { verificationPassed: args.verification_passed } : {}),
                            ...(typeof args.benchmark_passed === 'boolean' ? { benchmarkPassed: args.benchmark_passed } : {}),
                            ...(typeof args.patch === 'string' ? { patch: args.patch } : {}),
                        },
                    });
                    const result = registerBranchCandidate(state, candidate);
                    if (result.ok && candidate.origin !== 'current')
                        runtime.metrics.branchCandidates++;
                    return JSON.stringify({ ...result, candidate, candidateCount: wave.candidates.size }, null, 2);
                }
                if (action === 'select') {
                    const ok = await selectBranchCandidates(runtime);
                    return JSON.stringify({ ok, branching: episode.branching }, (_k, v) => v instanceof Map ? Object.fromEntries(v) : v, 2);
                }
                if (action === 'apply') {
                    const wave = episode.branching.current;
                    const selected = wave?.selectedCandidateId ? wave.candidates.get(wave.selectedCandidateId) : undefined;
                    if (!wave || !selected)
                        return JSON.stringify({ ok: false, message: 'no selected candidate' });
                    if (selected.origin === 'current' || resolveBranchRuntime(runtime)) {
                        const ok = await applySelectedBranch(runtime, selected);
                        return JSON.stringify({ ok, branching: episode.branching, blockers: completionBlockers(state, stateOptions()) }, (_k, v) => v instanceof Map ? Object.fromEntries(v) : v, 2);
                    }
                    if (args.confirmed_applied !== true)
                        return JSON.stringify({ ok: false, message: 'no WorkspaceForkProvider is installed; externally apply the selected candidate, then call apply with confirmed_applied=true' });
                    const reopened = reopenAfterBranchApply(state, selected, 0, stateOptions());
                    refreshRestriction(runtime);
                    return JSON.stringify({ ...reopened, branching: episode.branching, blockers: completionBlockers(state, stateOptions()) }, (_k, v) => v instanceof Map ? Object.fromEntries(v) : v, 2);
                }
                if (action === 'abort') {
                    if (episode.branching.current) {
                        episode.branching.current.status = 'blocked';
                        episode.branching.current.selectionReason = String(args.reason ?? 'branch wave aborted');
                        episode.branching.lastOutcome = 'blocked';
                        await disposeBranchForks(runtime);
                    }
                    return JSON.stringify({ ok: true, branching: episode.branching }, (_k, v) => v instanceof Map ? Object.fromEntries(v) : v, 2);
                }
                if (action === 'status')
                    return JSON.stringify({ ok: true, branching: episode.branching, trigger: runtime.branchTrigger, runtimeAvailable: Boolean(resolveBranchRuntime(runtime)) }, (_k, v) => v instanceof Map ? Object.fromEntries(v) : v, 2);
                return JSON.stringify({ ok: false, message: `unsupported branch action: ${action}` });
            },
            presentCall: () => ({ card: 'generic', title: 'Verified branching', kind: 'write' }),
        })));
    }
    if (config.exposeStatusTool) {
        ctx.effect(() => ctx.tools.register(defineTool({
            name: COURSEKEEPER_STATUS_TOOL,
            description: 'Read Coursekeeper route, commitment, adaptive calibration, Verified Branching, protocol, obligations, progress, benchmark and verifier state.',
            parameters: {},
            output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
            async execute(_args, exec) {
                const agent = exec.agent;
                if (!agent)
                    return 'coursekeeper: no owning agent';
                const runtime = stateFor(agent);
                const state = runtime.governor;
                const packet = buildEvidencePacket(state);
                const experience = await experienceStore.status();
                return JSON.stringify({
                    mode: config.mode,
                    augmentationProfile: config.augmentationProfile,
                    protocolFidelity: config.augmentationProfile === 'native-canonical' ? {
                        profile: 'native-canonical',
                        surface: runtime.nativeCanonicalSurface ?? null,
                        requestObservation: runtime.protocolRequest ?? null,
                        suppressedVisiblePolicies: runtime.suppressedVisiblePolicies,
                        note: 'reasoning/tool-result fields are structural observations of the DSH request, not proof of provider-side serialization',
                    } : null,
                    jspaceAssist: config.jspaceAssist,
                    routerAssist: config.routerAssist,
                    semanticVerifier: config.semanticVerifier,
                    capabilityControl: config.capabilityControl,
                    adaptiveReasoning: config.adaptiveReasoning,
                    adaptiveRouting: config.adaptiveRouting,
                    adaptiveEscalation: config.adaptiveEscalation,
                    rolloutMode: config.rolloutMode,
                    branching: {
                        learning: config.branchLearning,
                        state: state.episode?.branching ?? null,
                        lastTrigger: runtime.branchTrigger ?? null,
                        contamination: state.episode ? trajectoryContaminationScore(state) : 0,
                        runtimeAvailable: Boolean(resolveBranchRuntime(runtime)),
                        comparativeVerifier: verifierProtocolFor(runtime),
                        generatorProtocol: { profile: config.augmentationProfile, fingerprint: generatorProtocolFingerprint(runtime) },
                        maxCandidates: config.branchMaxCandidates,
                        pivots: config.branchPivots,
                        maxWavesPerEpisode: config.maxBranchWavesPerEpisode,
                        autoStart: config.branchAutoStart,
                        deterministicPrefilter: true,
                        includeGeneratorReasoning: false,
                    },
                    routeChallenger: { mode: config.routeChallenger, minRisk: config.routeChallengerMinRisk, maxPerEpisode: config.maxRouteChallengesPerEpisode },
                    episode: state.episode?.id ?? null,
                    humanRound: state.episode?.humanRound ?? 0,
                    relation: state.episode?.contract.relation ?? null,
                    kind: state.episode?.contract.kind ?? null,
                    route: state.episode?.route ?? null,
                    initialRoute: state.episode?.initialRoute ?? null,
                    routeTransitions: state.episode?.transitions ?? [],
                    adaptive: state.episode?.adaptive ?? null,
                    taskSignature: runtime.taskSignature ?? null,
                    calibrationDomain: runtime.calibrationDomain ?? null,
                    experienceStore: experience,
                    branchExperienceStore: await branchExperienceStore.status(),
                    phase: state.episode?.phase ?? null,
                    risk: state.episode?.contract.risk ?? null,
                    vector: state.episode?.contract.vector ?? null,
                    acceptance: state.episode ? [...state.episode.acceptance.values()] : [],
                    openVerificationDebt: [...state.workspace.verificationDebt.values()],
                    workspaceRevision: state.workspace.revision,
                    artifacts: [...state.workspace.artifacts.values()],
                    noInformationStreak: state.noInformationStreak,
                    repeatedCallCount: state.repeatedCallCount,
                    blockers: completionBlockers(state, stateOptions()),
                    benchmark: state.episode?.benchmark ?? null,
                    semanticVerification: state.episode?.semanticVerification ?? null,
                    evidencePacket: packet ?? null,
                    controlPacket: currentControlPacket(state, stateOptions()) ?? null,
                    assemblyHash: state.assemblyHash ?? null,
                    ledger: ledger.status(),
                }, (_key, value) => value instanceof Map ? Object.fromEntries(value) : value instanceof Set ? [...value] : value, 2);
            },
            presentCall: () => ({ card: 'generic', title: 'Coursekeeper status', kind: 'read' }),
        })));
    }
    ctx.effect(() => async () => {
        for (const runtime of runtimeStates.values()) {
            finalizeExperience(runtime, 'unknown');
            runtime.guardDispose?.();
            releaseRestriction(runtime, 'plugin-disposed');
        }
        runtimeStates.clear();
        await experienceStore.close();
        await branchExperienceStore.close();
        await ledger.close();
    }, 'coursekeeper.lifecycle');
    ledger.record({
        event: 'plugin/loaded',
        mode: config.mode,
        augmentationProfile: config.augmentationProfile,
        nativeCanonical: config.augmentationProfile === 'native-canonical',
        jspaceAssist: config.jspaceAssist,
        routerAssist: config.routerAssist,
        semanticVerifier: config.semanticVerifier,
        capabilityControl: config.capabilityControl,
        adaptiveReasoning: config.adaptiveReasoning,
        adaptiveRouting: config.adaptiveRouting,
        adaptiveEscalation: config.adaptiveEscalation,
        rolloutMode: config.rolloutMode,
        branchLearning: config.branchLearning,
        branchAutoStart: config.branchAutoStart,
        branchInitialCandidates: config.branchInitialCandidates,
        branchMaxCandidates: config.branchMaxCandidates,
        branchPivots: config.branchPivots,
        maxBranchWavesPerEpisode: config.maxBranchWavesPerEpisode,
        routeChallenger: config.routeChallenger,
        experienceMemory: config.experienceMemory,
        benchmarkRequired: config.benchmarkRequired,
    });
}
//# sourceMappingURL=index.js.map