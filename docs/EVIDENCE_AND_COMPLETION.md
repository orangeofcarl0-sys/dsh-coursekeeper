# 证据、债务与完成门

## 1. 为什么要分三类完成义务

Coursekeeper 不把“做了动作”当成“完成任务”。完成由三类证据共同决定：

```text
Acceptance Debt     用户要求是否实现
Verification Debt   修改后的 artifact 是否被验证
Benchmark Gate      性能主张是否在可比条件下成立
```

再加可选 Semantic Verifier 和 Recovery blocker。

## 2. Acceptance Debt

不同任务会生成不同 obligation：

| Kind | 典型 obligation |
|---|---|
| `build` | 请求的 deliverable 存在且可用 |
| `fix` | 报告的 failure 已处理，或有证据证明无需修改 |
| `analysis/review/research` | 主要结论基于相关观察，覆盖请求范围 |
| `unknown` | 请求结果已产出或被明确交代 |

Artifact 已知时，build obligation 会绑定目标 artifact；未知时会生成泛化 deliverable obligation。

## 3. Verification Debt

已识别 mutation 会增加 artifact revision，并为该 revision 创建 debt。

常见规则：

```text
源代码修改 → readback + test/build/check
文档修改   → readback
未知 shell mutation → 可执行验证，不能伪造文件级 readback
```

Debt 绑定 artifact revision，而不是只看全局“曾经测试过”。后续对该 artifact 的修改会使旧 evidence stale。

## 4. Scoped Verification

VerificationEvidence 包含：

```text
kind
scope
sequence
workspaceRevision
artifactRevisions
summary
```

`scope` 可以是明确 artifact 列表或 `workspace`。局部 test 不应自动清偿所有不相关 artifact 的 debt。

如果测试命令无法可靠推断 scope，应保守处理；“一个 test 绿了，所以整个 workspace 都验证了”不是默认假设。

## 5. Dependency invalidation

ArtifactState 维护：

```text
revision
dependencies
dependents
```

目标是让证据失效尽量局部：修改 B 不应无条件使 A 的 readback 失效；但如果 A 明确依赖 B，相关验证仍可能需要刷新。

当前 dependency graph 是工程级启发式，不是完整编译器级依赖分析，因此关键发布任务仍应运行覆盖面足够的 workspace test/build。

## 6. Benchmark Gate

Benchmark 结果至少需要：

```text
benchmark identity
total_queries
recall
qps
```

可选：

```text
dataset
concurrency
warmup
hardware
```

只有满足 `fullBenchmarkMinQueries` 与 `fullBenchmarkMinRecall` 才是 full pass。

QPS 只与相同 `specKey` 的 best record 比较；不同 query count / concurrency / warmup 不混比。下降在 `benchmarkScoreTolerancePercent` 内可视为噪声范围，超出则当前 revision 不能完成。

每次相关 mutation 都会使当前 benchmark pass 对新 revision 失效。

## 7. Semantic Verification

Semantic Verifier 不替代 deterministic debt。它通常在这些义务清理后运行，用于回答：“语义上是否真的满足了任务？”

如果 verifier 已 PASS，但后来出现新的正权重 progress / mutation，使 Evidence Packet 发生实质变化，semantic pass 会重新变成 pending。

## 8. Finish Gate

`canFinish()` 等价于 `completionBlockers().length === 0`。

常见 blocker 文本：

```text
Acceptance obligation remains: ...
Verification debt remains for ...
Current workspace revision ... has no parseable full benchmark pass.
Independent semantic verification remains: pending.
No-information limit ...
PLAN route was never explicitly committed.
```

这些 blocker 是控制状态，不是给模型“参考一下”的建议。

## 9. 不应使用的绕过方式

不要用 `waive` 代替失败 test；不要用 semantic verifier `force=true` 把未完成的 deterministic obligation 变成 PASS；不要仅凭模型复述结果手动 `accept` 一个本应由 artifact/test 证明的 obligation。

## v0.8：Branch winner 不继承完成证明

Verified Branching 明确区分三层证据：

```text
candidate-local evidence   用于 candidate selection
selection verdict          用于决定哪个 candidate 值得 apply
main-workspace evidence    唯一可清最终 completion debt 的证据
```

Alternate winner apply 后：

```text
Acceptance obligations reopen
Verification Debt reopen
Benchmark currentRevisionPassed invalidated
Semantic Verification -> pending（若 required）
```

因此以下链条无效：

```text
branch candidate tests passed
-> comparative verifier chose it
-> finish
```

必须是：

```text
choose
-> apply to main workspace
-> readback/test/build/benchmark
-> semantic verify if required
-> finish
```

`collecting/comparing` branch wave 本身也是 completion blocker；`NO_VALID_CANDIDATE` 会建立 recovery blocker。
