import { createHash } from 'node:crypto';
const CHAT_RE = /^(?:你好|您好|hello|hi|hey|嗨|哈[喽啰]|在吗|谢谢|感谢|thanks|thank you|早上好|下午好|晚上好|嗯+|好(?:的)?|ok(?:ay)?|yes|no)[!！。.？?~～\s]*$/i;
const FIX_RE = /(修复|修正|调试|排查|报错|异常|崩溃|回归|兼容|故障|fix|debug|repair|broken|regression|error|crash)/i;
const BUILD_RE = /(开发|创建|新建|生成|实现|搭建|构建|写(?:一个|个|出)?|做(?:一个|个|出)?|build|create|develop|generate|implement|write|make)/i;
const REVIEW_RE = /(审查|评审|检查|查看|看看|review|audit|inspect)/i;
const ANALYSIS_RE = /(分析|解释|说明|总结|调研|推演|比较|评估|analy[sz]e|explain|summari[sz]e|survey|evaluate|compare)/i;
const RESEARCH_RE = /(研究|实验|假设|机制|benchmark|ablation|probe|验证假说|research|experiment|hypothesis|mechanism)/i;
const CORRECTION_RE = /(修复|修一下|修正|改正|不对|错误|有问题|报错|异常|失败|回归|bug|fix|debug|broken|wrong|incorrect|regression|error)/i;
const EXTENSION_RE = /(继续|接着|再加|增加|新增|扩展|补充|完善|基于.{0,8}(?:现有|刚才|上面)|extend|continue|add (?:a |an |the )?|build on|follow[- ]?up)/i;
const CONTINUITY_RE = /(这个|那个|它|其中|刚才|之前|上面|现有|已有|同一|原来|当前|该文件|this|that|it|previous|existing|current|same)/i;
const CLARIFICATION_RE = /^(?:是|不是|对|不对|可以|不可以|继续|不用|需要|不需要|yes|no|correct|continue|proceed|stop)(?:[，,。.!！\s].*)?$/i;
const NEW_OBJECTIVE_RE = /(另一个|另外一个|另行|全新|完全不同|不相关|换一个|another|completely different|unrelated|new objective|new task|separate task)/i;
const HIGH_RISK_RE = /(删除|清空|覆盖全部|迁移|升级依赖|发布|部署|生产环境|凭据|密钥|数据库|权限|安全|大规模|全面重构|delete|drop|truncate|migrat|deploy|production|credential|secret|database|permission|security|large refactor)/i;
const COMPLEX_RE = /(架构|重构|系统|全面|详细|设计|集成|边界|并发|性能|安全|迁移|调研|多文件|跨模块|architecture|refactor|system|comprehensive|detailed|design|integration|concurren|performance|security|migration|survey|multi[- ]file|cross[- ]module)/i;
const UNCERTAIN_RE = /(不确定|未知|可能|猜测|机制|原因|为什么|如何|比较|调研|推演|探索|unknown|uncertain|maybe|mechanism|why|how|survey|explore)/i;
const ARTIFACT_RE = /(?:^|[\s"'`(])((?:[A-Za-z]:[\\/])?[^\s"'`()]+?\.(?:[cm]?[jt]sx?|py|rs|go|java|kt|rb|php|cs|cpp|c|h|html?|css|scss|json|ya?ml|toml|md|txt|sql|sh|ps1|rs|vue|svelte))(?:$|[\s"'`),:.])/gi;
const PATH_RE = /(?:^|\s)((?:[A-Za-z]:[\\/])?(?:[\w.@-]+[\\/])+[\w.@-]+(?:\.[\w-]+)?)(?=$|\s|[,;:)\]])/g;
const OBSERVE_TOOLS = new Set(['read', 'read_image', 'glob', 'grep', 'web_search', 'web_fetch', 'lsp', 'skill', 'list_agents']);
const MUTATE_TOOLS = new Set(['write', 'edit']);
const INTERACT_TOOLS = new Set(['ask_user_question', 'exit_plan_mode']);
const DELEGATE_TOOLS = new Set(['subagent', 'subagent_fork', 'workflow', 'ralph']);
const SHELL_TOOLS = new Set(['bash', 'pwsh', 'terminal_send']);
const VERIFY_COMMAND_RE = /(?:^|\s)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|lint|typecheck|check)|\b(?:pytest|vitest|jest|mocha|tsc|cargo\s+test|go\s+test|dotnet\s+test|mvn\s+test|gradle\s+test|make\s+test)\b/i;
const OBSERVE_COMMAND_RE = /(?:^|[;&|]\s*)(?:ls|dir|find|rg|grep|git\s+(?:status|diff|show|log)|sed\s+-n|head|tail|wc|cat|type)\b/i;
const RISKY_SHELL_MUTATION_RE = /(?:^|[;&|]\s*)(?:apply_patch|patch|tee|touch|mkdir|rmdir|rm|mv|cp|install|chmod|chown|sed\s+-i|perl\s+-i|git\s+(?:apply|checkout|restore|clean)|(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|update))\b|(?<![<&])>{1,2}(?![&>])/i;
export const DEFAULT_BENCHMARK_TOOL_NAMES = ['run_benchmark'];
export const DEFAULT_VERIFICATION_TOOL_NAMES = ['build_project', 'run_correctness_test'];
export const DEFAULT_FINISH_TOOL_NAMES = ['finish'];
export const COURSEKEEPER_CONTROL_TOOL = 'coursekeeper_control';
export const COURSEKEEPER_STATUS_TOOL = 'coursekeeper_status';
export const COURSEKEEPER_VERIFY_TOOL = 'coursekeeper_semantic_verify';
export const COURSEKEEPER_BRANCH_TOOL = 'coursekeeper_branch';
export const LEGACY_TRAJECTORY_CONTROL_TOOL = 'trajectory_control';
export const LEGACY_TRAJECTORY_STATUS_TOOL = 'trajectory_policy_status';
export const LEGACY_TRAJECTORY_VERIFY_TOOL = 'trajectory_semantic_verify';
/** @deprecated use COURSEKEEPER_CONTROL_TOOL */
export const TRAJECTORY_CONTROL_TOOL = COURSEKEEPER_CONTROL_TOOL;
/** @deprecated use COURSEKEEPER_STATUS_TOOL */
export const TRAJECTORY_STATUS_TOOL = COURSEKEEPER_STATUS_TOOL;
/** @deprecated use COURSEKEEPER_VERIFY_TOOL */
export const TRAJECTORY_VERIFY_TOOL = COURSEKEEPER_VERIFY_TOOL;
export function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}
export function normalizeWhitespace(text) {
    return text.replace(/\s+/g, ' ').trim();
}
export function fingerprint(value) {
    let serialized;
    try {
        serialized = typeof value === 'string' ? value : JSON.stringify(value);
    }
    catch {
        serialized = String(value);
    }
    return createHash('sha256').update(serialized).digest('hex');
}
export function normalizePath(value) {
    return value.replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
}
export function sameArtifact(left, right) {
    const a = normalizePath(left);
    const b = normalizePath(right);
    const strip = (value) => value.replace(/\.(?:[cm]?[jt]sx?|py|rs|go|java|kt|rb|php|cs|cpp|c|h)$/i, '');
    return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`) || strip(a) === strip(b) || strip(a).endsWith(`/${strip(b)}`) || strip(b).endsWith(`/${strip(a)}`);
}
function unique(values) { return [...new Set(values)]; }
function lexicalTokens(text) {
    const lower = text.toLowerCase();
    const latin = lower.match(/[a-z0-9_./-]{2,}/g) ?? [];
    const cjkChars = [...lower].filter(ch => /\p{Script=Han}/u.test(ch));
    const cjkBigrams = [];
    for (let i = 0; i + 1 < cjkChars.length; i++)
        cjkBigrams.push(`${cjkChars[i]}${cjkChars[i + 1]}`);
    return new Set([...latin, ...cjkBigrams].filter(token => !['please', 'help', 'this', 'that', 'with', 'from', 'then'].includes(token)));
}
export function lexicalSimilarity(left, right) {
    const a = lexicalTokens(left);
    const b = lexicalTokens(right);
    if (a.size === 0 || b.size === 0)
        return 0;
    let overlap = 0;
    for (const token of a)
        if (b.has(token))
            overlap++;
    return overlap / (a.size + b.size - overlap);
}
export function extractArtifacts(text) {
    const matches = [];
    for (const match of text.matchAll(ARTIFACT_RE)) {
        const value = match[1]?.replace(/[。.!！?？]+$/, '');
        if (value)
            matches.push(value);
    }
    return unique(matches);
}
function looksLikeFilePath(value) {
    const text = String(value ?? '').trim();
    if (!text)
        return false;
    if (/[\n\r\t]/.test(text))
        return false;
    if (text.includes('\n'))
        return false;
    if (/^\d+\/\d+$/.test(text))
        return false;
    const leaf = text.split(/[\/]/).pop() ?? '';
    if (!/\.[A-Za-z0-9]{1,12}$/.test(leaf))
        return false;
    return true;
}
export function extractPathLike(text) {
    const out = [...extractArtifacts(text)];
    for (const match of text.matchAll(PATH_RE)) {
        const value = match[1];
        if (value && looksLikeFilePath(value))
            out.push(value);
    }
    return unique(out);
}
export function extractSourceDependencies(content, artifactPath) {
    const normalized = artifactPath.replaceAll('\\', '/');
    const dir = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
    const specs = [];
    const patterns = [
        /(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g,
        /(?:#include\s*)[<"]([^>"]+)[>"]/g,
    ];
    for (const pattern of patterns)
        for (const match of content.matchAll(pattern))
            if (match[1])
                specs.push(match[1]);
    const out = [];
    for (const spec of specs) {
        if (!(spec.startsWith('./') || spec.startsWith('../')))
            continue;
        const parts = `${dir}/${spec}`.split('/');
        const resolved = [];
        for (const part of parts) {
            if (!part || part === '.')
                continue;
            if (part === '..')
                resolved.pop();
            else
                resolved.push(part);
        }
        out.push(resolved.join('/'));
    }
    return [...new Set(out)];
}
export function taskKind(text) {
    if (CHAT_RE.test(text))
        return 'conversation';
    const fix = FIX_RE.test(text);
    const build = BUILD_RE.test(text);
    if (RESEARCH_RE.test(text))
        return 'research';
    if (fix && !build)
        return 'fix';
    if (build && !fix)
        return 'build';
    if (ANALYSIS_RE.test(text))
        return 'analysis';
    if (REVIEW_RE.test(text))
        return 'review';
    if (fix)
        return 'fix';
    if (build)
        return 'build';
    return 'unknown';
}
export function taskRelation(text, artifacts, previous) {
    if (previous === undefined || CHAT_RE.test(previous.objective))
        return 'new';
    if (CLARIFICATION_RE.test(text))
        return 'clarification';
    if (NEW_OBJECTIVE_RE.test(text) && !EXTENSION_RE.test(text))
        return 'new';
    const normalizedPrevious = new Set([...previous.artifacts].map(normalizePath));
    const overlap = artifacts.some(item => normalizedPrevious.has(normalizePath(item)));
    const continuity = overlap || CONTINUITY_RE.test(text) || lexicalSimilarity(text, previous.objective) >= 0.24;
    if (CORRECTION_RE.test(text) && continuity)
        return 'correction';
    if (EXTENSION_RE.test(text) && (continuity || CONTINUITY_RE.test(text)))
        return 'extension';
    if (continuity)
        return 'continuation';
    return 'new';
}
function complexityScore(text, artifacts) {
    let score = Math.min(0.28, text.length / 1000);
    if (COMPLEX_RE.test(text))
        score += 0.30;
    if (artifacts.length > 1)
        score += Math.min(0.20, artifacts.length * 0.05);
    if (/\b(?:and|then|also|across|all)\b|并且|然后|同时|全部|多个|跨/i.test(text))
        score += 0.10;
    if (HIGH_RISK_RE.test(text))
        score += 0.18;
    if (RESEARCH_RE.test(text))
        score += 0.12;
    return clamp01(score);
}
function riskLevel(text, complexity) {
    if (HIGH_RISK_RE.test(text) || complexity >= 0.82)
        return 'high';
    if (complexity >= 0.50)
        return 'medium';
    return 'low';
}
function riskScalar(risk) { return risk === 'high' ? 1 : risk === 'medium' ? 0.55 : 0.15; }
export function estimateTaskVector(text, kind, relation, artifacts, complexity, risk) {
    const continuity = relation === 'new' ? 0 : 1;
    const observability = kind === 'fix' || kind === 'review' || relation === 'correction' || relation === 'continuation' ? 0.9 : artifacts.length > 0 ? 0.7 : 0.45;
    const uncertainty = clamp01((UNCERTAIN_RE.test(text) ? 0.35 : 0.10) + (kind === 'research' ? 0.40 : kind === 'analysis' ? 0.20 : 0) + (kind === 'unknown' ? 0.25 : 0) + (relation === 'correction' ? 0.05 : 0));
    const horizon = clamp01(complexity * 0.75 + (/多阶段|长期|全面|end[- ]to[- ]end|multi[- ]step|across/i.test(text) ? 0.25 : 0));
    const coupling = clamp01((artifacts.length > 1 ? 0.25 + artifacts.length * 0.06 : 0.12) + (/(架构|集成|并发|跨模块|architecture|integration|concurren|cross[- ]module)/i.test(text) ? 0.45 : 0));
    const novelty = clamp01((kind === 'research' || kind === 'unknown' ? 0.60 : 0.20) + (relation === 'new' ? 0.15 : -0.10) + (UNCERTAIN_RE.test(text) ? 0.15 : 0));
    return {
        uncertainty,
        horizon,
        coupling,
        observability: clamp01(observability + continuity * 0.05),
        risk: riskScalar(risk),
        novelty,
    };
}
function acceptanceHints(kind) {
    switch (kind) {
        case 'build': return ['Produce the requested deliverable', 'Demonstrate that the requested deliverable exists and is usable'];
        case 'fix': return ['Address the reported failure', 'Demonstrate the corrected behavior or explicitly justify why no mutation is needed'];
        case 'analysis':
        case 'review':
        case 'research': return ['Ground material findings in observed evidence', 'Cover the requested scope without inventing facts'];
        case 'conversation': return [];
        default: return ['Produce the requested outcome', 'Ground material claims before concluding'];
    }
}
function evidencePolicy(kind, relation) {
    const evidence = [];
    if (relation !== 'new')
        evidence.push('Preserve continuity with the existing objective and inspect current state before destructive replacement.');
    if (kind === 'fix')
        evidence.push('Establish relevant evidence about the failure before mutation.');
    if (kind === 'analysis' || kind === 'review' || kind === 'research')
        evidence.push('Use observations, tests, or source artifacts as the source of truth.');
    if (kind === 'build')
        evidence.push('Create the deliverable, then verify the final artifact and relevant behavior.');
    return evidence;
}
export function classifyTaskContract(rawText, previous) {
    const objective = normalizeWhitespace(rawText).slice(0, 800);
    const artifacts = extractArtifacts(objective);
    const kind = taskKind(objective);
    const relation = taskRelation(objective, artifacts, previous);
    const complexity = complexityScore(objective, artifacts);
    const risk = riskLevel(objective, complexity);
    const vector = estimateTaskVector(objective, kind, relation, artifacts, complexity, risk);
    return {
        objective,
        relation,
        kind,
        complexity,
        risk,
        artifacts,
        acceptanceHints: acceptanceHints(kind),
        evidencePolicy: evidencePolicy(kind, relation),
        vector,
    };
}
export function routeScores(contract) {
    const v = contract.vector;
    const continuity = contract.relation === 'new' ? 0 : 1;
    const direct = 1.05 - 0.65 * v.uncertainty - 0.65 * v.horizon - 0.55 * v.coupling - 0.55 * v.risk + 0.15 * v.observability + (contract.kind === 'build' ? 0.18 : 0);
    const inspect = 0.25 + 0.65 * v.observability + 0.25 * v.uncertainty + 0.20 * continuity + (contract.kind === 'fix' || contract.kind === 'review' || contract.kind === 'analysis' ? 0.35 : 0);
    const plan = 0.10 + 0.72 * v.horizon + 0.75 * v.coupling + 0.45 * v.risk + (contract.kind === 'build' && contract.complexity > 0.55 ? 0.20 : 0);
    const explore = 0.05 + 0.85 * v.uncertainty + 0.72 * v.novelty + 0.20 * v.horizon - 0.15 * v.observability + (contract.kind === 'research' ? 0.45 : 0);
    return { direct, inspect, plan, explore };
}
export function selectRoute(contract) {
    if (contract.kind === 'conversation')
        return 'direct';
    const scores = routeScores(contract);
    const entries = Object.entries(scores);
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? 'inspect';
}
export function routeContractForRoute(contract, route, source = 'auto', revision = 1) {
    const budgets = {
        direct: [0, 1],
        inspect: [1, 3],
        plan: [2, 4],
        explore: [2, 5],
    };
    const [minEvidenceActions, maxEvidenceActions] = budgets[route];
    let nextEvidence;
    if (route === 'inspect')
        nextEvidence = contract.artifacts[0] ? `inspect ${contract.artifacts[0]}` : 'inspect the current implementation or failure evidence';
    else if (route === 'plan')
        nextEvidence = 'inspect the highest-coupling interfaces before committing the design';
    else if (route === 'explore')
        nextEvidence = 'identify one observation that can discriminate the leading hypotheses';
    else
        nextEvidence = 'produce the requested artifact, then verify it';
    return {
        route, source, nextEvidence, minEvidenceActions, maxEvidenceActions,
        evidenceActions: 0, stallActions: 0,
        epistemic: route === 'direct' ? 'supported' : 'unsupported',
        explicit: route === 'direct' || route === 'inspect', revision,
    };
}
export function defaultRouteContract(contract, revision = 1) {
    return routeContractForRoute(contract, selectRoute(contract), 'auto', revision);
}
export function routeRequiresExplicitCommit(route) {
    return route === 'plan' || route === 'explore';
}
export function canSwitchRoute(contract, cause) {
    const normalized = cause.toLowerCase();
    if (['falsified', 'contradicted', 'verifier-fail', 'user-correction', 'user'].includes(normalized)) {
        return { allowed: true, reason: `switch allowed by ${normalized}` };
    }
    if (normalized === 'budget-exhausted' && (contract.evidenceActions >= contract.maxEvidenceActions || contract.stallActions >= contract.maxEvidenceActions)) {
        return { allowed: true, reason: 'route evidence/stall budget exhausted' };
    }
    if (contract.evidenceActions >= contract.minEvidenceActions)
        return { allowed: true, reason: 'minimum evidence commitment satisfied' };
    return { allowed: false, reason: `route is committed for ${contract.minEvidenceActions} evidence-bearing actions; only ${contract.evidenceActions} completed` };
}
export function initialPhase(contract, route, planMode) {
    if (contract.kind === 'conversation')
        return 'converge';
    if (planMode)
        return route === 'direct' ? 'design' : route === 'explore' ? 'inspect' : route === 'plan' ? 'design' : 'inspect';
    if (route === 'direct')
        return 'construct';
    if (route === 'inspect' || route === 'explore')
        return 'inspect';
    return 'design';
}
export function createAcceptanceObligations(contract) {
    if (contract.kind === 'conversation')
        return [];
    const obligations = [];
    if (contract.kind === 'build') {
        if (contract.artifacts.length > 0) {
            for (const artifact of contract.artifacts)
                obligations.push({
                    id: `deliverable:${normalizePath(artifact)}`,
                    description: `Requested deliverable exists: ${artifact}`,
                    kind: 'deliverable',
                    targetArtifacts: [artifact],
                    status: 'open', evidence: [], selfAttested: false,
                });
        }
        else
            obligations.push({
                id: 'deliverable:any', description: 'Requested deliverable was produced', kind: 'deliverable', targetArtifacts: [], status: 'open', evidence: [], selfAttested: false,
            });
    }
    else if (contract.kind === 'fix') {
        obligations.push({
            id: 'fix:addressed', description: 'Reported failure was addressed or an evidence-backed no-change explanation was established', kind: 'relevant-change', targetArtifacts: contract.artifacts, status: 'open', evidence: [], selfAttested: false,
        });
    }
    else if (['analysis', 'review', 'research'].includes(contract.kind)) {
        obligations.push({
            id: 'analysis:grounded', description: 'Material findings are grounded in relevant observations', kind: 'grounding', targetArtifacts: contract.artifacts, status: 'open', evidence: [], selfAttested: false,
        });
    }
    else {
        obligations.push({
            id: 'outcome:produced', description: 'Requested outcome was produced or explicitly accounted for', kind: 'custom', targetArtifacts: contract.artifacts, status: 'open', evidence: [], selfAttested: false,
        });
    }
    return obligations;
}
export function staticKernel() {
    return [
        '<coursekeeper-kernel v="3">',
        'Follow the current route until it is falsified or its evidence commitment is satisfied.',
        'Uncertainty means seek evidence, not branch. Coherence is not evidence.',
        'PLAN/EXPLORE routes require an explicit hypothesis, falsifier, and next evidence action before broad mutation.',
        'Do not finish with unresolved acceptance, verification, benchmark, or recovery obligations.',
        '</coursekeeper-kernel>',
    ].join('\n');
}
export function controlPacket(contract, route, phase, openAcceptance, openVerification, recovery, maxChars = 640) {
    const c = `${route.evidenceActions}/${route.minEvidenceActions}-${route.maxEvidenceActions}`;
    const parts = [
        '<ck>',
        `rel=${contract.relation} kind=${contract.kind} route=${route.route} phase=${phase} risk=${contract.risk}`,
        `commit=${c} epistemic=${route.epistemic} acceptance=${openAcceptance} verify=${openVerification}${recovery ? ' recovery=1' : ''}`,
    ];
    if (route.hypothesis)
        parts.push(`H=${route.hypothesis}`);
    if (route.falsifier)
        parts.push(`K=${route.falsifier}`);
    if (route.nextEvidence)
        parts.push(`N=${route.nextEvidence}`);
    if (routeRequiresExplicitCommit(route.route) && !route.explicit)
        parts.push('ACTION=commit route contract before broad mutation');
    parts.push('</ck>');
    const text = parts.join('\n');
    return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}
function stableJson(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value))
        return `[${value.map(stableJson).join(',')}]`;
    const object = value;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}
