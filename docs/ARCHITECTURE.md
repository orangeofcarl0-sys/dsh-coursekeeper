# 架构

## 1. 设计目标

Coursekeeper 是 Harness runtime control plane，不是模型、不训练神经 Router，也不是多套 Prompt 的叠加。权威控制状态放在模型外。`native-canonical` 进一步让正常步骤尽量看不到动态 Coursekeeper message；`verified-branching` 则把多 rollout 选择放在主 trajectory 之外。

系统分为六个正交角色：

```text
Router       选择证据获取路线
Committer    控制路线切换迟滞
Evidence     记录哪些事实/验证对哪个 revision 有效
Verifier     控制 completion 与 route veto
Calibrator   用个人历史有界修正路由边界
Brancher     判断 repair vs resample，管理隔离 candidate 与 comparative selection
```

## 2. v0.8 分层

```text
Protocol Fidelity
    |
Native Cognitive Continuity
    |
Route / Commit / Falsify
    |
Single Rollout
    |
Trajectory Health
    |
    +-- Continue
    +-- Reroute
    +-- Verified Branching
            |
      Comparative Verifier
            |
      winner -> main workspace
            |
      Acceptance / Verification / Semantic reverify
    |
Personal Adaptation
```

关键边界：

```text
Generator Protocol != Verifier Protocol
route failure       != trajectory contamination
selection           != apply
apply               != verification
```

`augmentationProfile` 控制单条 Generator trajectory；`rolloutMode` 控制是否允许额外 candidate。两者正交。

### Generator Protocol

`native-canonical` 可以固定 exact persona、候选工具前缀与低污染 message topology。Generator 允许保留自身 reasoning continuity。

### Verifier Protocol

Comparative Verifier 使用 fresh context，只看 task + candidate evidence，不继承 Generator hidden CoT。same-model verifier 仍与 Generator context 隔离。

### Branch Runtime

Coursekeeper 内核只编排 branch。真实 workspace 隔离由 `WorkspaceForkProvider` 提供。没有 provider 时只产生 suggestion，不在主 workspace 模拟并发。

## 3. 三种状态生命周期

### WorkspaceState

跨 objective 保留：

```text
workspace revision
artifact revisions
artifact dependencies / dependents
verification debt
verification evidence
```

它回答：“工作区现在是什么状态；过去的验证还对当前 revision 有效吗？”

### EpisodeState

属于一个 objective：

```text
TaskContract
initial/current RouteContract
route transitions
Acceptance obligations
ProgressEvent
benchmark state
Semantic Verification state
adaptive decision
```

它回答：“当前任务要做什么、走哪条路线、为什么还不能结束？”

### TurnState

只属于当前 turn：

```text
active tool calls
automatic verification continuations
blocker-report flag
```

它防止验证续步或 call 状态跨 turn 污染。

## 4. TaskContract

用户消息先被归一化成：

```ts
TaskContract {
  objective
  relation
  kind
  complexity
  risk
  artifacts
  acceptanceHints
  evidencePolicy
  vector: {
    uncertainty
    horizon
    coupling
    observability
    risk
    novelty
  }
}
```

`relation` 与 `kind` 正交：relation 表示和上一 objective 的关系，kind 表示任务性质。

```text
relation: new / continuation / extension / correction / clarification
kind: build / fix / review / analysis / research / conversation / unknown
```

## 5. Deterministic Router

四条 route 的 base score 由 TaskVector 计算。它不依赖个人数据，因此 cold-start 有稳定行为。

直观关系：

```text
DIRECT   偏好低 uncertainty / horizon / coupling / risk
INSPECT  偏好高 observability、fix/review/analysis、continuity
PLAN     偏好高 horizon / coupling / risk
EXPLORE  偏好高 uncertainty / novelty、research
```

v0.7 自适应层只修正 score，不改变安全 eligibility。

## 6. RouteContract

每个 Episode 都有 RouteContract：

```ts
RouteContract {
  route
  source
  hypothesis?
  falsifier?
  nextEvidence?
  minEvidenceActions
  maxEvidenceActions
  evidenceActions
  stallActions
  epistemic
  explicit
  revision
}
```

默认 budget：

```text
DIRECT   0–1
INSPECT  1–3
PLAN     2–4
EXPLORE  2–5
```

PLAN / EXPLORE 必须 explicit commit；DIRECT / INSPECT 可自动建立 contract。

## 7. Commitment Hysteresis

Commitment 不增加 reasoning budget。它只决定“现在能否换 route”。

允许立即换路的强原因：

```text
falsified
contradicted
verifier-fail
user-correction
```

否则至少完成 `minEvidenceActions`。当 evidence/stall budget 到达 `maxEvidenceActions` 时，也允许以 `budget-exhausted` 换路。

这保证：路线不会因普通犹豫反复跳转；同时 falsifier 一旦命中，不会被 commitment 锁死。

## 8. Evidence 与 Debt

mutation 创建 artifact revision 和 Verification Debt。证据不是“模型说已经验证”，而是来自 durable tool result 的 readback/test/build/check 等事件。

Acceptance Debt 与 Verification Debt 分开：

```text
Acceptance: 用户要求的结果是否出现
Verification: 已经出现的修改是否被验证
```

因此测试全绿但 feature 未实现，仍不能 finish；feature 已实现但未验证，也不能 finish。

## 9. Semantic Verifier

确定性义务优先。只有不能被 test/build/benchmark 完全覆盖的语义问题，才使用独立 verifier。

Verifier 不读取主模型完整 CoT，只接收 Evidence Packet。它可以返回：

```text
PASS
WARN
PATCH
FAIL_ROUTE
UNKNOWN
```

`PATCH` 只替换工作假设，不惩罚 route；`FAIL_ROUTE` 才释放 route hysteresis 并形成强负 route signal。

## 10. 自适应闭环

Episode 结束后产生 `RouteExperience`。下一任务执行：

```text
TaskContract
→ TaskSignature
→ deterministic prior
→ nearest personal cases
→ Bayesian bucket estimate
→ bounded fused scores
→ support gate / margin
→ route or challenger
```

最重要的不变量：

```text
零历史 = v0.6 deterministic 行为
支持不足 = deterministic route
历史不能启用 ineligible route
外部/provider failure 不训练 route
PATCH 不算 route failure
```

## 11. Adaptive Escalation

Coursekeeper 更重视“何时升级”而不是一次四选一必须正确：

```text
DIRECT → INSPECT          无有效进展
INSPECT → PLAN            发现高 coupling
INSPECT → EXPLORE         uncertainty / falsifier / stall
PLAN → EXPLORE            计划被未知机制阻塞
EXPLORE → PLAN            假设已 supported，进入实现收敛
```

个人经验只允许把反复失败的升级阈值向“更早升级”移动；不会在小数据下自动学得更冒险、更晚升级。

## 12. Cache 设计

默认 `governor + guard + adaptiveReasoning=off`：

```text
官方 persona/context 基本保持稳定
工具 schema 基本保持稳定
固定小 kernel
动态 <ck> packet <= 640 chars
经验检索与 Bayesian 计算完全本地
```

额外模型调用只来自 event-triggered Route Challenger 或 Semantic Verifier。`router-assist` 和 `adaptiveReasoning` 是明确的实验变量，因为它们更容易改变请求形状。
