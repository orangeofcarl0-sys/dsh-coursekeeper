import { hammingSimilarity64 } from './signature.js';
function eq(a, b) { return a === b ? 1 : 0; }
function closeness(a, b) { return Math.max(0, 1 - Math.abs(a - b)); }
export function taskSimilarity(left, right) {
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
        + 0.04 * eq(left.workspaceHash, right.workspaceHash);
}
export function domainWeight(current, past, options) {
    let weight = 1;
    if (current.providerFamily !== past.providerFamily || current.modelFamily !== past.modelFamily)
        weight *= options.crossModelWeight;
    else if (current.modelRevision !== past.modelRevision)
        weight *= 0.65;
    if (current.augmentationProfile !== past.augmentationProfile)
        weight *= options.crossProfileWeight;
    if (current.harnessVersion !== past.harnessVersion)
        weight *= 0.75;
    if (current.policySchemaVersion !== past.policySchemaVersion)
        weight *= options.stalePolicyWeight;
    return weight;
}
export function ageWeight(at, halfLifeDays, now = Date.now()) {
    const time = Date.parse(at);
    if (!Number.isFinite(time) || halfLifeDays <= 0)
        return 1;
    const ageDays = Math.max(0, (now - time) / 86_400_000);
    return Math.pow(0.5, ageDays / halfLifeDays);
}
export function nearestExperiences(experiences, task, domain, topK, minSimilarity, halfLifeDays, domainOptions) {
    const weighted = [];
    for (const experience of experiences) {
        const similarity = taskSimilarity(task, experience.task);
        if (similarity < minSimilarity)
            continue;
        const d = domainWeight(domain, experience.domain, domainOptions);
        if (d <= 0)
            continue;
        const weight = similarity * similarity * d * ageWeight(experience.at, halfLifeDays);
        if (weight > 0)
            weighted.push({ experience, similarity, weight });
    }
    weighted.sort((a, b) => b.weight - a.weight);
    return weighted.slice(0, Math.max(1, topK));
}
//# sourceMappingURL=similarity.js.map