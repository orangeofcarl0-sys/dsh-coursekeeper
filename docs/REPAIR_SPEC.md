# Coursekeeper 修复规范（Repair Spec）

> 状态：Implemented（全部 Spec 已落地，见 CHANGELOG）  
> 版本：0.1  
> 范围：v0.8 已知系统限制的修复设计  
> 目标读者：Coursekeeper 维护者、DSH 宿主集成方、测试与运维  
> 关联文档：`ARCHITECTURE.md`、`EVIDENCE_AND_COMPLETION.md`、`BRANCHING_PROTOCOL.md`、`TOOLS_AND_STATUS.md`

---

## 0. 规范目的

本文档把以下问题从“已知限制”升级为**可验收的修复规范**：

1. 语义验证基础设施失败导致任务永久阻塞，且无用户可执行出口；
2. Verification Debt 无法感知 artifact 生命周期（删除/移动/假路径），缺少清理/waive 能力；
3. 证据路径提取过度宽松，制造不可闭合的合成债务；
4. Web 交互层未闭环：设置页不可见、模式不持久化、无实时状态；
5. Verified Branching 只有编排、没有真实 workspace 隔离，无法 E2E 验证；
6. 验证命令识别白名单过窄、结果判定不严格；
7. 依赖图启发式可能漏验；
8. 语义验证器“独立性”边界未显式化；
9. Guard/权限/审计边界未明确。

每一节包含：目标、根因、需求、设计、接口、数据模型、边界条件、验收标准、测试、迁移、风险。

---

## 1. 非目标（Non-Goals）

本规范不承担以下范围：

- 不把 Coursekeeper 变成安全沙箱；
- 不训练 neural router；
- 不承诺“独立语义验证器必然独立于主模型”；
- 不提供完整编译器级依赖图；
- 不把 Verified Branching 变成默认 rollout；
- 不替代 DSH 的 approval / sandbox / permission 体系；
- 不保存原始 objective/CoT/文件内容到经验库。

---

## 2. 术语

| 术语 | 定义 |
|---|---|
| Infra Failure | 验证器 transport / empty / unparseable / no-provider 等非裁决性失败 |
| Verdict | 验证器明确返回 pass/warn/patch/fail_route/unknown 的裁决 |
| Artifact Lifecycle | artifact 是否被创建、修改、删除、移动的完整事实 |
| Synthetic Debt | 由非真实路径 token 产生的 Verification Debt |
| User Escape | 用户/维护者明确允许跳过某项 gate 的受审计操作 |
| Local Fork Provider | 基于本地文件复制实现隔离 workspace 的 WorkspaceForkProvider |

---

## 3. 优先级与路线图

| 优先级 | Spec ID | 主题 | 目标 |
|---|---|---|---|
| P0 | SEM-001 | 语义验证器韧性 | 基础设施故障不再耗尽真实裁决预算，并给出用户出口 |
| P0 | DEBT-001 | 债务生命周期 | 感知删除/移动/假路径，支持清理与 waive |
| P0 | PATH-001 | 证据提取硬化 | 从源头阻止合成债务 |
| P1 | UX-001 | 交互闭环 | 设置面板、实时状态、模式持久化 |
| P1 | BR-001 | 本地 WorkspaceForkProvider | 解锁 Verified Branching E2E |
| P2 | VER-001 | 验证命令覆盖 | 支持自定义测试命令与结果判定 |
| P2 | DEP-001 | 依赖图 | 保守模式 + 更完整解析 |
| P3 | IND-001 | 验证器独立性 | 显式标识 same-model 边界 |
| P3 | SEC-001 | Guard/权限/审计 | 明确协作边界与审计 |

---

# SEM-001 语义验证器韧性

## 1.1 Problem

`semantic.attempts` 混用了“真实验证裁决”和“基础设施故障”，导致验证器暂时不可用时，任务被永久阻塞，且用户无法明确放行。

## 1.2 Root Cause

```text
dsh-llm finish/empty block
  -> plugin text == ''
  -> parseSemanticVerifierResult(undefined)
  -> status = unknown
  -> attempts++
  -> attempts >= maxSemanticVerifierCalls
  -> completionBlockers still blocks required && status != passed
```

## 1.3 Requirements

- 区分 `infraFailures` 与 `attempts`。
- 空输出、transport error、unparseable、no-provider 只增加 `infraFailures`。
- 默认行为仍 fail-closed：达到阈值仍阻止 finish。
- 必须提供用户显式出口：`/coursekeeper verifier allow`。
- 所有出口写 ledger。
- status 必须暴露：`infraFailures`、`attempts`、`availability`。

