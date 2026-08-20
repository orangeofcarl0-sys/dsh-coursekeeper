# Verified Branching 模式

`Verified Branching` 是 v0.8.0 新增的 rollout policy。它不改变现有 Route/J-Space/Router profile，而是在单轨迹已经不值得继续强修时，允许生成少量隔离候选，再用 fresh-context verifier 做选择。

启用：

```yaml
augmentationProfile: native-canonical   # 可选，但推荐作为 generator 基线
rolloutMode: verified-branching
```

默认仍是：

```yaml
rolloutMode: single
```

因此升级到 v0.8.0 不会自动增加多 rollout 成本。

## 1. 设计目标

Verified Branching 解决一个与 reroute 不同的问题：

```text
route 错了，但当前上下文仍可信      -> reroute
trajectory 本身已经被错误前提污染 -> resample / branch
```

典型污染信号包括：

- 多个 hypothesis 连续被 falsify；
- `FAIL_ROUTE` / verifier-fail；
- 长时间 no-progress；
- repeated call / stall 增长；
- epistemic state 已 `conflicted/contradicted`；
- Semantic Verifier 为 `FAIL_ROUTE` 或持续 `UNKNOWN`。

Coursekeeper 将这些信号压成 `trajectoryContaminationScore`，但 branching 是否触发仍由离散事件和风险约束共同决定，不由单一分数直接控制。

## 2. 与 augmentationProfile 正交

不要把：

```text
native-canonical
verified-branching
```

理解成两个互斥 profile。

两者控制不同层：

```text
augmentationProfile -> 单条 Generator trajectory 如何运行
rolloutMode          -> 是否允许额外 trajectory / candidate selection
```

推荐实验组合：

```yaml
augmentationProfile: native-canonical
rolloutMode: verified-branching
```

这样候选之间的 diversity 来自 trajectory，而不是通过改 persona/tool order 破坏 Generator protocol。

## 3. 默认流程

```text
single rollout
    |
    v
Coursekeeper trajectory health
    |
    +-- healthy --------------------------> continue
    |
    +-- branch trigger
            |
            v
      checkpoint/fork capability?
            |
      no ---+--> suggested only; 不伪造分支
            |
           yes
            v
      current + fresh candidate (Bo2)
            |
            v
      deterministic prefilter
            |
            +-- one clear survivor -------> select
            |
            +-- unresolved pair ----------> fresh verifier
                                             |
                                high margin + valid score -> select
                                             |
                                low margin ---------------> add candidate (Bo3)
                                             |
                                reject both --------------> NO_VALID_CANDIDATE
            |
            v
      selected alternate
            |
            v
      apply to MAIN workspace
            |
            v
      reopen Acceptance / Verification / Benchmark / Semantic debt
            |
            v
      deterministic reverify
```

选择不是完成证明。**winner 一定要回到 main workspace 后重新验证。**

## 4. Branch trigger

当前内置 trigger：

```text
fail-route
no-progress
low-route-margin
semantic-unknown
semantic-fail
contaminated
manual
```

默认自动触发开关：

```yaml
branchTriggerFailRoute: true
branchTriggerNoProgress: true
branchTriggerLowRouteMargin: true
branchTriggerSemanticUnknown: true
```

冷启动策略刻意保守：

- `fail-route / semantic-fail / contaminated` 是 strong signal；
- `no-progress / semantic-unknown` 需要风险或 contamination 支撑；
- 单独 `low-route-margin` 默认只在 high-risk 任务形成 branching eligibility；
- 小样本 branch learning 不能压掉 strong signal。

这避免把“Router 有一点犹豫”直接变成昂贵的多 rollout。

## 5. Progressive Bo2 -> Bo3

默认：

```yaml
branchInitialCandidates: 2
branchMaxCandidates: 3
```

`2` 包括当前 trajectory，因此第一次通常只新增一个 fresh candidate。

如果比较 margin 足够大，Bo2 立即结束；只有不确定时才追加第三个候选。

可提高 `branchMaxCandidates`，但不建议先于真实成本实验这样做。

当 `N >= 4` 时，Coursekeeper 使用 bounded pivot tournament：

```text
ring pass
-> select empirical pivots
-> non-pivot vs pivot + pivot-vs-pivot
```

默认：

```yaml
branchPivots: 1
```

N=5、k=1 时比较数量为：

```text
5 ring + 4 pivot = 9
```

而不是完整 round-robin 的 10。N 增大时差异更明显。

N=3 直接做完整三对比较，避免小 N 下 tournament 结构反而增加不稳定性。

## 6. Candidate diversity

