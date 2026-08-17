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
```

当前发布基线累计 51 项测试。新增功能应优先增加控制不变量测试，而不是只测试字符串输出。

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
