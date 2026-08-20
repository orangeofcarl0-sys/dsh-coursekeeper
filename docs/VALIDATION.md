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
zero-history v0.6/v0.7 compatibility invariants
Verified Branching trigger/contamination/dedup/prefilter
fresh-context comparative verifier prompt contract
NO_VALID_CANDIDATE / selection gate
winner apply 后 debt reopening
BranchExperience protocol isolation / attribution
branch evidence bounding / pivot-tournament helpers
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
13. rolloutMode=single 与 v0.7.1 行为一致，无 candidate/verifier 调用
14. verified-branching 无 WorkspaceForkProvider 时只 suggestion，不修改 main workspace
15. provider fork 的两个 candidate 确实来自同一 checkpoint 且 filesystem 隔离
16. fresh candidate 不继承 Generator hidden CoT
17. deterministic fail candidate 在 LLM verifier 前被过滤
18. Bo2 margin 不足时只扩到 Bo3；N>=4 时 pivot tournament 调用数符合预算
19. alternate winner apply 后 main workspace acceptance/verification debt 重新打开
20. branch 内 pass 不能替代 main-workspace reverify
21. NO_VALID_CANDIDATE 时 finish 被 recovery blocker 拦截
22. branch-experiences-v1.jsonl 不含 raw objective/CoT/patch body
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


## 6. Verified Branching 特有验证边界

本地 65 项测试可以证明 branching **控制协议**，不能证明真实 DSH 已经具有任意 workspace fork。v0.8 源码要求外部 `WorkspaceForkProvider`。真实 E2E 必须另外证明：

```text
checkpoint 是稳定基线
fork 之间互不写入
executor 真的是 fresh context
apply 只合并 winner
dispose 不影响 main workspace
provider 崩溃后 main workspace 仍一致
```

如果这些条件没有验证，不能把 `verified-branching` 的自动 workspace 模式标成 production-ready。

Comparative Verifier 本地测试只证明 prompt 不主动包含 Generator CoT，并证明 parser/selection gate。same-model verifier 的实际 selection accuracy、logprob backend 增益和 Terminal-Bench Selected@N 必须用真实 provider 测量。

## 7. Branching A/B 最低报告项

每个 run 至少记录：

```text
Generator protocol fingerprint
Verifier protocol profile/scoring
Pass@1
Oracle@N
Selected@N
branch trigger rate
branch candidate count
NO_VALID_CANDIDATE rate
selected-alternate rate
final main-workspace reverify pass rate
comparative verifier calls
uncached input / cached input / reasoning tokens
```

只有 `Selected@N` 提高但 final reverify 不提高时，不能声称真实任务质量提升。
