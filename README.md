# DSH Coursekeeper v0.8.0

> DeepSeek Harness 的自校准闭环认知路线控制平面。原项目名：`dsh-trajectory-governor`。

Coursekeeper 是 DeepSeek Harness 的外部 Agent control plane。它以确定性路由为 cold-start 基线，在模型外维护 Route Contract、Commitment、Evidence、Acceptance / Verification Debt 与 Verifier 状态，并从正常使用产生的可归因事件中做**有界的个人校准**。v0.8 进一步加入可选 **Verified Branching**：单轨迹不值得继续修时，允许隔离重采样并由 fresh-context verifier 选择。

一句话理解：

```text
协议保真 → 选路 → 守路 → 取证 → 验证 → 必要时换路/重采样 → 主工作区复验 → 记录经验
```

## 1. 它解决什么问题

普通 Agent 常见五类失败：

- 路线选得不合适：简单任务过度规划，复杂任务直接开改；
- 路线刚有一点不确定就切换，形成 branch churn；
- “改过了”“想通了”被误当成“验证过了”；
- 长期使用没有形成稳定个人偏好，或者需要昂贵的 learned router 才能适配；
- 当前 trajectory 已被错误前提污染时，仍在同一上下文里不断修补。

Coursekeeper 对应地做五件事：

```text
Router        选择 DIRECT / INSPECT / PLAN / EXPLORE
Committer     用 evidence budget 实现 route hysteresis
Verifier      用债务、falsifier、benchmark 和独立语义验证控制完成/换路
Calibrator    用个人 Episode 经验小幅修正路由边界和升级阈值
Brancher      条件触发 fresh candidate，用证据 verifier 选择，再回主工作区复验
```

它不是安全沙箱，也不替代 DSH 的 approval / sandbox / permission。

## 2. 默认行为

默认配置刻意保守：

```yaml
mode: active
requireUserOptIn: true
augmentationProfile: governor
rolloutMode: single
capabilityControl: guard
adaptiveReasoning: off
adaptiveRouting: shadow
adaptiveEscalation: calibrated
semanticVerifier: risk
safeExplorationRate: 0
```

这意味着：

- 默认需要用户在当前会话执行 `/coursekeeper on` 才生效；未开启时不会注入或阻塞；
- 开启后 Coursekeeper 控制平面实际生效；
- J-Space / Router Assist 默认关闭；
- 工具 schema 尽量保持稳定，mutation 在执行时由 guard 拦截；
- 自适应路由只做 shadow 建议，不改变确定性 route；
- 个人经验会记录，但不会在数据不足时“训练坏”路由；
- 高风险、PLAN、EXPLORE、research 任务可要求独立 Semantic Verifier；
- 不进行随机探索；
- `rolloutMode: single`，因此升级到 v0.8 不会自动增加多 rollout 成本。

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
| `native-canonical` | off | off | 协议保真实验：exact persona、稳定工具前缀、最小可见干预 |

这些 profile 会进入 CalibrationDomain，经验不会被当作完全相同的数据。

## 8. Verified Branching（v0.8，实验）

Verified Branching 与 `augmentationProfile` 正交：

```yaml
augmentationProfile: native-canonical
rolloutMode: verified-branching
```

默认仍是 `single`。只有 `FAIL_ROUTE`、no-progress、低 route margin、Semantic Verifier `UNKNOWN/FAIL_ROUTE` 或高 trajectory contamination 等事件满足策略时才考虑分支。

默认使用 progressive Bo2→Bo3：

```text
current trajectory + 1 fresh candidate
-> deterministic prefilter
-> fresh-context evidence verifier
-> margin 不足才增加第 3 个 candidate
```

`N>=4` 时使用 bounded pivot tournament。Verifier 不读取 Generator hidden CoT，并允许返回 `NO_VALID_CANDIDATE`。Alternate winner 选中后必须应用回 main workspace，并重新打开 Acceptance / Verification / Benchmark / Semantic debt。

自动 workspace branching 需要外部 `WorkspaceForkProvider`。若 runtime 没有真实 fork 能力，Coursekeeper 只记录 `branch/suggested`，不会在主 workspace 上伪造并行候选。详见 [Verified Branching](docs/VERIFIED_BRANCHING_MODE.md) 与 [Branching Runtime Protocol](docs/BRANCHING_PROTOCOL.md)。