## 1.4 Design

### 1.4.1 状态模型

```ts
interface SemanticVerificationState {
  required: boolean
  status:
    | 'not-required'
    | 'pending'
    | 'running'
    | 'passed'
    | 'warn'
    | 'failed'
    | 'unknown'
    | 'unavailable'
  attempts: number             // 真实裁决次数
  infraFailures: number        // 基础设施故障次数
  verifiedWorkspaceRevision?: number
  decision?: 'pass' | 'warn' | 'patch' | 'fail_route' | 'unknown'
  reason?: string
  contradictions: string[]
  nextEvidence: string[]
}
```

### 1.4.2 配置

```ts
semanticVerifierFailOpen?: boolean          // default false
maxSemanticVerifierInfraFailures?: number   // default 2
```

### 1.4.3 行为矩阵

| 事件 | attempts | infraFailures | status |
|---|---|---|---|
| 空输出 | +0 | +1 | unavailable |
| unparseable 非空 | +0 | +1 | unavailable |
| stream throw / transport error | +0 | +1 | unavailable |
| 无 provider/model | +0 | +1 | unavailable |
| 解析出 pass/warn/patch/fail_route/unknown | +1 | +0 | 对应状态 |

### 1.4.4 完成门

```text
if semantic.required
  && status != 'passed'
  && !(semanticVerifierFailOpen && infraFailures >= maxSemanticVerifierInfraFailures)
  && !userAllowedSemanticFail
  -> blocker
```

用户出口：

```text
/coursekeeper verifier allow
/coursekeeper verifier disallow
```

写 ledger：

```text
semantic/waived-infra
  { sessionId, reason, infraFailures, userInitiated: true }
```

## 1.5 Acceptance Criteria

- [ ] 连续两次空输出：`infraFailures=2`, `attempts=0`，默认仍出现 semantic blocker。
- [ ] 执行 `verifier allow` 后，semantic blocker 消失但 ledger 有记录。
- [ ] `semanticVerifierFailOpen=true` 且 infra 达到阈值时，自动放行且 status='unavailable'。
- [ ] 真实 pass 会重置 infraFailures 为 0。
- [ ] status 输出包含 `infraFailures` 和 `attempts`。

## 1.6 Tests

- `tests/verifier.test.mjs`：空输出/不可解析/transport 分类。
- `tests/state.test.mjs`：completionBlockers 对 failOpen 的矩阵。
- `tests/index` 模拟 runSemanticVerifier 的 stream 事件序列。

## 1.7 Risks

- fail-open 会降低验证强度；因此默认 false，且必须审计。
- 同一模型验证仍可能不独立，见 IND-001。

---

# DEBT-001 债务生命周期

## 2.1 Problem

`VerificationDebt` 只绑定 artifact 字符串和 revision，无法感知文件已删除/移动，也没有 waive/cleanup 能力。

## 2.2 Root Cause

```text
文件被 mv/rm
-> artifact revision 不必然递增
-> debtSatisfied 仍返回 false
-> 没有接口删除/豁免该 debt
-> finish blocked
```

## 2.3 Requirements

- ArtifactState 记录 removed。
- 识别 rm/mv/git rm/git clean 等删除/移动操作。
- `debtSatisfied()` 对 removed artifact 返回 true。
- `pruneVerificationDebts()` 删除 removed/synthetic/waived debt。
- 用户可执行：
  - `/coursekeeper cleanup`
  - `/coursekeeper clean <path>`
  - `coursekeeper_control action=cleanup-verification`
- 所有清理写 ledger。

## 2.4 Design

### 2.4.1 ArtifactState

```ts
interface ArtifactState {
  path: string
  revision: number
  lastMutationSeq?: number
  lastObservationSeq?: number
  removed?: boolean
  removedAtSeq?: number
  dependencies: Set<string>
  dependents: Set<string>
}
```

### 2.4.2 新增 API

```ts
export function markArtifactRemoved(workspace, path, sequence): void
export function waiveVerificationDebt(workspace, debtId, reason): boolean
export function cleanupVerificationDebts(workspace, filter?: { removed?: boolean; synthetic?: boolean }): number
```

### 2.4.3 工具分类

识别：

```text
rm / rmdir / del
mv / move（源路径 removed）
git rm / git clean / git checkout -- <path>
```

### 2.4.4 debtSatisfied

