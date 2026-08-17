# 配置参考

默认值来自 `src/index.ts` 与 `cordis.patch.yml`。未指定的路径以 `$DSH_HOME` 为基准，缺省通常是 `~/.dsh`。

## 1. 基础控制

| 字段 | 默认 | 说明 |
|---|---:|---|
| `mode` | `active` | `off` / `shadow` / `active`。控制整个插件是否干预。 |
| `capabilityControl` | `guard` | `advisory` / `guard` / `restrict`。推荐 `guard`。 |
| `adaptiveReasoning` | `off` | `off` / `episode` / `phase`。改变 provider reasoning effort，可能影响缓存形状。 |
| `maxDynamicHintChars` | `640` | 动态 `<ck>` control packet 最大字符数。 |
| `noInformationLimit` | `3` | 连续无进展达到阈值后触发 recovery / escalation。 |
| `autoVerify` | `true` | 自然结束有 blocker 时允许有限验证续步。 |
| `maxAutomaticContinuations` | `1` | 每 turn 自动验证续步上限。 |
| `stopRetryOnDeterministicErrors` | `true` | HTTP 400 / `invalid_request_error` 等确定性请求错误不进入普通 retry chain。 |

`mode: shadow` 表示 Coursekeeper 仍计算状态和记账，但不修改请求。它适合检查运行时兼容性。`adaptiveRouting: shadow` 则只限制自适应层，确定性 Governor 仍实际生效。

## 2. 可选增强面

| 字段 | 默认 | 说明 |
|---|---:|---|
| `augmentationProfile` | `governor` | `governor` / `jspace-assist` / `router-assist` / `hybrid-assist`。 |
| `jspaceAssist` | 由 profile 推导 | `off` / `lite` / `legacy`。显式配置优先于 profile。 |
| `routerAssist` | 由 profile 推导 | `off` / `minimal-first` / `task-aware`。显式配置优先。 |

Profile 是方便组合的 preset，不是独立控制器。Coursekeeper 始终拥有 route、commitment、falsifier 与 completion gate。

## 3. Semantic Verifier

| 字段 | 默认 | 说明 |
|---|---:|---|
| `semanticVerifier` | `risk` | `off` / `risk` / `always`。 |
| `semanticVerifierProvider` | 当前 provider | 可单独指定 verifier provider。 |
| `semanticVerifierModel` | 当前 model | 可单独指定 verifier model。 |
| `semanticVerifierMaxTokens` | `1536` | verifier 最大输出 token。 |
| `maxSemanticVerifierCalls` | `2` | 单 Episode verifier 调用上限。 |
| `exposeSemanticVerifierTool` | `true` | 是否暴露 `coursekeeper_semantic_verify`。 |

`risk` 模式在 high-risk、PLAN、EXPLORE、research 等情况下要求 semantic pass。Verifier 在确定性 Acceptance / Verification / Benchmark 义务之后运行；`force=true` 仅用于研究/调试。

## 4. 自适应路由

| 字段 | 默认 | 说明 |
|---|---:|---|
| `adaptiveRouting` | `shadow` | `off` / `shadow` / `active`。 |
| `adaptiveEscalation` | `calibrated` | `off` / `rules` / `calibrated`。 |
| `routeMarginThreshold` | `0.08` | top-2 fused score 差小于此值视为 ambiguous。 |
| `maxAdaptiveAdjustment` | `0.15` | 每条 route 相对 deterministic score 的最大总修正。 |
| `minEffectiveSupport` | `3` | 经验有效支持低于此值时 active 仍保留 base route。 |
| `safeExplorationRate` | `0` | 低风险、小 margin 时选择第二候选的概率；默认禁用。 |

`active` 不代表历史可以突破 safety eligibility。比如 high-risk / research / 高不确定任务中的 `DIRECT` 可以被判为 ineligible，记忆无法重新启用它。

## 5. Case Memory 与 Bayesian Calibration