## 9. 安装

要求：Node.js `^22.19.0 || >=24.0.0`；DSH peer range 为 `>=0.1.0-rc.5 <0.2.0`。

从源码目录：

```bash
npm run build
dsh plugin --profile web add .
dsh --profile web --dump-config
```

从 tarball：

```bash
dsh plugin --profile web add ./orangeofcarl0-sys-dsh-coursekeeper-0.8.0.tgz
dsh --profile web --dump-config
```

若包已发布到 npm，也可使用包名安装：

```bash
dsh plugin --profile web add @orangeofcarl0-sys/dsh-coursekeeper@0.8.0
```

## 10. 推荐上线顺序

第一阶段保持 `adaptiveRouting: shadow`。先观察 `coursekeeper_status` 中的 `baseRoute / adaptiveRoute / effectiveSupport / margin / routeTransitions`，确认 relation、route 与升级行为符合真实任务。

第二阶段只在积累了一批真实 Episode 后切到：

```yaml
adaptiveRouting: active
safeExplorationRate: 0
```

不要同时开启 `hybrid-assist + phase adaptive reasoning + safe exploration`。应逐项做 A/B，否则无法判断收益和缓存/推理成本来自哪里。

## 11. 模型可见工具

默认可注册：

```text
coursekeeper_control
coursekeeper_status
coursekeeper_semantic_verify
coursekeeper_branch   # 仅 rolloutMode=verified-branching 且 exposeBranchTool=true
```

用户入口：
- Web 会话标题栏新增 **CK** 按钮：点击弹出菜单，可直接发送 `/coursekeeper status|on|shadow|off|help` 到当前会话。
- `/coursekeeper status|on|shadow|off|help`（host 命令，所有会话可见）：三档会话模式——`active` 完整管制、`shadow` 仅观察不拦截、`off` 完全关闭。
- DSH 设置页新增 **Coursekeeper** 配置区：可全局设置 `mode`、`requireUserOptIn`、`semanticVerifier`、`autoVerify`、`exposeStatusTool`；设置可覆盖 bundle 默认值。

默认 `requireUserOptIn: true`，未执行 `/coursekeeper on` 的会话不注入、不阻塞。

`coursekeeper_control` 用于 commit / reroute / falsify / support / accept / waive；`coursekeeper_status` 是只读诊断；`coursekeeper_semantic_verify` 在确定性义务清理后运行独立语义验证；`coursekeeper_branch` 管理 Verified Branching wave/candidate/select/apply。

## 12. 本地数据

默认路径：

```text
$DSH_HOME/coursekeeper/decisions.jsonl
$DSH_HOME/coursekeeper/experiences-v1.jsonl
$DSH_HOME/coursekeeper/branch-experiences-v1.jsonl
```

`decisions.jsonl` 是审计 sidecar；`experiences-v1.jsonl` 是 route 自校准经验；`branch-experiences-v1.jsonl` 记录 branching 是否真正产生了可复验 uplift。它们都不是模型历史，也不替代 DSH Session Events。

## 13. 文档入口

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
- [Verified Branching 模式](docs/VERIFIED_BRANCHING_MODE.md)
- [Branching 运行时协议](docs/BRANCHING_PROTOCOL.md)

## 14. 当前验证状态

当前项目的本地发布基线通过 TypeScript 编译与 67 项控制逻辑测试，并对最终 npm tarball 做过反向解包 smoke test。它证明的是**控制逻辑和打包完整性**，不是 provider 侧任务质量提升。

真实 DSH/provider 环境仍应做 shadow → active 的 A/B 验证，尤其关注：route failure、wrong-first-hypothesis recovery、uncached input、额外 verifier/challenger 调用和 false blocker。


## Native Canonical 实验模式

`v0.7.1` 新增 `augmentationProfile: native-canonical`，用于隔离测试 DeepSeek Agent protocol fidelity：exact persona、候选 `bash -> read` 工具前缀、稳定工具面、retained reasoning 与 native tool-result linkage。该模式抑制正常 `pre-step` Coursekeeper 消息，但保留 guard、debt、finish veto 和 event-driven verification。详见 [docs/NATIVE_CANONICAL_MODE.md](docs/NATIVE_CANONICAL_MODE.md)。

