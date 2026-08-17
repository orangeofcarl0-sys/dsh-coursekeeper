# 独立 Semantic Verifier

## 1. 使用范围

优先使用 deterministic oracle：test、build、lint、exact output、benchmark、readback。只有任务存在不能被这些证据完全覆盖的语义性 Acceptance 时，才需要 Semantic Verifier。

默认 `semanticVerifier: risk`。以下情况通常要求独立验证：

```text
risk = high
route = PLAN
route = EXPLORE
kind = research
```

`always` 对所有非 conversation Episode 要求 semantic pass；成本更高。`off` 完全关闭。

## 2. Evidence Packet

Verifier 读取的是结构化 Evidence Packet，不读取主模型完整 CoT：

```text
episodeId
objective
current RouteContract
open Acceptance
open Verification Debt
最近 ProgressEvent
workspace revision
benchmark blocker（如有）
recovery blocker（如有）
```

这样做是为了降低 anchoring 和 correlated self-reflection。

## 3. 调用顺序

默认顺序：

```text
先完成 deterministic Acceptance / Verification / Benchmark
→ 再调用 Semantic Verifier
→ PASS 后才允许最终完成
```

`coursekeeper_semantic_verify {force:true}` 可以绕过这个顺序，但只用于研究/调试；它不能清掉 deterministic debt。

## 4. 决策

### `pass`

当前 Evidence Packet 在当前 workspace revision 上通过。Semantic gate 清理。

### `warn`

当前 route 可继续，但还缺 evidence。Completion 继续阻塞。

### `patch`

只修正 working hypothesis：

```text
保持 route
更新 hypothesis
重置 evidenceActions / stallActions
可更新 nextEvidence
epistemic → plausible
```

`PATCH` 不是 route failure，也不会形成 route-level 负训练信号。

### `fail_route`

Verifier 判断当前证据获取方式本身不合适：

```text
epistemic → contradicted
route stall budget 置满
释放 reroute
形成强 route-level 负信号
```

只有这种情况才应影响路由校准。

### `unknown`

无法判断。Completion 不通过，需要更多证据或明确 blocker。

## 5. 输出格式

Verifier 要返回严格 JSON：

```json
{
  "decision": "pass",
  "failedObligations": [],
  "contradictions": [],
  "nextEvidence": [],
  "reason": "evidence covers the requested semantic acceptance"
}
```

`patch` 可额外返回：

```json
{
  "patchedHypothesis": "..."
}
```

无法解析的输出不能当作 PASS。

## 6. Provider 与模型

如果未配置 `semanticVerifierProvider` / `semanticVerifierModel`，默认跟随当前 Agent 的 provider/model。若希望更低相关错误，可以显式使用不同模型，但应把额外成本和 latency 计入评测。

## 7. 调用预算

默认：

```yaml
semanticVerifierMaxTokens: 1536
maxSemanticVerifierCalls: 2
```

Verifier 不是连续反思层。次数耗尽后应报告 blocker，而不是无限 judge loop。

## 8. Semantic Pass 何时失效

如果 PASS 后出现新的正向 evidence/progress 或 workspace mutation，使当前证据状态改变，Semantic Verification 会重新变成 pending。旧 pass 不能自动覆盖新 revision。
