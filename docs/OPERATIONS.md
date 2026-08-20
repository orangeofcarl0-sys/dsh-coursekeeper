# 运维、上线与调参

## 1. 推荐上线阶段

### 阶段 A：兼容性观察

```yaml
mode: shadow
adaptiveRouting: off
```

确认插件能读取事件、状态不串 session、日志路径正常。

### 阶段 B：确定性控制 + 自适应 shadow

```yaml
mode: active
adaptiveRouting: shadow
adaptiveEscalation: calibrated
safeExplorationRate: 0
```

这是推荐日常起点。

### 阶段 C：有界 active

确认常见任务已有有效支持后：

```yaml
adaptiveRouting: active
maxAdaptiveAdjustment: 0.10   # 初期可比默认 0.15 更保守
safeExplorationRate: 0
```

稳定后再考虑恢复 `0.15`。

## 2. 不建议同时改变的变量

不要一次同时开启：

```text
hybrid-assist
adaptiveReasoning=phase
adaptiveRouting=active
safeExplorationRate>0
```

否则质量、token、cache、reroute 的变化无法归因。

## 3. 查看经验是否开始有效

主要看：

```text
effectiveSupport
baseRoute vs adaptiveRoute
routeTransitions
FAIL_ROUTE / recoveries
memoryAdjustment
bayesian effectiveN
```

条目数不是 support。相似度、时间、模型/profile domain 都会降权。

## 4. 模型升级

同一 model family 换 checkpoint：更新 `modelRevision`。

更换 model/provider family：默认 `crossModelWeight=0` 已隔离旧经验；无需删除经验文件。

模型行为明显变化但名字没变时，也应手动改变 `modelRevision`，避免新旧分布混在一起。

## 5. Harness / Policy 升级

建议显式设置 `harnessVersion`。Coursekeeper 大版本修改 TaskSignature、route scoring 或 attribution 逻辑时，应提升内部 `policySchemaVersion`；旧经验按 `stalePolicyWeight` 降权。

## 6. 日志与经验备份

默认：

```text
~/.dsh/coursekeeper/decisions.jsonl
~/.dsh/coursekeeper/experiences-v1.jsonl
```

在升级或做大规模实验前备份。不要把这两个文件直接提交到公共 Git 仓库。

## 7. 清空自适应但保留 Governor

停止 DSH 后备份并删除 experience 文件，然后：

```yaml
adaptiveRouting: shadow
```

下一次会从 zero-history deterministic prior 开始。Debt/Verifier/Route Contract 逻辑不依赖历史经验。

## 8. Cache 优先配置

```yaml
augmentationProfile: governor
capabilityControl: guard
adaptiveReasoning: off
adaptiveRouting: shadow   # 本地计算，不增加模型 token
routeChallenger: off      # 若极端追求成本
semanticVerifier: risk
```

最大的额外模型成本通常来自 semantic verifier / challenger，而不是 Experience Memory。

## 9. 质量优先配置

适合高价值复杂任务：

```yaml
capabilityControl: guard
adaptiveRouting: active
adaptiveEscalation: calibrated
routeChallenger: risk
semanticVerifier: risk
safeExplorationRate: 0
```

是否开启 `jspace-assist` 应通过自己的 A/B 决定，不应默认认为一定提升。

## 10. 性能优化任务

显式开启：

```yaml
benchmarkRequired: true
benchmarkToolNames: [run_benchmark]
```

确保工具输出结构化、包含 benchmark identity、query count、recall、qps，以及影响可比性的 concurrency/warmup 等条件。

## Verified Branching 运维

### 默认成本

`rolloutMode=single` 时：

```text
branch candidate calls = 0
comparative verifier calls = 0
workspace fork calls = 0
```

### 建议观察

```text
branch trigger rate
runtimeAvailable
candidate count / wave
comparative verifier calls
NO_VALID_CANDIDATE rate
selected-alternate rate
final reverify pass rate
branch experience entries
```

### 临时 workspace 清理

Provider 应把 `dispose()` 设计成幂等，并对进程异常退出准备自己的 TTL/垃圾回收。Coursekeeper 会在正常 winner/no-valid/abort/duplicate 路径调用 dispose，但无法保证进程被强杀后执行清理回调。

### 成本上限

推荐保持：

```yaml
branchInitialCandidates: 2
branchMaxCandidates: 3
maxBranchWavesPerEpisode: 1
maxComparativeVerifierCalls: 8
```

先提高 selection quality，再考虑提高 N。不要用更大的 Best-of-N 掩盖 Generator protocol 本身的问题。
