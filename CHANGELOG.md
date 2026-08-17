# 0.7.1

- 新增实验 `native-canonical` augmentation profile。
- 固定 exact software-engineer persona，并将其置于 assembled sections 首位。
- 固定候选工具前缀 `bash -> read`，保持其余工具 schema/对象不变，Coursekeeper auxiliary tools 后置。
- native-canonical 下关闭 J-Space/Router assist 与 adaptive reasoning。
- 正常 pre-step Coursekeeper policy 静默，仅保留事件驱动纠错。
- 新增 request-level retained reasoning / linked tool-result 结构观测与 protocol fidelity 状态。
- 新增 Native Canonical 实验文档与 3 项结构测试。
- 项目仓库迁移至 `orangeofcarl0-sys/dsh-coursekeeper`；npm 包 scope 更改为 `@orangeofcarl0-sys`（`repository/homepage/bugs`、`cordis.patch.yml` 与安装文档已同步）。

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