| 字段 | 默认 | 说明 |
|---|---:|---|
| `experienceMemory` | `true` | 是否读写个人经验。 |
| `experiencePath` | `$DSH_HOME/coursekeeper/experiences-v1.jsonl` | 经验 JSONL。 |
| `experienceMaxEntries` | `5000` | 内存最多保留的经验条数；文件不会因该值自动截断。 |
| `memoryTopK` | `8` | 相似案例最大数量。 |
| `memoryMinSimilarity` | `0.60` | 低于该 TaskSignature 相似度的案例忽略。 |
| `experienceHalfLifeDays` | `90` | 时间权重半衰期。 |
| `bayesianCalibration` | `true` | 是否计算 bucket × route Beta posterior。 |
| `bayesianPriorStrength` | `6` | 先验强度；越大越不容易被小样本推动。 |
| `memoryWeight` | `0.10` | case memory 最大修正尺度。 |
| `bayesianWeight` | `0.10` | Bayesian 修正尺度。 |
| `crossProfileWeight` | `0.25` | 不同 augmentation profile 历史的权重。 |
| `crossModelWeight` | `0` | 不同 provider/model family 历史权重；默认完全隔离。 |
| `stalePolicyWeight` | `0.5` | policy schema 变化后的旧经验权重。 |
| `harnessVersion` | `dsh-0.1.x` | CalibrationDomain 中的 Harness 标记。建议实际部署显式设置。 |
| `modelRevision` | `unspecified` | 模型 revision 标记。模型升级时应更新。 |

`experienceMaxEntries` 只限制运行时内存窗口。若长期文件很大，应由运维侧归档/清理，而不是直接降低该值后期待磁盘文件自动缩小。

## 6. Route Challenger

| 字段 | 默认 | 说明 |
|---|---:|---|
| `routeChallenger` | `risk` | `off` / `risk`。 |
| `routeChallengerMinRisk` | `medium` | 只有达到该风险等级且 margin 小才考虑 challenger。 |
| `maxRouteChallengesPerEpisode` | `1` | 单 Episode 上限。 |

Challenger 只比较候选 route，不解决主任务。只有 `adaptiveRouting: active` 才可能实际调用。

## 7. 工具可见性

| 字段 | 默认 | 说明 |
|---|---:|---|
| `exposeStatusTool` | `true` | 注册 `coursekeeper_status`。 |
| `exposeControlTool` | `true` | 注册 `coursekeeper_control`。 |
| `exposeSemanticVerifierTool` | `true` | 注册 semantic verify tool；`semanticVerifier=off` 时不会注册。 |

生产环境如果不需要模型主动查看完整状态，可关闭 `exposeStatusTool`，减少一个固定 tool schema；这通常不是主要缓存成本。

## 8. 审计 Ledger

| 字段 | 默认 | 说明 |
|---|---:|---|
| `ledger` | `true` | 是否记录本地决策 JSONL。 |
| `ledgerPath` | `$DSH_HOME/coursekeeper/decisions.jsonl` | 自定义路径。 |
| `maxLedgerBytes` | `10485760` | 活动 ledger 达到约 10 MiB 前轮转。 |

Ledger 是审计/研究 sidecar，失败后会停写并暴露错误，但不应成为 Agent 执行状态的唯一来源。

## 9. Benchmark Gate

| 字段 | 默认 | 说明 |
|---|---:|---|
| `benchmarkRequired` | `false` | 是否强制当前 workspace revision 有完整 benchmark pass。 |
| `benchmarkToolNames` | `[run_benchmark]` | 识别为 benchmark 的工具名。 |
| `verificationToolNames` | `[build_project, run_correctness_test]` | 识别为常规 verify 的工具名。 |
| `finishToolNames` | `[finish]` | 需要 completion gate 的显式结束工具名。 |
| `fullBenchmarkMinQueries` | `10000` | 完整 benchmark 最小 query 数。 |
| `fullBenchmarkMinRecall` | `0.95` | 完整 benchmark 最小 recall。 |
| `benchmarkScoreTolerancePercent` | `2` | 同 spec QPS 下降不超过该比例视为噪声范围。 |
| `maxTrackedResults` | `256` | 每 Agent 保留的结果 fingerprint / benchmark 记录上限。 |

Benchmark 只比较相同 specKey；不能用不同 query count、concurrency、warmup 的结果直接宣称性能提升。

## 10. 推荐配置

稳定基线：

```yaml
augmentationProfile: governor
capabilityControl: guard
adaptiveReasoning: off
adaptiveRouting: shadow
adaptiveEscalation: calibrated
semanticVerifier: risk
safeExplorationRate: 0
crossModelWeight: 0
```

研究 J-Space 增益时只改：

```yaml
augmentationProfile: jspace-assist
```

研究 Router interface shaping 时只改：

```yaml
augmentationProfile: router-assist
```

不要一次改变多个变量再比较结果。

## `augmentationProfile: native-canonical`（v0.7.1 experimental）

该 profile 用于协议保真 A/B。启用时强制：

```text
jspaceAssist=off
routerAssist=off
adaptiveReasoning=off
```

并在 system assembly 中固定 exact persona 与候选 `bash -> read` 工具前缀。其余路由、debt、Verifier、自适应经验逻辑继续工作。完整行为见 [NATIVE_CANONICAL_MODE.md](NATIVE_CANONICAL_MODE.md)。