function firstString(record, names) {
    for (const name of names) {
        const value = record[name];
        if (typeof value === 'string' && value.trim())
            return value;
    }
    return undefined;
}
function stringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'string' && item.trim().length > 0);
}
function shellVerificationScope(command) {
    const paths = extractPathLike(command).filter(path => !/^(?:node_modules|dist|build)[\\/]/i.test(path));
    if (paths.length > 0)
        return paths;
    return 'workspace';
}
export function classifyTool(name, rawArguments, options = {}) {
    const args = asRecord(rawArguments);
    const normalizedName = name.toLowerCase();
    const benchmark = new Set((options.benchmarkToolNames ?? DEFAULT_BENCHMARK_TOOL_NAMES).map(x => x.toLowerCase()));
    const verify = new Set((options.verificationToolNames ?? DEFAULT_VERIFICATION_TOOL_NAMES).map(x => x.toLowerCase()));
    const finish = new Set((options.finishToolNames ?? DEFAULT_FINISH_TOOL_NAMES).map(x => x.toLowerCase()));
    const control = new Set((options.controlToolNames ?? [TRAJECTORY_CONTROL_TOOL]).map(x => x.toLowerCase()));
    const operation = firstString(args, ['command', 'script', 'description', 'query']);
    const artifacts = unique([
        ...['file_path', 'path', 'filename', 'target'].flatMap(key => typeof args[key] === 'string' ? [String(args[key])] : []),
        ...stringArray(args['files']), ...stringArray(args['artifacts']),
        ...(operation ? extractPathLike(operation) : []),
    ]);
    let effect = 'unknown';
    let verificationScope;
    if (control.has(normalizedName))
        effect = 'control';
    else if (benchmark.has(normalizedName))
        effect = 'benchmark';
    else if (verify.has(normalizedName)) {
        effect = 'verify';
        verificationScope = artifacts.length > 0 ? artifacts : 'workspace';
    }
    else if (finish.has(normalizedName))
        effect = 'finish';
    else if (OBSERVE_TOOLS.has(normalizedName) || /^(?:read|list|search|fetch|get)_/.test(normalizedName))
        effect = 'observe';
    else if (MUTATE_TOOLS.has(normalizedName))
        effect = 'mutate';
    else if (normalizedName === 'str_replace_editor') {
        const command = String(args['command'] ?? '').toLowerCase();
        if (command === 'view')
            effect = 'observe';
        else if (['create', 'str_replace', 'insert', 'undo_edit'].includes(command))
            effect = 'mutate';
    }
    else if (SHELL_TOOLS.has(normalizedName)) {
        if (operation && VERIFY_COMMAND_RE.test(operation)) {
            effect = 'verify';
            verificationScope = shellVerificationScope(operation);
        }
        else if (operation && OBSERVE_COMMAND_RE.test(operation))
            effect = 'observe';
    }
    else if (INTERACT_TOOLS.has(normalizedName))
        effect = 'interact';
    else if (DELEGATE_TOOLS.has(normalizedName) || normalizedName.startsWith('subagent'))
        effect = 'delegate';
    const riskyMutation = effect === 'unknown' && SHELL_TOOLS.has(normalizedName) && operation !== undefined && RISKY_SHELL_MUTATION_RE.test(operation);
    return {
        name,
        effect,
        artifacts,
        ...(operation === undefined ? {} : { operation }),
        ...(riskyMutation ? { riskyMutation: true } : {}),
        ...(verificationScope === undefined ? {} : { verificationScope }),
        signature: `${name}:${stableJson(args)}`,
    };
}
export function relevantObservation(semantics, contract, route) {
    if (semantics.effect !== 'observe')
        return false;
    if (semantics.artifacts.length > 0) {
        if (contract.artifacts.some(target => semantics.artifacts.some(actual => sameArtifact(target, actual))))
            return true;
        const next = route.nextEvidence?.toLowerCase() ?? '';
        if (semantics.artifacts.some(actual => next.includes(normalizePath(actual))))
            return true;
    }
    if (contract.artifacts.length === 0)
        return true;
    if (semantics.operation && route.nextEvidence) {
        const op = semantics.operation.toLowerCase();
        const next = route.nextEvidence.toLowerCase();
        return lexicalSimilarity(op, next) >= 0.18;
    }
    return false;
}
export function mutationNeedsExplicitCommit(route) {
    return routeRequiresExplicitCommit(route.route) && !route.explicit;
}
export function mutationAllowed(route, relevantEvidenceObserved) {
    if (mutationNeedsExplicitCommit(route))
        return { allowed: false, reason: `${route.route.toUpperCase()} route requires coursekeeper_control commit with hypothesis/falsifier/next_evidence before broad mutation.` };
    if (route.route === 'direct')
        return { allowed: true };
    if (route.route === 'inspect' || route.route === 'plan' || route.route === 'explore') {
        if (relevantEvidenceObserved || route.evidenceActions >= route.minEvidenceActions)
            return { allowed: true };
        return { allowed: false, reason: `Current ${route.route} route requires relevant evidence first (${route.evidenceActions}/${route.minEvidenceActions}).` };
    }
    return { allowed: true };
}
function numericValue(value) {
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'string')
        return undefined;
    const parsed = Number(value.trim().replace(/%$/, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
}
function normalizedRecall(value) {
    const raw = numericValue(value);
    if (raw === undefined)
        return undefined;
    const recall = raw > 1 && raw <= 100 ? raw / 100 : raw;
    return recall >= 0 && recall <= 1 ? recall : undefined;
}
function positiveInteger(value) {
    const n = numericValue(value);
    return n !== undefined && Number.isSafeInteger(n) && n > 0 ? n : undefined;
}
function nonNegativeInteger(value) {
    const n = numericValue(value);
    return n !== undefined && Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}
function positiveNumber(value) {
    const n = numericValue(value);
    return n !== undefined && n > 0 ? n : undefined;
}
function recordValue(record, names) {
    const normalized = new Set(names.map(name => name.toLowerCase()));
    for (const [key, value] of Object.entries(record))
        if (normalized.has(key.toLowerCase()))
            return value;
    return undefined;
}
function benchmarkFromRecord(record, fallbackId) {
    const totalQueries = positiveInteger(recordValue(record, ['total_queries', 'totalQueries', 'query_count', 'queryCount', 'queries']));
    const recall = normalizedRecall(recordValue(record, ['recall', 'recall_at_k', 'recallAtK', 'recall@10']));
    const qps = positiveNumber(recordValue(record, ['qps', 'queries_per_second', 'queriesPerSecond']));
    if (totalQueries === undefined || recall === undefined || qps === undefined)
        return undefined;
    const concurrencyValue = recordValue(record, ['concurrency', 'threads', 'workers']);
    const warmupValue = recordValue(record, ['warmup', 'warmup_queries', 'warmupQueries']);
    const concurrency = concurrencyValue === undefined ? undefined : positiveInteger(concurrencyValue);
    const warmup = warmupValue === undefined ? undefined : nonNegativeInteger(warmupValue);
    if (concurrencyValue !== undefined && concurrency === undefined)
        return undefined;
    if (warmupValue !== undefined && warmup === undefined)
        return undefined;
    const benchmarkId = String(recordValue(record, ['benchmark_id', 'benchmarkId', 'benchmark', 'name']) ?? fallbackId);
    const datasetRaw = recordValue(record, ['dataset', 'dataset_id', 'datasetId']);
    const hardwareRaw = recordValue(record, ['hardware', 'device', 'accelerator']);
    const result = {
        benchmarkId,
        ...(typeof datasetRaw === 'string' && datasetRaw ? { dataset: datasetRaw } : {}),
        totalQueries,
        recall,
        qps,
        ...(concurrency === undefined ? {} : { concurrency }),
        ...(warmup === undefined ? {} : { warmup }),
        ...(typeof hardwareRaw === 'string' && hardwareRaw ? { hardware: hardwareRaw } : {}),
    };
    return { ...result, specKey: benchmarkSpecKey(result) };
}
function recordsFrom(value) {
    const out = [];
    const queue = [value];
    const seen = new Set();
    while (queue.length && out.length < 32) {
        const current = queue.shift();
        if (Array.isArray(current)) {
            queue.push(...current);
            continue;
        }
        if (typeof current !== 'object' || current === null || seen.has(current))
            continue;
        seen.add(current);
        const record = current;
        out.push(record);
        for (const key of ['result', 'metrics', 'benchmark', 'data', 'summary'])
            if (key in record)
                queue.push(record[key]);
    }
    return out;
}
function jsonCandidates(text) {
    const out = [];
    const trimmed = text.trim();
    if (trimmed)
        try {
            out.push(JSON.parse(trimmed));
        }
        catch { }
    for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
        try {
            out.push(JSON.parse(match[1] ?? ''));
        }
        catch { }
    for (const line of text.split('\n')) {
        const candidate = line.trim();
        if (!candidate.startsWith('{') || !candidate.endsWith('}'))
            continue;
        try {
            out.push(JSON.parse(candidate));
        }
        catch { }
    }
    return out;
}
export function parseBenchmarkResult(content, meta, fallbackId = 'benchmark') {
    const candidates = [...(meta === undefined ? [] : [meta]), ...jsonCandidates(content)];
    for (const candidate of candidates) {
        for (const record of recordsFrom(candidate)) {
            const result = benchmarkFromRecord(record, fallbackId);
            if (result)
                return result;
        }
    }
    return undefined;
}
export function benchmarkSpecKey(result) {
    return [
        `benchmark=${result.benchmarkId}`,
        `dataset=${result.dataset ?? 'unspecified'}`,
        `total_queries=${result.totalQueries}`,
        `concurrency=${result.concurrency ?? 'unspecified'}`,
        `warmup=${result.warmup ?? 'unspecified'}`,
        `hardware=${result.hardware ?? 'unspecified'}`,
    ].join(';');
}
export function isFullBenchmark(result, minQueries, minRecall) {
    return result.totalQueries >= minQueries && result.recall >= minRecall;
}
export function compareBenchmarkResults(candidate, baseline, tolerancePercent) {
    if (candidate.specKey !== baseline.specKey)
        return { outcome: 'different-spec' };
    if (baseline.qps <= 0)
        return { outcome: 'improved', deltaPercent: Number.POSITIVE_INFINITY };
    const deltaPercent = ((candidate.qps - baseline.qps) / baseline.qps) * 100;
    if (candidate.qps > baseline.qps)
        return { outcome: 'improved', deltaPercent };
    if (deltaPercent >= -Math.max(0, tolerancePercent))
        return { outcome: 'within-tolerance', deltaPercent };
    return { outcome: 'regressed', deltaPercent };
}
export function verificationEvidenceFromTool(semantics, sequence, workspaceRevision, artifactRevisions) {
    if (semantics.effect !== 'verify')
        return undefined;
    const op = semantics.operation?.toLowerCase() ?? semantics.name.toLowerCase();
    const kind = /test|pytest|jest|vitest|mocha|cargo test|go test|dotnet test/.test(op) ? 'test'
        : /build|tsc|compile/.test(op) ? 'build'
            : /lint/.test(op) ? 'lint'
                : /check|typecheck/.test(op) ? 'check' : 'command';
    return {
        kind,
        scope: semantics.verificationScope ?? (semantics.artifacts.length > 0 ? semantics.artifacts : 'workspace'),
        sequence,
        workspaceRevision,
        artifactRevisions,
        summary: semantics.operation ?? semantics.name,
    };
}
export function hasCommandFailure(content) {
    const match = /(?:\[\s*)?(?:exit[ _-]?code)\s*:\s*([0-9]+)(?:\s*\])?/i.exec(content);
    return match !== null && Number(match[1]) !== 0;
}
export function isTerminalLlmFailure(failure) {
    if (typeof failure !== 'object' || failure === null)
        return false;
    const record = failure;
    const status = numericValue(record['status']);
    const code = typeof record['code'] === 'string' ? record['code'].toLowerCase() : '';
    return status === 400 || /(?:^|[_-])invalid[_-]?request[_-]?error(?:$|[_-])/.test(code);
}
//# sourceMappingURL=core.js.map