# 故障排查

## 插件安装后没有生效

先运行：

```bash
dsh --profile web --dump-config
```

确认 bundle 中存在 `coursekeeper`，且没有旧 `trajectory-governor` 同时运行。检查 `mode` 是否为 `off`。

## `coursekeeper_status` 不存在

检查：

```yaml
exposeStatusTool: true
```

如果插件本身未加载，先检查 bundle / peer dependency / DSH 版本，而不是只改 tool 配置。

## Agent 一直不能写文件

看 `coursekeeper_status.route` 与 `blockers`。常见原因：

```text
INSPECT 尚未观察 relevant evidence
PLAN/EXPLORE 尚未 explicit commit
当前处于 recovery
capabilityControl=restrict 且 mutation 工具仍被隐藏
```

推荐默认 `guard`，更容易从 tool error 看清被拦原因，也更稳定地保持 schema。

## PLAN/EXPLORE commit 被拒绝

必须同时提供：

```text
hypothesis
falsifier
next_evidence
```

并且 `max_evidence_actions >= min_evidence_actions`。

## 想换 route 但被 hysteresis 拒绝

正常情况。先完成 `minEvidenceActions`，或者提供真正的强原因：

```text
falsified
contradicted
verifier-fail
user-correction
budget-exhausted（且 budget 确实耗尽）
```

不要用 `manual` 绕过尚未完成的 commitment。

## Semantic Verifier 一直不运行

检查 deterministic blockers。默认 verifier 会推迟到 Acceptance / Verification / Benchmark 义务清理后。

如果只是调试，可 `force:true`；这不会清理原 blockers。

还要检查 `semanticVerifier != off` 和 provider/model 是否可解析。

## Semantic Verifier PASS 后又变 pending

如果 PASS 后出现新的正向 evidence 或 mutation，旧 semantic pass 会失效。这是预期行为：Verifier 证明的是当时的 Evidence Packet 和 workspace revision。

## adaptiveRoute 总是不应用

检查：

```text
adaptiveRouting 是否 active
effectiveSupport 是否 >= minEffectiveSupport
adaptive route 是否 eligible
margin / low-risk cheap-route policy
是否被 challenger 改写
```

Shadow 模式永远不会改变实际 route。

## 经验条目很多但 support 很低

Support 不是行数。以下都会降权：

```text
任务不相似
不同 model/provider
不同 augmentationProfile
modelRevision 不同
Harness/policy 版本不同
经验过旧
```

先看 `calibrationDomain` 与 TaskSignature，再调低 `memoryMinSimilarity`；不要第一反应把 `minEffectiveSupport` 降到接近 0。

## 经验文件有 invalidLines

Coursekeeper 会忽略无法解析或 schema 不匹配的行。若数量持续增加，检查是否有人手工编辑 JSONL、磁盘写入是否被截断，或是否混入其他格式文件。

## Experience Store failed

检查目录权限、磁盘空间、路径是否合法。Store 失败只关闭自适应经验写入，确定性 Governor 仍应工作。

## route 频繁 PLAN ↔ EXPLORE

先看 transition reason。`EXPLORE → PLAN (converged)` 是正常收敛；若反复 `PLAN → EXPLORE (uncertainty-discovered)`，说明任务 vector 或 hypothesis contract 可能没有真正降低机制不确定性。

提高 `minEvidenceActions` 不是第一选择；更应改善 falsifier / nextEvidence 的区分性。

## token 或 cache 明显变差

按顺序排查：

```text
routerAssist 是否开启
jspaceAssist 是否 legacy
adaptiveReasoning 是否 phase
automatic verifier/challenger 调用是否增加
capabilityControl 是否 restrict 导致 tool surface 变化
```

Experience Memory / Bayesian calibration 自身是本地计算，通常不是 token 增长来源。

## 完成被 false blocker 卡住

先看 blocker 属于哪一层：Acceptance、Verification、Benchmark、Semantic、Recovery。

如果是 Acceptance，确认工具事件是否能自动满足；语义性 obligation 可用 `accept` + 明确 evidence。若确实取消了要求，再使用 `waive`。不要 waive Verification Debt。
