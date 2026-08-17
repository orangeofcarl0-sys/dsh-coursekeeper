# 自校准路由

## 1. 为什么不是 Learned Router

正常 Agent 只观察实际走过的 route。没有完整反事实，就不知道同一个任务走另外三条 route 会怎样。若做监督训练，需要大量多 route 重复运行，成本高，而且模型/Harness/Prompt 一升级数据就会漂移。

Coursekeeper 的目标更小：

```text
不学习“正确 route 的通用模型”
只学习“确定性策略在哪些个人任务边界上经常后悔”
```

## 2. Deterministic Prior

`deterministicRoutePrior()` 返回：

```text
eligible routes
每条 route 的 base score
preferred route
```

Eligibility 是安全层。high-risk、research 或 uncertainty 很高时，`DIRECT` 可以被排除。后续个人记忆不能把它重新启用。

## 3. TaskSignature

每个 objective 被压缩为：

```text
kind / relation / risk
complexity / coupling / uncertainty / observability / novelty
artifactCountBin
continuity
deterministicOracle
objectiveHash
objectiveSimHash
workspaceHash
```

`objectiveSimHash` 使用字符 n-gram 64-bit SimHash，适合中英文近似匹配；`objectiveHash` 是精确 SHA-256 身份指纹。两者都不保存原始 objective。

## 4. CalibrationDomain

经验必须在环境域中解释：

```text
providerFamily
modelFamily
modelRevision
augmentationProfile
harnessVersion
policySchemaVersion
```

默认跨 provider/model family 权重为 0；不同 modelRevision 会降权；不同 profile 默认乘 `0.25`；Harness 和 policy schema 变化也降权。

这避免把 `Flash + router-assist` 的行为直接灌给 `Pro + governor`。

## 5. Case Memory

`nearestExperiences()` 先计算 TaskSignature 相似度，再乘环境域权重与时间衰减。

相似度考虑：

```text
kind / relation / risk
complexity / coupling / uncertainty / observability
artifact count / oracle
SimHash
workspaceHash
```

通过 `memoryMinSimilarity` 后，权重进一步平方，因此边缘相似案例贡献很小。最后只取 `memoryTopK`。

时间权重：

```text
weight_age = 0.5 ^ (ageDays / experienceHalfLifeDays)
```

默认 90 天半衰期。

## 6. Bayesian Calibration

每个 coarse bucket × route 维护 Beta posterior：

```text
p(route useful | bucket, personal history) ~ Beta(alpha, beta)
```

这不是在声称真实 route success 是严格 i.i.d. Bernoulli；Beta 这里只作为一个低数据、可解释的偏好和置信度估计器。

先验强度由 `bayesianPriorStrength` 控制。`effectiveN` 低时，posterior 对最终 route 几乎没有影响。

## 7. 可归因弱监督

经验学习只接受 route-level 可归因信号。典型规则：

```text
同 route 完成且 obligations 清零        → 正信号
Semantic PASS                         → 正信号
PATCH 后同 route 成功                  → route 正信号
FAIL_ROUTE                            → 旧 route 强负信号
FAIL_ROUTE 后 successor 成功          → successor 正信号
无信息导致 forced escalation          → 当前 route 负信号
provider / permission / external error → 不更新
```

`PATCH` 说明 hypothesis 错，不说明 route 错，因此绝不能作为 route 负样本。

## 8. Bounded Fusion

最终 fused score：

```text
S = S_base + Δ_memory + Δ_bayesian
```

总修正硬限制：

```text
|S - S_base| <= maxAdaptiveAdjustment
```

默认 `0.15`。

Memory 与 Bayesian 都来自同一批 Episode，support 不能简单相加；实现取两者的较大有效支持，避免双重计数。

## 9. Support Gate

即使 adaptive score 排名变化，只有：

```text
effectiveSupport >= minEffectiveSupport
```

active 模式才允许应用 adaptive route。默认阈值为 `3`。

这不是“3 个 Episode 就一定够”，因为 support 经过相似度、domain 和 age 权重后可能远小于条目数。

## 10. Shadow / Active

`off`：完全使用 deterministic prior，不计算个人路由影响。

`shadow`：计算完整 adaptive decision，但实际保留 base route。推荐默认。

`active`：满足 eligibility、support 与 bounded adjustment 后，个人校准可以改变 initial route。

## 11. Route Margin

取 top-2 fused scores：

```text
margin = S1 - S2
```

margin < `routeMarginThreshold` 时视为 ambiguous。

低风险任务倾向选择候选中更便宜的 route；中高风险任务可标记 `challengerEligible`。

## 12. Route Challenger

只有以下条件同时满足才可能调用：

```text
adaptiveRouting = active
routeChallenger != off
risk >= routeChallengerMinRisk
margin 小
每 Episode 未超过 maxRouteChallengesPerEpisode
```

Challenger 只比较候选 route，使用短 prompt，最大输出被压到不超过 512 tokens。它不是第二个主 Agent。

## 13. Safe Exploration

默认 `safeExplorationRate=0`。显式开启后也只允许：

```text
low risk
小 margin
候选 route 都 eligible
support 足够
```

并且错误路线仍受 evidence budget 和 escalation 约束。不要用 safe exploration 给高风险任务采数据。

## 14. Adaptive Escalation

最值得学习的是 transition，而不是初始四分类：

```text
DIRECT → INSPECT
INSPECT → PLAN
INSPECT → EXPLORE
PLAN → EXPLORE
EXPLORE → PLAN
```

`calibrated` 模式会统计可归因历史，把 PLAN coupling threshold 和 EXPLORE uncertainty threshold**只向更早升级方向**移动，并限制最大移动量。

这是小数据安全设计：系统可以从“经常升级太晚”中学习，但不会因为少量成功案例自动学得更冒险。

## 15. 何时清空或隔离经验

模型 family 大变：保持 `crossModelWeight=0` 即可，无需删除旧数据。

同模型 checkpoint 改变：更新 `modelRevision`，让旧数据自动降权。

Harness 或 Coursekeeper policy 大改：更新 `harnessVersion` / `policySchemaVersion`。

如果怀疑经验本身有系统性污染，可备份后删除 `experiences-v1.jsonl`；零历史会严格回退到 deterministic 路由。