Verified Branching 不通过改变 protocol 制造多样性。

优先顺序：

```text
1. fresh stochastic trajectory
2. top-2 route ambiguity 时使用 alternate route
3. 外部 runtime 自己实现的 hypothesis diversity
```

禁止默认做：

```text
persona A / persona B
bash-first / read-first
不同 tool schema
不同 native-canonical prefix
```

否则无法区分 rollout diversity 与 protocol mutation。

## 7. Candidate evidence

候选提交给 Comparative Verifier 的是 `BranchEvidence`：

```ts
{
  summary
  artifacts
  commands
  outputs
  unresolvedErrors
  acceptanceSatisfied?
  verificationPassed?
  benchmarkPassed?
  patch?
}
```

不包含 Generator hidden CoT。

输入在进入 fingerprint/verifier 前会截断：

```text
summary              <= 2400 chars
artifacts             <= 64
commands              <= 64 x 2400 chars
outputs               <= 64 x 4800 chars
unresolvedErrors      <= 32 x 2400 chars
patch                 <= 24000 chars
```

这些限制用于防止一个异常 candidate 把 verifier prompt 和缓存成本无限放大。

## 8. Candidate fingerprint 与去重

fingerprint 由：

```text
origin
route
artifacts
commands
outputs
errors
patch
acceptance / verification / benchmark flags
```

计算。

candidate id、createdAt、workspace 临时路径不参与 fingerprint，因此两个语义等价的候选不会因为临时名字不同而绕过去重。

重复 candidate 会被拒绝，并尽可能释放其 fork workspace。

## 9. Deterministic prefilter

LLM verifier 之前先看明确事实。

以下情况直接判 candidate `fail`：

```text
unresolvedErrors 非空
verificationPassed === false
benchmarkPassed === false
acceptanceSatisfied === false
```

注意：`undefined` 表示“未知/尚未证明”，不是失败。

因此当前仍在运行的主 trajectory 如果 acceptance 尚未关闭，只会被视为 `unknown`，不会因为“还没做完”被误删。

如果 deterministic prefilter 已经只剩一个明确 candidate，不调用 Comparative Verifier。

## 10. Fresh-context Comparative Verifier

Generator 与 Verifier 是两个不同 role。

Generator 可以是：

```text
native-canonical
exact software-engineer persona
retained tool trajectory
```

Verifier 默认是：

```text
fresh-evidence-evaluator-v1
fresh context
includeGeneratorReasoning=false
```

Verifier 被要求：

- 只比较执行证据；
- 不奖励 confidence / verbosity / effort；
- 不延续任一候选的 reasoning narrative；
- 允许 `no_valid_candidate`。

默认 criteria：

```yaml
comparativeVerifierCriteria:
  - acceptance
  - evidence
  - errors
```

内部 structured backend 期待：

```json
{
  "decision": "a|b|tie|no_valid_candidate",
  "scoreA": 0.0,
  "scoreB": 0.0,
  "confidence": 0.0,
  "reason": "...",
  "criterionScores": {}
}
```

`scoreA/B` 表示候选满足任务的证据性概率，不是风格评分。

## 11. Comparative Verifier backend

v0.8.0 不强依赖 Python `llm-verifier`。

默认顺序：

1. 若 `ctx.coursekeeperComparativeVerifier.compare` 存在，使用外部 backend；
2. 否则用 DSH `llm.stream` 做 structured fresh-context comparison。

外部 backend 可声明：

```text
scoring = structured
scoring = fine-grained-logprob
scoring = external
```

因此后续可以接入 A-T logprob expectation / pivot-verifier 服务，而不把 Python runtime 变成 Coursekeeper 的硬依赖。

外部接口见 [BRANCHING_PROTOCOL.md](BRANCHING_PROTOCOL.md)。

## 12. Selection gate

默认：

```yaml
branchSelectionMinScore: 0.55
branchSelectionMargin: 0.08
```

必须同时满足：

```text
best evidence score >= minScore
winner margin       >= selectionMargin
```

否则：

```text
candidate budget 未满 -> expand
candidate budget 已满 -> NO_VALID_CANDIDATE
```

Verifier 不被迫从一组都很差的 candidate 中选“最不差的一个”。

## 13. NO_VALID_CANDIDATE

出现以下情况会进入该状态：

- deterministic prefilter 全部失败；
- verifier 明确拒绝全部 candidate；
- best score 低于 minimum；
- 到达 candidate/verifier-call budget 后仍无法形成足够 margin。

结果：

```text
branch status = no-valid-candidate
phase         = recover
recoveryBlocker set
```

