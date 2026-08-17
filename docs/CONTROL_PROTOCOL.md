# 控制协议

## 1. Static Kernel

Coursekeeper 向模型提供一个短小、稳定的 kernel。它只定义四条不变量：

```text
保持当前可行 route，直到被证伪或 commitment 完成
不确定时去取证，不要无成本增殖分支
coherence 不是 evidence
完成前必须清理 acceptance / verification obligations
```

J-Space Assist 不取代这些规则，只附加 execution-persistence induction。

## 2. Dynamic `<ck>` Packet

动态 packet 只携带当前必要状态，并受 `maxDynamicHintChars` 限制。它可以包含：

```text
relation / kind / route / phase / risk
commit evidenceActions/min/max
epistemic
open acceptance count
open verification count
hypothesis H
falsifier K
next evidence N
```

它不是完整 scratchpad，也不保存模型推理。

## 3. `coursekeeper_control`

### commit

建立或更新 RouteContract。PLAN / EXPLORE 必须给出：

```json
{
  "action": "commit",
  "route": "explore",
  "hypothesis": "...",
  "falsifier": "...",
  "next_evidence": "...",
  "min_evidence_actions": 2,
  "max_evidence_actions": 5,
  "epistemic": "plausible"
}
```

如果切换了 route，会先检查 hysteresis。

### reroute

用于显式换 route。常见 `cause`：

```text
falsified
contradicted
verifier-fail
budget-exhausted
user-correction
```

普通 `manual` reroute 仍受最小 evidence budget 约束。

### falsify

```json
{
  "action": "falsify",
  "evidence": "the parser output already contains the expected field"
}
```

效果：

```text
epistemic = contradicted
route stall budget 置满
phase = recover
记录 hypothesis-falsified ProgressEvent
立即允许 reroute
```

### support

```json
{
  "action": "support",
  "evidence": "focused test reproduces the predicted failure"
}
```

把当前 hypothesis 标记为 `supported` 并记录证据。不要把“解释更顺了”作为 support。

### accept

显式清理 Acceptance obligation：

```json
{
  "action": "accept",
  "obligation_id": "fix:addressed",
  "evidence": "focused regression test now passes"
}
```

这是模型自报的显式 evidence，会被标记为 self-attested。优先使用工具事件自动满足义务；只有语义性 obligation 才需要显式 accept。

### waive

只有确实不能/不应满足某项 Acceptance 时使用：

```json
{
  "action": "waive",
  "obligation_id": "...",
  "reason": "user explicitly removed this requirement"
}
```

Waive 必须保留可审计原因，不应拿来绕过失败的 test/verification debt。

## 4. Route 切换规则

Coursekeeper 把 route 和 hypothesis 分开：

```text
hypothesis 错 → 优先 PATCH / 替换 hypothesis
route 错       → FAIL_ROUTE / reroute
```

这避免“猜错一个局部原因就推翻整个工作方式”。

## 5. Mutation Gate

默认 `capabilityControl=guard`。工具仍在 schema 中，但执行 mutation 前检查：

```text
DIRECT        通常允许直接 mutation
INSPECT       至少观察到 relevant evidence
PLAN/EXPLORE  必须 explicit commit，并满足对应前置条件
```

如果 gate 未打开，工具执行被拒绝并留下 ledger 事件。

`restrict` 会临时隐藏已知 mutation 工具，控制更强但更容易改变 tool surface；`advisory` 不硬拦截。

## 6. Completion Gate

显式 `finish` 与自然 stop 使用同一组 blockers：

```text
open Acceptance
open Verification Debt
benchmark blocker
semantic verification 未 PASS
recovery blocker
PLAN/EXPLORE 未 explicit commit
```

存在 blocker 时不会静默放行。`autoVerify=true` 时只追加有限续步；预算耗尽后要求明确报告 blocker。

## 7. Replay 兼容

v0.7 能识别新的 `coursekeeper_control` 事件，也兼容历史 `trajectory_control` durable events。动态 `<ck>` packet 也包含足以恢复 route、budget、epistemic、H/K/N 的紧凑状态。
