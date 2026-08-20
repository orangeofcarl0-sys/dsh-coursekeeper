# 迁移：dsh-trajectory-governor v0.6 → DSH Coursekeeper v0.7

## 1. 包与插件名

旧：

```text
@chunsi-m/dsh-trajectory-governor
plugin id: trajectory-governor
```

新：

```text
@chunsi-m/dsh-coursekeeper
plugin id: coursekeeper
```

升级时先移除旧 bundle entry，避免两个控制平面同时运行。

## 2. 工具名

新 canonical tools：

```text
coursekeeper_control
coursekeeper_status
coursekeeper_semantic_verify
```

源码保留 deprecated `TRAJECTORY_*` constant alias；state replay 也识别历史 `trajectory_control` 和旧 kernel source marker。

不要在新 Agent prompt 中继续主动使用旧工具名；兼容层主要用于历史 durable event。

## 3. 本地路径

v0.7 默认：

```text
$DSH_HOME/coursekeeper/decisions.jsonl
$DSH_HOME/coursekeeper/experiences-v1.jsonl
```

旧 v0.6 ledger 不自动转换为 Experience Memory，因为它缺少 v0.7 TaskSignature、CalibrationDomain 和 route attribution schema。可以保留为历史审计数据。

## 4. 行为变化

v0.7 cold-start 仍保留确定性 route。默认 `adaptiveRouting=shadow`，所以升级后个人经验不会立刻改变实际 route。

新增的主要行为：

```text
TaskSignature / personal case memory
Bayesian calibration
bounded route adjustment
adaptive escalation
risk-gated Route Challenger
```

## 5. Optional Modes

v0.6 的：

```text
governor
jspace-assist
router-assist
hybrid-assist
```

继续可用，并进入 CalibrationDomain。切 profile 后不要期待旧 profile 的个人经验以 100% 权重继承。

## 6. 推荐迁移步骤

```text
备份旧 ledger
移除旧 plugin entry
安装 Coursekeeper
先 mode=shadow 做一次 runtime 兼容检查
切 mode=active + adaptiveRouting=shadow
观察若干真实 Episode
再决定是否 adaptiveRouting=active
```

## 7. Repository URL

自 v0.7.1 起项目主页迁移至 `orangeofcarl0-sys/dsh-coursekeeper`，`package.json` 的 `repository/homepage/bugs` 已同步指向新仓库。旧仓库 `chunsi-w/dsh-trajectory-governor` 仅保留历史版本。

# v0.7.1 → v0.8.0

## 默认行为

v0.8 新增：

```yaml
rolloutMode: single
```

默认保持 `single`，因此安装 v0.8 不会自动创建额外 rollout、fork workspace 或 Comparative Verifier 调用。

## 新的正交配置维度

`augmentationProfile` 继续描述单 trajectory 的 Generator surface；`rolloutMode` 独立描述是否允许 Verified Branching。

旧配置：

```yaml
augmentationProfile: native-canonical
```

在 v0.8 中行为不变，等价于：

```yaml
augmentationProfile: native-canonical
rolloutMode: single
```

要实验 branching：

```yaml
augmentationProfile: native-canonical
rolloutMode: verified-branching
branchLearning: shadow
```

## 经验文件

新增：

```text
$DSH_HOME/coursekeeper/branch-experiences-v1.jsonl
```

旧 `experiences-v1.jsonl` 不会被转换成 branch experience。v0.8 route CalibrationDomain 增加 `protocolFingerprint` 与 `rolloutMode`，因此旧经验不会无条件 full-weight 迁移。

## Runtime provider

v0.8 不假设 DSH 本身提供 workspace fork。自动 branching 需要外部注册：

```text
ctx.coursekeeperBranching.workspace
ctx.coursekeeperBranching.executor
```

没有 provider 时插件仍可安全运行；branch trigger 只形成 suggestion。

## 新工具

只有 Verified Branching 默认暴露：

```text
coursekeeper_branch
```

`native-canonical` 会把该 auxiliary tool 放在 canonical业务工具之后，不改变 `bash -> read` 候选前缀。

## 回滚

从 v0.8 回滚 v0.7.1 时可保留 `branch-experiences-v1.jsonl`；旧版本不会读取它。删除/归档该文件只会清除 branch learning，不影响 route experience。
