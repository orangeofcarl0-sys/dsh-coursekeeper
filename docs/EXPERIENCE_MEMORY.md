# Experience Memory

## 1. 目的

Experience Memory 不是聊天记忆，也不是训练语料库。它只记录“这个结构化任务在这个模型/配置域里走了什么 route，结果如何”。

默认路径：

```text
$DSH_HOME/coursekeeper/experiences-v1.jsonl
```

一行一个 `RouteExperience`。

## 2. 不保存什么

默认不保存：

```text
原始 objective
完整用户 prompt
主模型 CoT
文件内容
Semantic Verifier 的隐藏推理
```

因此它不能还原用户任务全文。

## 3. TaskSignature

保存：

```text
kind / relation / risk
complexity / coupling / uncertainty / observability / novelty
artifactCountBin
continuity
deterministicOracle
objectiveHash
objectiveSimHash
workspaceHash
```

`SimHash` 只是 locality fingerprint，不是加密身份；它用于近似相似度。SHA-256 用于精确去重/审计指纹。

## 4. RouteExperience

核心字段：

```ts
RouteExperience {
  schemaVersion
  id
  at
  domain
  task
  initialRoute
  finalRoute
  transitions
  completion
  verifierDecision?
  obligations
  metrics
  routeSignals
  externalFailure
}
```

Metrics 包含 requests、steps、toolCalls、evidenceActions、verifierCalls、routeChallenges、reroutes、recoveries，并可记录 input/cached/reasoning tokens。

## 5. CalibrationDomain

经验只在合适环境下使用：

```text
providerFamily
modelFamily
modelRevision
augmentationProfile
harnessVersion
policySchemaVersion
```

默认跨模型权重为 0。切换 `governor` → `hybrid-assist` 后，旧经验仍可降权参考，但不会被视为相同条件。

## 6. 路由信号归因

只有可解释的事件进入 `routeSignals`。外部失败会标记 `externalFailure=true`，不用于 Bayesian route calibration。

特别注意：

```text
PATCH              hypothesis failure，不是 route failure
EXPLORE → PLAN     若 reason=converged，通常是正常收敛
FAIL_ROUTE         route-level 强负信号
user correction    不应机械当作模型 route 失败
```

## 7. 加载与损坏行

ExperienceStore 启动时逐行解析 JSONL。无法解析或 schema 不匹配的行计入 `invalidLines`，不会阻止其他有效经验加载。

加载可能与早期新 Episode 写入并发；实现会按 `id` 去重，并把历史行放在进程内新行之前，避免启动竞争导致当前经验丢失。

如果文件级读写失败，Experience Store 会记录 failure 并停用后续写入；Coursekeeper 主控制逻辑继续运行。

## 8. 内存上限与磁盘文件

`experienceMaxEntries` 只限制进程内保留的最近经验数。默认 `5000`。

它不会自动裁剪 JSONL 历史文件。长期运行建议：

```text
定期备份
按时间归档旧文件
在模型/策略大版本切换时保留旧文件但降低 domain 权重
```

不要在 Agent 正在写文件时手工截断。

## 9. 时间衰减

默认 90 天半衰期：

```text
ageWeight = 0.5 ^ (ageDays / 90)
```

这解决模型/Harness 的 non-stationarity。旧经验不是立即失效，而是逐步让位给新数据。

## 10. 清空经验

安全做法：先停止使用该 profile / 停止 DSH，备份文件，然后删除或改名：

```text
$DSH_HOME/coursekeeper/experiences-v1.jsonl
```

重新启动后自适应层从零历史开始；deterministic prior、Debt、Verifier 等核心能力不受影响。

## 11. 隐私边界

不保存原文不等于“完全匿名”。结构特征、hash、workspace fingerprint 仍可能构成本地可识别元数据。该文件应按本地开发日志处理，不应未经检查上传公共仓库。
