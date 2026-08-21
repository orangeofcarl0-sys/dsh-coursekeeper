# 工具与状态字段


## 0. 用户入口 `/coursekeeper`

Host 命令，所有会话可见，用于查看/开启/关闭当前会话的 Coursekeeper 管制：

```text
/coursekeeper status   查看当前会话状态（off/shadow/active）、route/acceptance/verification/blockers
/coursekeeper on       完整管制（active）：注入、拦截、验证、blockers
/coursekeeper shadow   仅观察：记录状态，不注入、不拦截
/coursekeeper off      完全关闭：不注入、不阻塞
/coursekeeper help     显示用法
```

此外，Web 会话标题栏会出现 **CK** 按钮：点击弹出菜单，可直接发送上面的命令，无需手打。DSH 设置页也有 **Coursekeeper** 配置区，可全局调整 `mode`、`requireUserOptIn`、`semanticVerifier`、`autoVerify`、`exposeStatusTool`。

## 1. `coursekeeper_control`

用途：修改当前 Route Contract 或 Acceptance 状态。它是写操作。

参数：

| 字段 | 用于 | 说明 |
|---|---|---|
| `action` | 全部 | 必填：`commit/reroute/falsify/support/accept/waive` |
| `route` | commit/reroute | `direct/inspect/plan/explore` |
| `cause` | reroute | 常用 `falsified/contradicted/verifier-fail/budget-exhausted/user-correction` |
| `hypothesis` | commit | PLAN/EXPLORE 必填 |
| `falsifier` | commit | PLAN/EXPLORE 必填 |
| `next_evidence` | commit | PLAN/EXPLORE 必填 |
| `min_evidence_actions` | commit | 可覆盖默认最小 budget |
| `max_evidence_actions` | commit | 不得小于 min |
| `epistemic` | commit | `unsupported/plausible/supported/conflicted/contradicted` |
| `obligation_id` | accept/waive | Acceptance obligation id |
| `evidence` | falsify/support/accept | 证据文本 |
| `reason` | waive | Waive 原因 |

成功/失败都返回 JSON 形式的 `{ok, message}`。

## 2. `coursekeeper_semantic_verify`

参数只有：

```json
{"force": false}
```

默认如果还有 deterministic blockers，会返回：

```json
{
  "ok": false,
  "message": "deterministic obligations remain; semantic verifier deferred",
  "blockers": ["..."]
}
```

`force:true` 只允许提前运行 verifier，不会把这些 blockers 清掉。

## 3. `coursekeeper_status`

无参数，只读。主要字段：

### 运行模式

```text
mode
augmentationProfile
jspaceAssist
routerAssist
semanticVerifier
capabilityControl
adaptiveReasoning
adaptiveRouting
adaptiveEscalation
routeChallenger
```

### Episode

```text
episode
humanRound
relation
kind
phase
risk
vector
route
initialRoute
routeTransitions
```

`route` 是完整 RouteContract，包括 source、H/K/N、budget、evidence/stall、epistemic、explicit 和 revision。

### Adaptive

```text
adaptive
  mode
  bucket
  baseRoute
  adaptiveRoute
  appliedRoute
  baseScores
  fusedScores
  eligible
  margin
  effectiveSupport
  memoryAdjustment
  bayesianAdjustment
  bayesian
  challengerEligible
  challenged
  reason
```

Shadow 模式下 `adaptiveRoute` 与 `appliedRoute` 可能不同；实际执行看 `appliedRoute` 和 Episode `route`。

### 经验域

```text
taskSignature
calibrationDomain
experienceStore
```

`experienceStore` 会显示 `loaded / entries / invalidLines / failed / bytes` 等状态。

### Evidence / Completion

```text
acceptance
openVerificationDebt
workspaceRevision
artifacts
noInformationStreak
repeatedCallCount
blockers
benchmark
semanticVerification
evidencePacket
controlPacket
```

### 审计

```text
assemblyHash
ledger
```

`assemblyHash` 用于对照请求表面是否改变；它不是 provider cache hit 的直接指标。

## 4. 常见诊断读法

`blockers=[]`：从 Coursekeeper 控制角度已允许完成。

`route.explicit=false` 且 route=PLAN/EXPLORE：还缺显式 commit。

`effectiveSupport < 3`：adaptive suggestion 数据不足；即使 score 改变也应保留 base route。

`experienceStore.invalidLines > 0`：经验文件中存在损坏/旧 schema 行；有效行仍可工作。

`semanticVerification.status=warn/unknown/failed`：Semantic gate 未清理。

`openVerificationDebt` 中 artifactRevision 大于 readback/command 对应 revision：旧验证已 stale。

## 5. `coursekeeper_branch`（v0.8）

只在：

```text
rolloutMode=verified-branching
exposeBranchTool=true
```

时注册。

动作：

| `action` | 用途 | 关键行为 |
|---|---|---|
| `evaluate` | 只计算 trigger | 不启动 workspace fork。 |
| `start` | 开始 branch wave | 受 `maxBranchWavesPerEpisode`；有 provider 时尝试 checkpoint。 |
| `register` | 注册 external/isolated candidate | 自动 fingerprint、evidence 截断、duplicate 拒绝、candidate budget 限制。 |
| `select` | 比较现有 candidates | deterministic prefilter → pairwise/PPT comparative verifier。 |
| `apply` | 应用已选 winner | alternate winner apply 后重新打开 completion debt。 |
| `abort` | 放弃 wave | 标记 blocked，并释放可释放 fork。 |
| `status` | 查看当前 wave | 不修改状态。 |

`register` 常用字段：

```text
candidate_id
origin
route
workspace_ref
summary
artifacts[]
commands[]
outputs[]
unresolved_errors[]
patch
acceptance_satisfied
verification_passed
benchmark_passed
```

`apply` 在没有自动 WorkspaceForkProvider 时要求外部先真实应用 winner，再显式：

```json
{"action":"apply","confirmed_applied":true}
```

该 flag 不代表验证通过，只触发 main-workspace debt reopening。

## 6. v0.8 `coursekeeper_status` 新字段

```text
rolloutMode
branching
  learning
  state
  lastTrigger
  contamination
  runtimeAvailable
  comparativeVerifier
  generatorProtocol
  maxCandidates
  pivots
  maxWavesPerEpisode
  autoStart
  deterministicPrefilter
  includeGeneratorReasoning=false
branchExperienceStore
```

### `branching.state`

主要字段：

```text
wavesStarted
lastOutcome
lastTrigger
current
  id
  status
  triggers
  contamination
  checkpointKind
  checkpointRef
  candidates
  selectedCandidateId
  selectionReason
  comparisonCount
  verifierCalls
  requiresReverify
```

### `runtimeAvailable`

`true` 只表示当前 Context 暴露了满足接口的 `coursekeeperBranching.workspace + executor`。

它不证明 fork provider 的文件系统/容器语义正确；真实部署仍要做隔离测试。

### 典型诊断

```text
lastTrigger.eligible=true + runtimeAvailable=false
```

表示 Coursekeeper 认为值得 branch，但当前 runtime 没有真实隔离执行能力，因此只会 suggestion。

```text
state.current.status=collecting
```

表示 candidate wave 尚未完成，finish 会被阻塞。

```text
state.current.status=selected
```

表示 winner 已选但还没应用回 main workspace。

```text
state.current.status=applied
```

表示已应用；此时真正的 blocker 应查看 Acceptance / Verification / Benchmark / Semantic debt。

```text
state.current.status=no-valid-candidate
```

表示 candidate/verifier 不能给出满足最低门槛的 winner；Episode 进入 recover。
