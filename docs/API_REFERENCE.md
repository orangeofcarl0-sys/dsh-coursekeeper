# 源码 API 参考

Coursekeeper 是 DSH plugin，同时导出纯逻辑模块，便于测试、外部 evaluator 和研究脚本复用。

## 1. 包导出

```text
@orangeofcarl0-sys/dsh-coursekeeper
@orangeofcarl0-sys/dsh-coursekeeper/core
@orangeofcarl0-sys/dsh-coursekeeper/state
@orangeofcarl0-sys/dsh-coursekeeper/verifier
@orangeofcarl0-sys/dsh-coursekeeper/profiles
@orangeofcarl0-sys/dsh-coursekeeper/adaptive
```

根导出同时 re-export core/debt/state/types/verifier/profiles/adaptive。

## 2. `core`

主要纯逻辑：

```text
classifyTaskContract
estimateTaskVector
routeScores
selectRoute
routeContractForRoute
defaultRouteContract
routeRequiresExplicitCommit
canSwitchRoute
createAcceptanceObligations
staticKernel
```

以及 tool classification、benchmark parse/compare 等基础函数。

## 3. `state`

主要状态机：

```text
acceptHumanTask
registerToolCall
settleToolResult
applyCoursekeeperControl
applyTrajectoryControl        # legacy compatible export
applyAdaptiveInitialRoute
applyAdaptiveEscalation
completionBlockers
canFinish
currentControlPacket
rebuildStateFromEvents
```

`applyCoursekeeperControl` 是 canonical 名；`applyTrajectoryControl` 为源码兼容保留。

## 4. `debt`

负责：

```text
ArtifactState revision
VerificationDebt creation
VerificationEvidence application
open/prune debt
dependency invalidation
```

外部测试若要验证 artifact-scoped 行为，应直接使用本模块，而不是通过字符串解析状态。

## 5. `verifier`

主要函数：

```text
buildEvidencePacket
verifierPrompt
parseSemanticVerifierResult
shouldRequireSemanticVerification
applySemanticVerifierResult
resetSemanticVerification
```

`parseSemanticVerifierResult` 只接受合法 JSON 和规定 decision enum；解析失败不得当 PASS。

## 6. `profiles`

```text
jspaceAssistKernel
routePersona
applyRouterAssist
```

这些函数是 augmentation surface，不负责 route authority。

## 7. `adaptive`

### signature

```text
buildTaskSignature
routeBucket
simHash64
hammingSimilarity64
```

### similarity

```text
taskSimilarity
domainWeight
ageWeight
nearestExperiences
```

### calibration

```text
bayesianCalibration
bayesianAdjustment
calibratedEscalationThresholds
```

### policy

```text
deterministicRoutePrior
decideAdaptiveRoute
withChallenge
```

### escalation

```text
suggestEscalation
```

### experience/store

```text
buildRouteExperience
ExperienceStore
```

## 8. 关键类型

建议外部集成只依赖公开类型，不依赖内部 RuntimeState：

```text
TaskContract
TaskSignature
RouteContract
RouteExperience
CalibrationDomain
AdaptiveRouteDecision
AcceptanceObligation
VerificationDebt
VerificationEvidence
ProgressEvent
SemanticVerificationState
GovernorState
```

## 9. 兼容约束

`policySchemaVersion` 和 `RouteExperience.schemaVersion` 是持久化/校准语义的一部分。若以后改变 TaskSignature 字段含义、route signal attribution 或 bucket 逻辑，应提升相应 schema，并对旧经验降权或迁移。

# v0.8 Verified Branching API

公开 export：

```text
@orangeofcarl0-sys/dsh-coursekeeper/branching
@orangeofcarl0-sys/dsh-coursekeeper/branching-store
```

主要函数：

```text
trajectoryContaminationScore
branchTriggerDecision
bayesianBranchEstimate
sanitizeBranchEvidence
branchCandidateFingerprint
createBranchCandidate
deduplicateCandidates
assessCandidate
deterministicPrefilter
comparativeVerifierPrompt
parseComparativeVerifierResult
selectPair
branchRingPairs
branchPivotRoundPairs
branchSoftWin
buildBranchExperience
```

状态机接口：

```text
startBranchWave
registerBranchCandidate
recordBranchSelection
recordNoValidBranchCandidate
reopenAfterBranchApply
```

运行时类型：

```text
WorkspaceForkProvider
BranchExecutor
BranchRuntimeProvider
ComparativeVerifierBackend
BranchCandidate
BranchEvidence
ComparativeVerifierResult
BranchExperience
BranchTriggerDecision
```

`WorkspaceForkProvider` 与 `ComparativeVerifierBackend` 是注入点，不要求由 Coursekeeper 包自身实现具体 Git worktree/container provider。

`reopenAfterBranchApply` 是 correctness boundary：任何 alternate winner apply 后，都必须从这里重新建立 main-workspace verification state，不能直接把 branch 内 evidence 搬成完成证明。