```text
if artifact.removed === true -> true
if debt.waived -> true
if current > debt.artifactRevision -> true
else 原有 readback/command 判定
```

### 2.4.5 命令

```text
/coursekeeper cleanup               清除 removed/synthetic/waived 债务
/coursekeeper clean <path>          清除指定 artifact 债务
```

ledger 事件：

```text
debt/cleanup
  { artifact, count, reason, userInitiated: true }
```

## 2.5 Acceptance Criteria

- [ ] `markArtifactRemoved` 后，该 artifact 所有债务从 blockers 消失。
- [ ] `pruneVerificationDebts` 删除 removed 与 waived 债务。
- [ ] `cleanup-verification` 返回清理数量并写 ledger。
- [ ] 非 removed、非 waive 的未满足债务仍保持 blocker。
- [ ] cleanup 不影响 workspace revision。

## 2.6 Tests

- 构造 debt -> mark removed -> blocker 消失。
- waive -> prune -> ledger。
- cleanup 计数器。

## 2.7 Risks

- 删除文件不一定等于“任务完成”；清理必须有用户/审计动作。
- 不能把 cleanup 当作普通模型自调用。

---

# PATH-001 证据提取硬化

## 3.1 Problem

`extractPathLike()` 提取非文件 token，制造不可闭合的合成债务。

## 3.2 Root Cause

`PATH_RE` 不要求扩展名，不排除 hook/event/type 名与含换行片段。

## 3.3 Requirements

- 只有符合文件特征或已知 workspace artifact 的 token 才进入 scope。
- 排除：
  - `agent/pre-step`、`session/event`、`conversation/...`
  - `GovernorMode\n`、`any\n` 等类型/换行片段
  - 无扩展名且非已知 artifact 的 token
  - 纯数字/百分比（如 `67/67`）
- 无法确认时，`shellVerificationScope` 返回 `workspace` 或空，不制造单文件债务。

## 3.4 Design

```text
extractPathLike(text):
  1. 先按现有 ARTIFACT_RE / PATH_RE 提取候选
  2. 过滤：
     - 必须含文件扩展名，或
     - 存在于 workspace.artifacts，或
     - 匹配已知工作区前缀
  3. 过滤含 \n / whitespace / 控制字符
  4. 过滤已知 hook/event/type 词表
  5. unique 输出
```

## 3.5 Acceptance Criteria

- [ ] `agent/pre-step` 不再被提取。
- [ ] `GovernorMode\n` 不再被提取。
- [ ] 带 `.ts/.py/.md` 的路径仍被提取。
- [ ] 命令无法识别 scope 时回退到 workspace 或空。

## 3.6 Tests

- `tests/core.test.mjs` 增加 extractPathLike 边界用例。
- `tests/state.test.mjs` 验证不会为这些 token 创建 debt。

---

# UX-001 交互闭环

## 4.1 Problem

用户看不到设置面板、不知道当前模式、重启丢失 per-session 模式。

## 4.2 Requirements

- DSH 设置页可见 Coursekeeper 面板。
- 会话标题栏显示实时模式徽标。
- CK 菜单直接调用 host service，而不是依赖“发送命令到输入框”。
- per-session 模式持久化，重启可恢复。

## 4.3 Design

### 4.3.1 Host 服务

新增 `coursekeeperService`（host 侧）：

```ts
interface CoursekeeperService {
  status(sessionId): Promise<SessionStatus>
  setMode(sessionId, mode): Promise<{ ok: boolean }>
}
```

通过 TYPERT_REMOTE 暴露给 client。

### 4.3.2 Client

- `client.js` 注册 `settings.section`：`id='coursekeeper'`。
- 注册 header button，读取实时 status，显示：
  - `CK off`
  - `CK shadow`
  - `CK active`
- 菜单项调用 service，不再 `setDraft+submit`（保留命令作为 fallback）。

### 4.3.3 持久化

```text
per-session mode
  -> session metadata / workspace settings
  -> 重启时重建 runtime.userMode
```

### 4.3.4 命令

保留：

```text
/coursekeeper status|on|shadow|off|verifier allow|cleanup
```

## 4.4 Acceptance Criteria

- [ ] 设置页出现 Coursekeeper 面板。
- [ ] header 徽标随 on/shadow/off 变化。
- [ ] 点击菜单即刻切换，无需输入框。
- [ ] 重启后 per-session mode 恢复。
- [ ] `/coursekeeper` 仍可用作 fallback。

---

# BR-001 本地 WorkspaceForkProvider

