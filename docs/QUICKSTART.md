# 快速开始

## 1. 安装

源码安装：

```bash
npm run build
dsh plugin --profile web add .
dsh --profile web --dump-config
```

本地 tarball：

```bash
dsh plugin --profile web add ./orangeofcarl0-sys-dsh-coursekeeper-0.7.1.tgz
dsh --profile web --dump-config
```

确认最终配置中只存在一个 `coursekeeper`。从 `dsh-trajectory-governor` 升级时不要让旧、新插件同时运行。

## 2. 第一次使用不要开启主动学习

推荐配置：

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

这时 Coursekeeper 的确定性控制实际生效，但个人经验只产生 shadow suggestion，不改变初始 route。

## 3. 看一次状态

让 Agent 调用：

```text
coursekeeper_status
```

重点检查：

```text
route
initialRoute
routeTransitions
adaptive.baseRoute
adaptive.adaptiveRoute
adaptive.effectiveSupport
adaptive.margin
acceptance
openVerificationDebt
blockers
semanticVerification
experienceStore
```

如果 `adaptiveRoute` 与 `baseRoute` 不同，但 `adaptiveRouting=shadow`，这是正常的：实际 route 仍保持 deterministic base。

## 4. PLAN / EXPLORE 的显式 commit

当 route 为 `plan` 或 `explore` 时，广泛 mutation 前需要：

```json
{
  "action": "commit",
  "route": "plan",
  "hypothesis": "the current interface boundary causes the regression",
  "falsifier": "the boundary is unchanged in the failing path",
  "next_evidence": "inspect the boundary and its callers",
  "min_evidence_actions": 2,
  "max_evidence_actions": 4
}
```

如果假设被证据直接推翻：

```json
{
  "action": "falsify",
  "evidence": "raw parser output already contains the expected field"
}
```

这会把 epistemic 状态设为 `contradicted`，立即释放 reroute，而不必等最小 commitment budget。

## 5. 完成前为什么会被拦

`finish` 或自然结束前，Coursekeeper 会检查：

```text
Acceptance 是否满足
修改后的 artifact 是否 readback
代码类修改是否 test/build/check
benchmark gate 是否通过
Semantic Verifier 是否要求且已 PASS
是否处于 recovery blocker
PLAN/EXPLORE 是否显式 commit
```

默认只允许有限的自动验证续步；耗尽后要求明确报告 blocker，不会无限自循环。

## 6. 何时切 active adaptive routing

不要按固定 Episode 数机械切换。至少满足两个条件：

```text
常见 bucket 的 effectiveSupport >= minEffectiveSupport
shadow 建议的 reroute/route failure 方向与真实结果大体一致
```

然后改为：

```yaml
adaptiveRouting: active
safeExplorationRate: 0
```

仍保留 `maxAdaptiveAdjustment: 0.15` 和 high-risk eligibility gate。

## 7. 最小回退方案

如果自适应结果不稳定：

```yaml
adaptiveRouting: off
adaptiveEscalation: rules
routeChallenger: off
```

这会保留 Route Contract、Debt、Verifier 等 v0.6 核心能力，只关闭个人经验对 route 的影响。

如果需要完全观察而不干预请求：

```yaml
mode: shadow
```

`mode: shadow` 与 `adaptiveRouting: shadow` 不同：前者是整个插件只观察；后者是 Coursekeeper 正常控制，但自适应路由只给建议。
