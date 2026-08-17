# DSH Coursekeeper v0.7.1

> DeepSeek Harness 的自校准闭环认知路线控制平面。原项目名：`dsh-trajectory-governor`。

Coursekeeper 不训练新的 Router，也不依赖大规模轨迹数据。它以确定性路由为 cold-start 基线，在模型外维护 Route Contract、Commitment、Evidence、Acceptance / Verification Debt 与 Verifier 状态，再从正常使用产生的可归因事件中做**有界的个人校准**。

一句话理解：

```text
选路 → 守路 → 取证 → 验证 → 必要时换路 → 记录经验 → 下次只修正边界
```

## 1. 它解决什么问题

普通 Agent 常见四类失败：

- 路线选得不合适：简单任务过度规划，复杂任务直接开改；
- 路线刚有一点不确定就切换，形成 branch churn；
- “改过了”“想通了”被误当成“验证过了”；
- 长期使用没有形成稳定个人偏好，或者需要昂贵的 learned router 才能适配。

Coursekeeper 对应地做四件事：

```text
Router        选择 DIRECT / INSPECT / PLAN / EXPLORE
Committer     用 evidence budget 实现 route hysteresis
Verifier      用债务、falsifier、benchmark 和独立语义验证控制完成/换路
Calibrator    用个人 Episode 经验小幅修正路由边界和升级阈值
```

它不是安全沙箱，也不替代 DSH 的 approval / sandbox / permission。

## 2. 默认行为

默认配置刻意保守：

```yaml
mode: active
augmentationProfile: governor
capabilityControl: guard
adaptiveReasoning: off
adaptiveRouting: shadow
adaptiveEscalation: calibrated
semanticVerifier: risk
safeExplorationRate: 0
```

这意味着：

- Coursekeeper 控制平面实际生效；
- J-Space / Router Assist 默认关闭；
- 工具 schema 尽量保持稳定，mutation 在执行时由 guard 拦截；
- 自适应路由只做 shadow 建议，不改变确定性 route；
- 个人经验会记录，但不会在数据不足时“训练坏”路由；
- 高风险、PLAN、EXPLORE、research 任务可要求独立 Semantic Verifier；
- 不进行随机探索。

## 3. 四条 Route

| Route | 适用情况 | 主要行为 |
|---|---|---|
| `DIRECT` | 信息充分、低风险、短任务 | 直接产出，再验证 |
| `INSPECT` | bug、review、continuation、已有 artifact | 先看当前状态，再修改 |
| `PLAN` | 高耦合、多模块、长跨度 | 明确接口/约束/计划，再广泛修改 |
| `EXPLORE` | 机制未知、高不确定、research | 建立可证伪假设，优先获取区分性证据 |

`PLAN` 与 `EXPLORE` 在广泛 mutation 前必须显式提交：`hypothesis + falsifier + next_evidence`。

## 4. 为什么 Commitment 不等于“多想”

Coursekeeper 不用更长 CoT 表示“自信”。Commitment 是路线切换的迟滞：

```text
没有 falsifier / verifier-fail / 用户纠正
且最小 evidence budget 未完成
→ 不允许因为普通犹豫随意换 route
```

一旦 falsifier 命中，则立即允许 reroute。这样保留 J-Space 式“敢走”的有效部分，同时避免把 execution confidence 误变成 epistemic certainty。

## 5. 完成条件

任务只有在所有完成阻塞项清零后才能结束：

```text
Acceptance Debt
+ Verification Debt
+ Benchmark blocker
+ Semantic Verifier requirement
+ Recovery blocker
+ 未完成的 PLAN/EXPLORE explicit commit
= 0
```

因此“测试通过”不等于“用户要求完成”，“改完了”也不等于“验证过了”。

## 6. 自校准路由

v0.7 不做离线训练。每个 Episode 结束时写入一条隐私最小化 `RouteExperience`：

```text
TaskSignature
CalibrationDomain
initial/final route
route transitions
completion/verifier outcome
steps/tool calls/verifier calls/reroutes
route-level attributable signals
```

不会写入原始 objective、主模型 CoT 或文件内容。

下一次任务的 route score 为：

```text
base score
+ similar-case adjustment
+ Bayesian adjustment
```

总修正受 `maxAdaptiveAdjustment` 限制，并受 route eligibility 约束。高风险任务不会因为个人历史偏爱 `DIRECT` 而被强行降级。

## 7. 可选 J-Space / Router 模式

前两个实验方向保留，但从属于 Coursekeeper：

