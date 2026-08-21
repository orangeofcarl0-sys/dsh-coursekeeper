# 0.8.0-hotfix — stale debt closure, status crash guard, verifier output tolerance

- 修复陈旧修订 verification debt（artifactRevision < current）无闭合路径并永久阻塞 finish 的问题：debtSatisfied 将被更新修订替代的债务视为已闭合，pruneVerificationDebts 随即清除。
- 修复 coursekeeper_status 在未注入 coursekeeperBranching 的运行时崩溃：resolveBranchRuntime 对可选宿主能力做 try/catch 保护。
- 语义验证器流式收集增加 finish 块兜底；空输出与不可解析输出分开记账（semantic-verifier/empty 与 unparseable），错误原因可归因。
- parseSemanticVerifierResult 容忍 markdown code fence 与前后杂讯。
- 新增 coursekeeperComparativeVerifier 可选宿主注入保护（verifierProtocolFor 与候选比较路径），coursekeeper_status 不再因未注入而崩溃。
- 新增 `/coursekeeper` 用户命令与 `requireUserOptIn` 会话级 opt-in；bundle 默认 `requireUserOptIn: true`，未执行 `/coursekeeper on` 的会话不注入、不阻塞。
- 新增 DSH 设置页 Coursekeeper 配置区（mode/requireUserOptIn/semanticVerifier/autoVerify/exposeStatusTool），提供用户级全局交互入口。
- 新增 Web 会话标题栏 CK 按钮菜单：点击即可投递 `/coursekeeper status|on|off|help`。
- 新增 per-session 三档模式：active 完整管制 / shadow 仅观察 / off 完全关闭；`/coursekeeper shadow` 与 CK 菜单同步支持。
- 实现 P0 语义验证韧性：新增 infraFailures / unavailable，`semanticVerifierFailOpen` 与 `/coursekeeper verifier allow|disallow` 审计出口。
- 实现 P0 债务生命周期：ArtifactState.removed、删除操作识别、`cleanupVerificationDebts` 与 `/coursekeeper cleanup`。
- 实现 P0 证据提取硬化：`extractPathLike` 过滤非文件 token，避免合成债务。
- 实现 BR-001 本地 WorkspaceForkProvider / BranchExecutor（branchLocalForkEnabled / branchLocalWorkspaceRoot / branchLocalCommand），可配置启用本地文件复制候选隔离与命令执行。
- 实现 UX-001 子集：per-session 模式持久化（SessionModeStore），CK 菜单新增 verifier allow / cleanup 操作。
- 实现 VER-001 验证命令模板：新增 `verificationCommandPatterns` 配置，可识别自定义测试命令。
- 实现 IND-001 验证器独立性显式化：status 输出 semantic/comparative verifier 是否与 generator 同源（limitedIndependence）。
- 本地控制测试扩展到 75 项。

# 0.8.0 — Verified Branching

- 新增与 `augmentationProfile` 正交的 `rolloutMode: single | verified-branching`；默认 `single`，升级零额外 rollout 成本。
- 新增 trajectory contamination、FAIL_ROUTE/no-progress/low-margin/semantic trigger 与 conservative branch eligibility。
- 新增 progressive Bo2→Bo3；N>=4 使用 bounded pivot tournament。
- 新增 `WorkspaceForkProvider` / `BranchExecutor` 抽象；无真实 provider 时只 suggestion，不在 main workspace 伪造并发分支。
- 新增 candidate evidence sanitization、fingerprint/dedup 与 deterministic prefilter。
- 新增 fresh-context Comparative Verifier；默认 evidence-only，不传 Generator hidden CoT，并允许 `NO_VALID_CANDIDATE`。
- 支持外部 comparative backend 与 `structured / fine-grained-logprob / external` scoring 标记，不强绑定 Python verifier。
- alternate winner 必须 apply 回 main workspace；apply 后重新打开 Acceptance / Verification / Benchmark / Semantic debt。
- 新增 BranchExperience JSONL 与保守 Bayesian branch-usefulness calibration；按 protocol fingerprint / rollout mode 隔离经验。
- 新增 `coursekeeper_branch` 工具、branch status、runtime capability 与 branch experience store 状态。
- branch fork 在 winner/no-valid/abort/duplicate 后尽力清理；active collecting/comparing/selected wave 会阻塞 finish。
- 新增 `docs/VERIFIED_BRANCHING_MODE.md` 与 `docs/BRANCHING_PROTOCOL.md`。
- 本地控制测试扩展到 65 项。
- 项目仓库迁移至 `orangeofcarl0-sys/dsh-coursekeeper`；npm 包 scope 更改为 `@orangeofcarl0-sys`（`repository/homepage/bugs`、`cordis.patch.yml` 与安装文档已同步）。

# 0.7.1

- 新增实验 `native-canonical` augmentation profile。
- 固定 exact software-engineer persona，并将其置于 assembled sections 首位。
- 固定候选工具前缀 `bash -> read`，保持其余工具 schema/对象不变，Coursekeeper auxiliary tools 后置。
- native-canonical 下关闭 J-Space/Router assist 与 adaptive reasoning。
- 正常 pre-step Coursekeeper policy 静默，仅保留事件驱动纠错。
- 新增 request-level retained reasoning / linked tool-result 结构观测与 protocol fidelity 状态。
- 新增 Native Canonical 实验文档与 3 项结构测试。

# Changelog

## 0.7.0 — DSH Coursekeeper

Project renamed from **dsh-trajectory-governor** to **DSH Coursekeeper**.

### Added

- self-calibrating adaptive routing without offline training;
- privacy-minimized `TaskSignature` with SHA-256 + 64-bit character n-gram SimHash;
- personal JSONL `ExperienceStore`;
- calibration domains scoped by provider/model/revision/profile/Harness/policy schema;
- case-based Top-K memory with similarity and time decay;
- Beta/Bernoulli route calibration using attributable route-level signals only;
- bounded adaptive score correction and effective-support gate;
- adaptive `off/shadow/active` modes, defaulting to `shadow`;
- route margin and low-risk cheaper-route policy;
- optional risk-gated compact Route Challenger;
- safe exploration interface, default `0`;
- event-driven route escalation and conservatively learned escalation thresholds;
- experience metrics for request/tool/verifier/reroute costs;
- `coursekeeper_control`, `coursekeeper_status`, and `coursekeeper_semantic_verify`;
- `./adaptive` package export.

### Preserved

- optional J-Space assist (`lite` / `legacy`);
- optional Router interface assist (`minimal-first` / `task-aware`);
- Route Contract and commitment hysteresis;
- acceptance/verification/benchmark completion gates;
- artifact-scoped evidence graph;
- independent semantic verifier;
- durable state replay and legacy `trajectory_control` replay compatibility.

### Changed

- plugin name: `coursekeeper`;
- npm package: `@chunsi-m/dsh-coursekeeper`;
- default state paths moved to `$DSH_HOME/coursekeeper/`;
- static kernel/control packet tags changed to `coursekeeper` / `ck` forms;
- adaptive routing defaults to shadow; no historical data changes behavior at cold start.

### Learning safety

- external/provider failures do not update route calibration;
- one anecdote cannot override the deterministic route;
- cross-model experience weight defaults to zero;
- adaptive route score changes are capped (`0.15` default);
- escalation threshold learning only moves toward earlier recovery, not riskier delayed escalation;
- route challenger is bounded per episode;
- safe exploration is disabled by default.

## 0.6.0

Unified Router + commitment + evidence graph + independent verifier, with J-Space and Router as optional assist modes.

## 0.3.0

First control-plane rewrite of trajectory governance, verification debt, acceptance gating and replayable state.