此时不能 finish。下一步应 reroute、人工介入或启动新的 Episode，而不是接受一个低置信 winner。

## 14. Winner apply 与重新欠债

Alternate winner 被选中以后：

```text
selected != verified
```

WorkspaceForkProvider `apply()` 成功后，Coursekeeper 会：

1. 重新打开所有非 waived Acceptance obligations；
2. 为 candidate artifacts 创建新的 Verification Debt；
3. 使旧 benchmark pass 对新 workspace revision 失效；
4. 如果需要 Semantic Verifier，恢复到 `pending`；
5. phase 转为 `verify`。

因此 branch 内部的“tests passed”只用于 selection，不替代主 workspace 的最终验证。

如果保留的是 current candidate，因为 main workspace 没变，不人为制造新的 revision debt；原有 completion blockers 仍然有效。

## 15. Workspace fork 边界

Coursekeeper 内核实现了 branching orchestration，但不会伪造 DSH 没有提供的 workspace snapshot。

自动 branching 需要外部安装：

```ts
ctx.coursekeeperBranching = {
  workspace: WorkspaceForkProvider,
  executor: BranchExecutor,
}
```

能力等级：

```text
none
restart
pre-mutation
arbitrary
```

v0.8 推荐只把：

```text
restart
pre-mutation
```

当成稳定路径。

若没有 provider：

```text
trigger 仍会计算
status/evaluate 可看到 eligible
ledger 写 branch/suggested
不会在 main workspace 上并发修改
```

这不是 silent fallback，而是显式 capability boundary。

## 16. 手工/外部 candidate 模式

即使没有自动 WorkspaceForkProvider，也可以显式：

```text
coursekeeper_branch action=start
coursekeeper_branch action=register ...
coursekeeper_branch action=select
```

外部系统若已经把 alternate winner 应用到主 workspace，可：

```json
{"action":"apply","confirmed_applied":true}
```

该调用只表示“外部 apply 已发生”，随后仍会 reopening debt。

不要在没有真实 apply 的情况下设置 `confirmed_applied=true`。

## 17. Branch Experience

默认路径：

```text
$DSH_HOME/coursekeeper/branch-experiences-v1.jsonl
```

一行记录：

```text
CalibrationDomain
Generator protocol fingerprint
Verifier protocol
TaskSignature
triggers
contamination
candidate count
selected origin
final main-workspace reverify
incremental branch/verifier cost
```

只有：

```text
alternate candidate selected
AND final main-workspace reverify passed
```

才记为：

```text
useful=true
```

选回 current candidate 不算 branch uplift；branch 后最终验证失败也不算 uplift。

## 18. Branch learning

```yaml
branchLearning: shadow
```

默认只计算经验校准，不改变 deterministic branch decision。

可选：

```text
off
shadow
active
```

Bayesian calibration 以粗粒度：

```text
task kind
risk
uncertainty bucket
coupling bucket
trigger set
```

维护 branch-usefulness posterior。

安全约束：

- support < 3 时保持 deterministic decision；
- strong fail-route/contamination signal 不允许历史数据压掉；
- `crossProtocolWeight=0` 默认禁止不同 Generator protocol 经验迁移；
- `crossModelWeight=0` 仍保持不同 model family 隔离；
- `crossRolloutWeight=0.25` 只允许弱跨 rollout-policy transfer。

## 19. 非持久活动 wave

Branch candidate workspace 是外部临时资源，不是 DSH Session Event 的一部分。

因此 v0.8 的 active branch wave **不跨进程恢复**。进程重启后：

- main workspace / durable Coursekeeper state 仍按原 Session replay；
- 临时 candidate workspace 由 WorkspaceForkProvider 自己负责清理；
- 不自动把旧 fork 重新附着到新 Agent runtime。

这是故意的 fail-closed 设计。恢复一个来源不明、revision 不明确的旧 fork 比重新 branch 风险更高。

## 20. 推荐首轮实验

```yaml
augmentationProfile: native-canonical
rolloutMode: verified-branching
branchLearning: shadow
branchInitialCandidates: 2
branchMaxCandidates: 3
branchPivots: 1
maxBranchWavesPerEpisode: 1
adaptiveRouting: shadow
safeExplorationRate: 0
adaptiveReasoning: off
```

同时记录：

```text
Pass@1
Oracle@N
Selected@N
branch trigger rate
alternate-winner rate
final reverify pass rate
verifier calls
incremental uncached tokens
NO_VALID_CANDIDATE rate
```

先证明 branching 在什么任务上值得，再考虑 `branchLearning=active`。
