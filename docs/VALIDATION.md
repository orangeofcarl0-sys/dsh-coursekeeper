# 验证与发布边界

## 1. 本地能够证明什么

`npm run check` 主要验证：

```text
TypeScript 编译
TaskContract / deterministic routing
Route Contract / hysteresis / falsifier
Acceptance 与 Verification Debt
artifact revision / scoped verification
state replay
Semantic Verifier 状态转换
J-Space / Router Assist profile
TaskSignature / SimHash
ExperienceStore 读写/损坏行/并发加载
case memory / domain isolation / age decay
Bayesian calibration
bounded adjustment / support gate
adaptive escalation
challenger parsing / 调用边界
zero-history v0.6 compatibility invariants
```

本地测试证明实现符合控制协议，不证明模型任务质量必然提高。

## 2. 真实 DSH/provider 必测矩阵

至少验证：

```text
1. governor + adaptiveRouting=shadow 首请求正常
2. 当前用户消息在第一次 assembly 前被捕获
3. guard 下工具 schema 稳定，非法 mutation 被执行时拒绝
4. PLAN/EXPLORE broad mutation 前必须 explicit commit
5. falsifier 命中后立即允许 reroute
6. 局部 readback/test 只清相关 debt
7. Semantic Verifier PASS/PATCH/FAIL_ROUTE 行为正确
8. experience JSONL 不含原始 objective
9. 相似任务产生 shadow adaptive suggestion
10. crossModelWeight=0 时换模型个人影响归零
11. 四种 augmentationProfile 都受同一 completion gate
12. 历史 trajectory_control session 可 replay
```

## 3. 需要额外测的 provider 差异

不同 provider 对以下字段/行为可能不同：

```text
reasoning effort 名称与默认值
cache key / cached token 统计
tool-call error 传播
请求最大上下文
JSON 输出稳定性
```

因此 `adaptiveReasoning` 和 Semantic Verifier 模型选择不能只依赖本地 mock 测试。

## 4. 性能/质量声明边界

以下说法需要真实 A/B，不应仅凭单元测试写入 README：

```text
任务准确率提升 X%
平均 token 降低 X%
cache hit 提升 X%
J-Space/Router Assist 一定提高能力
自适应路由优于确定性路由
```

本项目当前能够严谨声称的是：这些机制已经实现、被测试、具备可观测状态和可做 A/B 的边界。

## 5. 发布前检查

```bash
npm run check
npm pack
```

然后从 tarball 反向解包，至少 smoke test：

```text
package identity
主要 export
default deterministic route
coursekeeper_control
adaptive module
legacy trajectory_control replay
```

并检查 npm 包中包含 `lib/ docs/ cordis.patch.yml README CHANGELOG LICENSE`。

## Native Canonical live validation

本地结构测试不能证明真实 DeepSeek provider 的 serialized prompt。真实 DSH 环境至少检查：

1. system 最终前缀是否确实以 exact persona 起始；
2. `tools[0:2]` 是否为 `bash, read`；
3. 多轮 tool-use 后 request 是否保留 reasoning blocks；
4. observation 是否保持 tool-result + call linkage；
5. route/phase 改变时 tool surface hash 是否稳定；
6. 正常步骤是否没有 Coursekeeper plugin-user message；
7. blocker/verification 事件发生时才出现 event-driven steering。

只有完成这些检查以后，Terminal-Bench A/B 才能解释为 protocol-fidelity 实验。
