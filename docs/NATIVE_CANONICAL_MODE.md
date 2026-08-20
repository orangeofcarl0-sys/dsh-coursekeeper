# Native Canonical 实验模式

`native-canonical` 是 Coursekeeper v0.7.1 新增的协议保真实验模式。

它不替代 `governor`，也不宣称当前假设已经被 Terminal-Bench 证明。它的用途是隔离测试以下候选变量：

1. exact persona 是否是 DeepSeek code-agent 的 prefix anchor；
2. `bash -> read` 是否是更接近训练分布的工具前缀；
3. 稳定工具拓扑是否优于按阶段增删/重排工具；
4. retained reasoning 与 native tool-result linkage 是否在真实 DSH 请求中存在；
5. Coursekeeper 可见控制消息是否会污染 Agent episode。

## 启用

```yaml
augmentationProfile: native-canonical
capabilityControl: guard
adaptiveReasoning: off
```

建议其他自适应功能先保持现有默认值。第一次测试时尤其建议：

```yaml
adaptiveRouting: shadow
safeExplorationRate: 0
```

这样实验主要测协议面，而不是同时改变路由行为。

## 模式实际做什么

### 1. 固定 exact persona

模式将 persona section 替换为：

```text
You are a helpful software engineer assistant.
```

字符串由代码常量固定，不做同义改写。

Coursekeeper 将该 section 放到 assembled section 列表第一项，并给它最小 `order`。这保证的是 **DSH assembly 结构**；provider 最终 token stream 是否仍有额外前置内容，需要结合真实 provider 编码验证。

### 2. 固定候选工具前缀

若工具存在，按以下前缀排列：

```text
bash
read
```

其余非 Coursekeeper 工具保持原相对顺序。Coursekeeper 自己的辅助工具移到尾部。

模式不会：

- 创建不存在的 `bash` 或 `read`；
- 改写工具名字；
- 改写 schema；
- 因 route 动态删掉业务工具。

如果 `bash` 或 `read` 不存在，只记录 deviation，不伪造 canonical match。

### 3. 正常步骤不注入 Coursekeeper policy message

`agent/pre-step` 中的常规 `<ck>` / kernel policy 在此模式下被抑制。

因此正常成功 Episode 的目标是：

```text
real user task
-> native reasoning
-> tool call
-> tool result
-> native reasoning
```

Coursekeeper 仍保留不可见的：

- mutation guard；
- route state；
- acceptance / verification debt；
- finish veto；
- adaptive experience；
- semantic verifier。

出现 verification blocker、最终 blocker-report 等事件时，仍允许 event-driven steering。这是有意保留的纠错路径。

### 4. 强制关闭两类会改变 canonical surface 的增强

在 `native-canonical` 下：

```text
jspaceAssist = off
routerAssist = off
adaptiveReasoning = off
```

即使配置里同时给出其他值，resolved profile 仍以 protocol-fidelity 实验为优先。

## Protocol Fidelity 观测

该模式在 assembly/request 阶段记录：

- `personaExact`
- `personaFirst`
- `toolPrefix`
- `toolPrefixMatch`
- `auxiliaryToolsAtEnd`
- `toolSurfaceHash`
- `stable`
- `reasoningBlocks`
- `toolResultBlocks`
- `linkedToolResults`
- `pluginUserMessages`
- `reasoningRetention`
- `nativeObservationSemantics`

如果显式打开 `exposeStatusTool`，这些字段出现在：

```text
coursekeeper_status.protocolFidelity
```

默认情况下，`native-canonical` 不主动暴露 Coursekeeper 的三个辅助工具；如果外层 bundle 显式配置为 `true`，它们仍可出现，但会被排到工具列表尾部。

### 重要边界

`reasoningRetention=observed` 只表示 **DSH 即将发送的 request messages 中同时观察到了历史 reasoning block 与 tool-result block**。

它不等价于证明 provider 最终 serialized token stream 完全符合 DeepSeek 官方模板。

同理，`nativeObservationSemantics=observed` 表示观察到了带 call linkage 的结构化 tool-result；它不是对 provider 内部 encoder 的逆向证明。

## 为什么不直接改默认 governor

当前机制假设仍需实测区分：

- attention sink / position effect；
- exact training scaffold prior；
- tool-order / schema primacy；
- retained CoT；
- native observation grammar；
- 它们之间的 interaction。

因此 `native-canonical` 是独立实验组，不改变默认 `governor`。

## 推荐 A/B

第一阶段只做协议差异：

| 组 | Profile | Persona | Tool prefix | 普通 CK message |
|---|---|---|---|---|
| A | governor | official/default | original | 有需要时可见 |
| B | native-canonical | exact | bash -> read | 抑制 |

随后拆变量：

1. exact persona，保持原工具顺序；
2. exact persona + bash first；
3. exact persona + bash -> read；
4. 上述条件 + retained CoT on/off；
5. native tool-result vs pseudo-user observation。

不要一开始只比较最终分数。至少同时记录：

- success / task quality；
- first useful action；
- route switches；
- failed/repeated calls；
- recovery latency；
- reasoning tokens；
- cached input tokens；
- protocol deviations。

## 已实现的本地测试

纯结构测试覆盖：

- exact persona 替换；
- persona 第一项；
- `bash -> read` 排序；
- 不删除、不改写工具对象；
- Coursekeeper auxiliary tools 后置；
- 缺少 `bash` 时只报告 deviation；
- retained reasoning / linked tool-result 的 request 结构观测。

这些测试证明实现符合模式定义，不证明 Terminal-Bench 分数提升。

## v0.8 与 Verified Branching 组合

`native-canonical` 只定义 Generator protocol；v0.8 的 `rolloutMode` 是独立维度。

推荐：

```yaml
augmentationProfile: native-canonical
rolloutMode: verified-branching
```

所有 branch candidate 应保持同一个 native-canonical Generator protocol。Comparative Verifier 不使用该 persona/tool topology，而使用 fresh evidence-evaluator protocol。这样可以分别测 Generator protocol fidelity 与 rollout selection。
