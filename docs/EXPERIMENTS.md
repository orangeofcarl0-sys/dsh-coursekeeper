# 实验设计

Coursekeeper 的实验重点不是语言 fingerprint，而是“质量 / 恢复能力 / 真实额外成本”。

## 1. 核心指标

至少记录：

```text
最终任务质量 Q
成功/blocked 比例
FAIL_ROUTE rate
首次错误假设后的 recovery rate
route switch 次数
reroute 前浪费的 steps/tool calls
reasoning tokens
uncached input tokens
cached input tokens
Semantic Verifier calls
Route Challenger calls
false blocker rate
```

不要只看总 token；一个稍贵但能显著减少错误提交的 verifier 可能仍然值得。

## 2. v0.7 上线实验

### A. deterministic baseline

```yaml
adaptiveRouting: off
adaptiveEscalation: rules
```

### B. adaptive shadow

```yaml
adaptiveRouting: shadow
adaptiveEscalation: calibrated
```

实际仍走 base route，记录 adaptive suggestion。

### C. bounded active

```yaml
adaptiveRouting: active
maxAdaptiveAdjustment: 0.10
safeExplorationRate: 0
```

### D. normal v0.7

在个人数据足够后再回到默认 `0.15`。

## 3. 最重要的 adversarial split

把任务分成：

```text
first hypothesis correct
first hypothesis deliberately plausible-but-wrong
```

理想结果必须同时满足：

```text
H0 正确时 branch churn ↓ / completion ↑
H0 错误时 falsifier/PATCH/FAIL_ROUTE recovery 不下降
```

只提高“正确首猜下的坚持力”而降低错误恢复，不算成功。

## 4. Optional Mode Factorial

固定 model/provider，比较：

```text
governor
jspace-assist
router-assist
hybrid-assist
```

每种 profile 的 Experience Memory 域不同。做统计比较时可使用相同任务集，但不要直接复用一个 profile 的 active calibration 当作另一个 profile 的先验。

## 5. Cache 实验

分别测：

```text
request count
input tokens
cached input tokens
uncached input tokens
system/tool schema hash 变化
verifier/challenger 次数
```

推荐对比：

```text
guard vs restrict
governor vs router-assist
off vs episode vs phase adaptiveReasoning
```

## 6. 自适应有效性

不要用“adaptiveRoute 与人工标签一致率”作为唯一指标。更有意义的是：

```text
FAIL_ROUTE 是否下降
错误 route 是否更早恢复
reroute regret 是否下降
active 相比 shadow 是否提高质量/成本比
```

## 7. 归因纪律

Provider 400、权限错误、工具缺失、用户中断不能训练 route。`PATCH` 不是 route failure。`EXPLORE → PLAN (converged)` 是正常收敛，不应计为 EXPLORE 失败。

如果这些信号没有分开，个人小数据会很快学偏。

## Protocol Fidelity A/B（v0.7.1）

新增 `native-canonical` 后，优先验证协议变量，再评估更高层路由增益。

建议最小矩阵：

1. `governor` baseline；
2. `native-canonical`；
3. exact persona only；
4. exact persona + bash first；
5. exact persona + bash -> read；
6. retained CoT on/off；
7. native tool-result vs pseudo-user observation。

`native-canonical` 本身只覆盖第 2 组的可控部分。其余拆变量需要实验 harness 提供对应开关。

每个结果必须同时保存 protocol fingerprint / tool order / reasoning retention observation；否则不要把差异直接归因于 Router 或 Coursekeeper。
