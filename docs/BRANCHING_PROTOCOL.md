# Verified Branching 运行时协议

本文只定义运行时接口和失败语义。概念与使用方式见 [VERIFIED_BRANCHING_MODE](VERIFIED_BRANCHING_MODE.md)。

## 1. 原则

Coursekeeper 负责：

```text
何时 branch
如何管理 candidate
何时比较
如何选择/拒绝
winner apply 后重新欠债
branch experience
```

外部 runtime 负责：

```text
如何 snapshot/fork workspace
如何在隔离 workspace 运行 fresh candidate
如何把 winner 应用回 main workspace
如何释放临时 workspace
```

边界必须清楚。Coursekeeper 不会把同一主 workspace 上的连续修改伪装成独立 candidate。

## 2. `WorkspaceForkProvider`

```ts
interface WorkspaceForkProvider {
  readonly capability:
    | 'none'
    | 'restart'
    | 'pre-mutation'
    | 'arbitrary'

  checkpoint(input: {
    episodeId: number
    workspaceRevision: number
    preferred: 'restart' | 'pre-mutation'
  }): Promise<{
    capability: WorkspaceForkCapability
    ref?: string
    reason?: string
  }>

  fork(
    checkpoint: BranchCheckpoint,
    candidateId: string
  ): Promise<{ workspaceRef: string }>

  apply(candidate: BranchCandidate): Promise<{
    ok: boolean
    artifacts?: readonly string[]
    reason?: string
  }>

  dispose?(workspaceRef: string): Promise<void>
}
```

### `checkpoint`

必须返回一个真实可复现起点。

若无法提供：

```ts
{ capability: 'none', reason: '...' }
```

不要返回假的 ref。

### `fork`

每个 candidate 必须获得隔离 workspace。

`workspaceRef` 只在 runtime 内使用，不参与 candidate fingerprint。

### `apply`

只负责把 winner 的 artifact delta 合并到 main workspace。

成功返回可提供实际被修改的 artifact 列表：

```ts
{ ok: true, artifacts: ['src/a.ts', 'src/b.ts'] }
```

Coursekeeper 使用该列表建立主 workspace verification debt。

### `dispose`

应幂等。winner apply 完成、original 被保留、duplicate、abort、NO_VALID_CANDIDATE 时都会尝试释放 candidate workspace。

## 3. `BranchExecutor`

```ts
interface BranchExecutor {
  execute(input: {
    candidateId: string
    workspaceRef: string
    objective: string
    route?: Route
    freshContext: true
    includeGeneratorReasoning: false
  }): Promise<{
    route?: Route
    evidence: BranchEvidence
  }>
}
```

Coursekeeper 会强制生成 candidate 的：

```text
id
origin
workspaceRef
fingerprint
createdAt
```

executor 不应伪造这些字段。

`freshContext:true` 与 `includeGeneratorReasoning:false` 是协议常量，不是建议。

## 4. Candidate origin

```text
current          当前 main trajectory
fresh            相同任务、fresh context 新采样
route-alternate  在 route ambiguity 下明确指定另一条 eligible route
external         由外部系统手工注册
```

自动 executor 生成的 origin 由 Coursekeeper 决定，不能由 executor 覆盖成 `current`。

这避免 alternate candidate 因错误 metadata 绕过 apply/reverify。

## 5. `ComparativeVerifierBackend`

可选外部接口：

```ts
interface ComparativeVerifierBackend {
  readonly scoring:
    | 'structured'
    | 'fine-grained-logprob'
    | 'external'

  compare(input: {
    objective: string
    candidateA: BranchCandidate
    candidateB: BranchCandidate
    criteria: readonly string[]
    protocol: VerifierProtocolDescriptor
  }, signal?: AbortSignal): Promise<ComparativeVerifierResult | string | undefined>
}
```

挂载：

```ts
ctx.coursekeeperComparativeVerifier = backend
```

若返回 string，Coursekeeper 按 strict JSON parser 解析。

若返回 object，`decision` 必须是：

```text
a
b
tie
no_valid_candidate
```

异常、非法 object 或不可解析 string 都当作该 comparison 没有有效结果，不 silently 变成 0.5 tie。

## 6. 默认 DSH comparative backend

若没有外部 backend，Coursekeeper 使用：

```text
ctx.llm.stream
```

单独 provider/model 可配置：

```yaml
comparativeVerifierProvider: ...
comparativeVerifierModel: ...
comparativeVerifierMaxTokens: 1536
```

否则回退到 Semantic Verifier provider/model，再回退到当前 Agent provider/model。

调用是 fresh request：

```text
system = fresh-context comparative verifier
user   = task + candidate evidence A/B + criteria
```

不会把主 Agent message history 或 hidden reasoning 传入。

