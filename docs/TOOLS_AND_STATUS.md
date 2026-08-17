# 工具与状态字段

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
