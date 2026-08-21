# 实现对照

## 1. 组件与源码

| 能力 | 主要实现 |
|---|---|
| TaskContract / TaskVector | `src/core.ts` |
| Deterministic Route | `src/core.ts` |
| RouteContract / hysteresis / falsifier | `src/core.ts`, `src/state.ts` |
| Acceptance Debt | `src/core.ts`, `src/state.ts` |
| Artifact-scoped Verification Debt | `src/debt.ts`, `src/state.ts` |
| Dependency invalidation | `src/debt.ts` |
| Benchmark Gate | `src/core.ts`, `src/state.ts` |
| Completion Gate | `src/state.ts`, `src/index.ts` |
| Semantic Verifier | `src/verifier.ts`, `src/index.ts` |
| J-Space / Router Assist | `src/profiles.ts` |
| Durable state replay | `src/state.ts` |
| TaskSignature / SimHash | `src/adaptive/signature.ts` |
| Similarity / domain / decay | `src/adaptive/similarity.ts` |
| Experience JSONL | `src/adaptive/store.ts` |
| Route signal attribution | `src/adaptive/experience.ts` |
| Bayesian calibration | `src/adaptive/calibration.ts` |
| Case memory + bounded fusion | `src/adaptive/policy.ts` |
| Adaptive escalation | `src/adaptive/escalation.ts` |
| Route Challenger | `src/adaptive/challenger.ts`, `src/index.ts` |
| Runtime hooks / tools / guard | `src/index.ts` |
| Decision ledger | `src/ledger.ts` |

## 2. 关键不变量

实现和测试应持续保证：

```text
zero history → deterministic v0.6 behavior
insufficient support → base route
adaptive memory cannot enable ineligible route
cross-model influence defaults to zero
external failure does not train route
PATCH does not penalize route
falsifier / FAIL_ROUTE releases commitment
safe exploration defaults to zero
challenger is bounded
completion gate remains authoritative after adaptation
```

## 3. 测试目录

```text
tests/core.test.mjs
tests/state.test.mjs
tests/verifier.test.mjs
tests/profiles.test.mjs
tests/adaptive.test.mjs
tests/branching.test.mjs
```

当前 v0.8 发布基线累计 74 项测试。新增功能应优先增加控制不变量测试，而不是只测试字符串输出。

## 4. 当前非目标

```text
不训练 neural router
不上传 cloud telemetry
不保存 raw objective / CoT 到 Experience Memory
不提供真实权限安全边界
不自动恢复/rollback 用户 workspace
不把 Beta posterior 当作因果真值
不声称本地测试证明任务质量提升
```

# v0.8.0 实现增量：Verified Branching

## 新模块

```text
src/branching.ts
src/branching-store.ts
tests/branching.test.mjs
```

`branching.ts` 提供 trigger、contamination、candidate evidence/fingerprint、deterministic prefilter、fresh comparative verifier contract、pair selection、pivot tournament primitives 与 BranchExperience attribution。

`branching-store.ts` 是 append-only JSONL store，采用与 route ExperienceStore 相同的“历史加载与第一条 live append 竞争不丢数据”原则。

## Runtime 集成

`src/index.ts` 新增：

```text
rolloutMode
branch config/schema
branch experience store
branch trigger evaluation
WorkspaceForkProvider resolution
candidate generation
comparative verifier
progressive selection
winner apply
branch tool/status
branch lifecycle cleanup
```

## State 集成

`EpisodeState.branching` 管理 wave 状态。`completionBlockers` 对 collecting/comparing/selected 分支显式阻塞。Alternate apply 使用 `reopenAfterBranchApply` 重新建立 main-workspace completion debt。

## 兼容性

默认：

```text
rolloutMode=single
```

因此 v0.8 的 branching runtime 不会被调用。原 51 项测试全部保留，并新增 16 项 branching/control 与回归 test，目前本地合计 74 项通过。

## 未伪造的能力

当前 Coursekeeper 包没有内置通用 filesystem/container snapshot 实现。它定义并消费 `WorkspaceForkProvider`，但不会把普通 DSH tool calls 冒充隔离 workspace。真实 automatic branching 的 E2E 需要宿主安装 provider。