## 7. Call budget

```yaml
maxComparativeVerifierCalls: 8
```

内部和外部 backend 都受同一单-wave call cap。

达到上限且没有 confident winner：

```text
NO_VALID_CANDIDATE
```

而不是无限 verifier loop。

## 8. Workspace capability 与自动模式

`maybeAutoBranch` 只在：

```text
rolloutMode=verified-branching
branchAutoStart=true
trigger eligible
wave budget 未耗尽
```

时运行。

然后：

```text
resolve runtime provider
 -> absent: branch/suggested only
 -> present: checkpoint
      -> capability=none / no ref: suggested only
      -> valid: start wave
```

因此自动模式没有任何“在主 workspace 复制一遍操作作为 fake branch”的 fallback。

## 9. Manual candidate collection

`coursekeeper_branch` 支持：

```text
evaluate
start
register
select
apply
abort
status
```

### `evaluate`

只计算 trigger / contamination / calibrated probability。

### `start`

允许手工启动；仍受 `maxBranchWavesPerEpisode`。

如果没有 provider，可使用 `checkpointKind=none` 收集 external candidate evidence。

### `register`

最多：

```yaml
branchMaxCandidates
```

个 candidate。

超额注册直接拒绝。

### `select`

执行 deterministic prefilter + comparative selection。

### `apply`

有 provider：调用 provider apply。

无 provider：alternate winner 必须先由外部真正应用，再传：

```json
{"action":"apply","confirmed_applied":true}
```

随后 Coursekeeper reopening debt。

### `abort`

状态转 `blocked`，并尝试 dispose 所有临时 fork。

## 10. Branch wave 状态机

```text
idle
  |
  v
collecting
  |
  +--------> comparing
  |              |
  |              +---- tie/low margin ----> collecting
  |              |
  |              +---- winner ------------> selected
  |              |                              |
  |              |                              v
  |              |                           applied
  |              |
  |              +---- reject/budget ------> no-valid-candidate
  |
  +---- abort/apply failure ---------------> blocked
```

`collecting/comparing/selected` 都是 completion-sensitive 状态：

- collecting/comparing：branch wave 尚未结束；
- selected：winner 还未应用；
- applied：由 reopened Acceptance/Verification/Semantic debt 继续阻塞，直到真实验证完成。

## 11. Completion invariants

必须始终满足：

```text
selection != apply
apply != verification
branch verification != main-workspace verification
```

Coursekeeper 的 finish guard 最终只接受 main workspace 的当前 revision。

## 12. Candidate cleanup

自动 candidate 含 `workspaceRef` 时：

```text
duplicate           -> dispose
select current       -> dispose all alternates
select alternate     -> apply -> dispose all forks
NO_VALID_CANDIDATE   -> dispose all forks
abort                -> dispose all forks
```

`dispose` 错误只记 ledger，不改变 main workspace correctness state。

## 13. Branch experience schema

核心字段：

```text
schemaVersion=1
id / at
CalibrationDomain
GeneratorProtocolDescriptor
VerifierProtocolDescriptor
TaskSignature
triggers
contamination
candidateCount
selectedOrigin
selectedDifferentFromCurrent
finalReverifyPassed
useful
externalFailure
incrementalCost
```

经验不存：

```text
raw objective
Generator CoT
source files
full candidate output
patch body
```

它只保留 task signature 和行为结果。

## 14. Calibration domain

v0.8 route/branch experience domain 包含：

```text
providerFamily
modelFamily
modelRevision
augmentationProfile
harnessVersion
policySchemaVersion
protocolFingerprint
rolloutMode
```

默认：

```yaml
crossProtocolWeight: 0
crossRolloutWeight: 0.25
crossModelWeight: 0
```

因此 protocol 改变时不会直接继承旧分支结论。

## 15. Failure semantics

### Provider missing

```text
suggest only
```

### checkpoint unavailable

```text
suggest only
```

### candidate executor exception

```text
candidate not registered
ledger records error
```

### verifier exception/unparseable

```text
comparison yields no result
never treated as positive evidence
```

### apply failure

```text
wave=blocked
phase=blocked
recoveryBlocker set
```

### no confident winner at budget

```text
NO_VALID_CANDIDATE
phase=recover
```

### process restart during active wave

```text
wave not resumed
main workspace remains source of truth
external fork lifecycle is provider responsibility
```

## 16. 安全实现建议

第一版 WorkspaceForkProvider 推荐：

```text
Git worktree / container snapshot / copy-on-write sandbox
```

并优先支持：

```text
pre-mutation checkpoint
restart from deterministic baseline
```

不要一开始支持任意 mid-command shell state clone。环境变量、后台进程、数据库和外部服务状态很难仅靠 filesystem snapshot 正确复制。