## 5.1 Problem

Verified Branching `runtimeAvailable=false`，无法做真实 E2E。

## 5.2 Requirements

- 提供一个可选的本地实现，能力标记 `pre-mutation` 或 `arbitrary`。
- 默认关闭，不引入额外默认成本。
- 保持“没有真实 provider 只 suggestion”的不变量。

## 5.3 Design

```ts
class LocalWorkspaceForkProvider implements WorkspaceForkProvider {
  readonly capability = 'pre-mutation'
  checkpoint(input) { return { capability: this.capability, ref: workspaceRoot } }
  async fork(checkpoint, candidateId) {
    // copy workspace root to temp/coursekeeper/<candidateId>
    return { workspaceRef }
  }
  async apply(candidate) {
    // copy changed files back; return artifacts list
  }
  async dispose(ref) { rm -rf ref }
}
class LocalBranchExecutor implements BranchExecutor {
  async execute(input) {
    // run isolation sub-agent/subprocess in workspaceRef
  }
}
```

配置：

```ts
branchLocalForkEnabled?: boolean   // default false
branchLocalWorkspaceRoot?: string
```

## 5.4 Acceptance Criteria

- [ ] `runtimeAvailable=true` 当配置启用且 workspace root 存在。
- [ ] fork 后 candidate workspace 是独立副本。
- [ ] apply 后才在主 workspace 建立 verification debt。
- [ ] dispose 幂等。
- [ ] 无 provider/未启用时行为与现状一致。

## 5.5 Risks

- 大 workspace 复制成本高。
- 不处理 NFS/并发写。
- fresh candidate 实际执行还需要注册 BranchExecutor 后端。

---

# VER-001 验证命令覆盖与结果判定

## 6.1 Requirements

- 验证命令模板可配置。
- 验证结果必须有成功退出/成功标记。
- 支持用户显式标记已验证。

## 6.2 Design

```ts
verificationCommandPatterns?: string[]
```

默认扩展：

```text
deno test
python -m unittest / python -m pytest
bun test
just test
```

结果判定：

```text
exit code == 0
且 hasCommandFailure(content) == false
```

用户命令：

```text
/coursekeeper mark-verified <artifact> [reason]
```

## 6.3 Acceptance Criteria

- [ ] 自定义 `deno test src/x.ts` 被识别为 verify 且 scope 正确。
- [ ] 命令带 failure marker 即使匹配模板也不会清偿。
- [ ] mark-verified 写 ledger。

---

# DEP-001 依赖图保守模式

## 7.1 Requirements

- 新增 `dependencyScope: 'conservative' | 'resolved'`。
- conservative 模式下，workspace 任一相关 mutation 后，相关 workspace verification debt 重开。
- 后续接入 tsconfig paths / package exports 解析。

## 7.2 Acceptance Criteria

- [ ] conservative 模式不漏验已知间接依赖。
- [ ] resolved 模式仍保持现有局部失效行为。
- [ ] 文档明确该字段的生产含义。

---

# IND-001 验证器独立性

## 8.1 Requirements

- status 显示 semantic/comparative verifier 与 generator 是否同 provider/model。
- 同源时标记 `limitedIndependence: true`。
- 文档不宣称“绝对独立”。

## 8.2 Acceptance Criteria

- [ ] status 包含 verifier identity 与同源标记。
- [ ] 配置不同 provider/model 时显示 `limitedIndependence: false`。

---

# SEC-001 Guard/权限/审计边界

## 9.1 Requirements

- 所有用户级别动作写 ledger。
- 接受/waive/cleanup/verifier allow 必须记录来源（user/model）。
- 文档明确 Coursekeeper 是协作控制，不是安全边界。

## 9.2 Acceptance Criteria

- [ ] 每个治理动作产生 ledger 事件。
- [ ] 模型自报 accept 仍标记 selfAttested。
- [ ] 文档含安全边界声明。

---

## 10. 发布与回滚

每个 P0 修复单独提交，并满足：

```text
npm run check 通过
新增回归测试覆盖
文档同步
```

回滚条件：

```text
- fail-open 导致验证门失效且不可审计
- cleanup 误删有效债务
- client 加载失败
```

---

## 11. 开放问题

- 语义验证 fail-open 是否应该默认 true（目前倾向 false）？
- per-session mode 持久化到哪里：session metadata 还是 workspace settings？
- 本地 fork 是否需要在配置中显式指定 workspace root？
- 合成债务的历史清理是否需要跨版本迁移？