| Profile | J-Space | Router Assist | 建议用途 |
|---|---|---|---|
| `governor` | off | off | 默认基线；缓存最稳定 |
| `jspace-assist` | lite | off | 测试额外 commitment induction |
| `router-assist` | off | minimal-first | 测试首轮 interface shaping |
| `hybrid-assist` | lite | minimal-first | 只用于有意识的实验 |

这些 profile 会进入 CalibrationDomain，经验不会被当作完全相同的数据。

## 8. 安装

要求：Node.js `^22.19.0 || >=24.0.0`；DSH peer range 为 `>=0.1.0-rc.5 <0.2.0`。

从源码目录：

```bash
npm run build
dsh plugin --profile web add .
dsh --profile web --dump-config
```

从 tarball：

```bash
dsh plugin --profile web add ./orangeofcarl0-sys-dsh-coursekeeper-0.7.1.tgz
dsh --profile web --dump-config
```

若包已发布到 npm，也可使用包名安装：

```bash
dsh plugin --profile web add @orangeofcarl0-sys/dsh-coursekeeper@0.7.1
```

## 9. 推荐上线顺序

第一阶段保持 `adaptiveRouting: shadow`。先观察 `coursekeeper_status` 中的 `baseRoute / adaptiveRoute / effectiveSupport / margin / routeTransitions`，确认 relation、route 与升级行为符合真实任务。

第二阶段只在积累了一批真实 Episode 后切到：

```yaml
adaptiveRouting: active
safeExplorationRate: 0
```

不要同时开启 `hybrid-assist + phase adaptive reasoning + safe exploration`。应逐项做 A/B，否则无法判断收益和缓存/推理成本来自哪里。

## 10. 模型可见工具

默认可注册：

```text
coursekeeper_control
coursekeeper_status
coursekeeper_semantic_verify
```

`coursekeeper_control` 用于 commit / reroute / falsify / support / accept / waive；`coursekeeper_status` 是只读诊断；`coursekeeper_semantic_verify` 在确定性义务清理后运行独立语义验证。

## 11. 本地数据

默认路径：

```text
$DSH_HOME/coursekeeper/decisions.jsonl
$DSH_HOME/coursekeeper/experiences-v1.jsonl
```

`decisions.jsonl` 是审计 sidecar；`experiences-v1.jsonl` 是自校准经验。两者都不是模型历史，也不替代 DSH Session Events。

## 12. 文档入口

建议先读：

- [快速开始](docs/QUICKSTART.md)
- [配置参考](docs/CONFIGURATION.md)
- [架构](docs/ARCHITECTURE.md)
- [控制协议](docs/CONTROL_PROTOCOL.md)
- [证据与完成门](docs/EVIDENCE_AND_COMPLETION.md)
- [自适应路由](docs/ADAPTIVE_ROUTING.md)
- [经验记忆](docs/EXPERIENCE_MEMORY.md)
- [可选 J-Space / Router 模式](docs/OPTIONAL_MODES.md)
- [独立 Semantic Verifier](docs/SEMANTIC_VERIFIER.md)
- [工具与状态字段](docs/TOOLS_AND_STATUS.md)
- [运维与调参](docs/OPERATIONS.md)
- [故障排查](docs/TROUBLESHOOTING.md)
- [实验设计](docs/EXPERIMENTS.md)
- [验证边界](docs/VALIDATION.md)
- [从 v0.6 迁移](docs/MIGRATION.md)
- [源码 API](docs/API_REFERENCE.md)

## 13. 当前验证状态

当前项目的本地发布基线通过 TypeScript 编译与 51 项控制逻辑测试，并对最终 npm tarball 做过反向解包 smoke test。它证明的是**控制逻辑和打包完整性**，不是 provider 侧任务质量提升。

真实 DSH/provider 环境仍应做 shadow → active 的 A/B 验证，尤其关注：route failure、wrong-first-hypothesis recovery、uncached input、额外 verifier/challenger 调用和 false blocker。


## Native Canonical 实验模式

`v0.7.1` 新增 `augmentationProfile: native-canonical`，用于隔离测试 DeepSeek Agent protocol fidelity：exact persona、候选 `bash -> read` 工具前缀、稳定工具面、retained reasoning 与 native tool-result linkage。该模式抑制正常 `pre-step` Coursekeeper 消息，但保留 guard、debt、finish veto 和 event-driven verification。详见 [docs/NATIVE_CANONICAL_MODE.md](docs/NATIVE_CANONICAL_MODE.md)。

