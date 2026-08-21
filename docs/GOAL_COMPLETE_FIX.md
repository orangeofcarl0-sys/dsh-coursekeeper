# Goal 自主完成：实现说明

> 问题：用户手动运行 `/goal <objective>` 后，模型无法自主停止，因为 DSH Goal 体系缺少模型可调用、用户可显式调用的 complete 入口。

## 根因

1. `dsh-command-goal` 的 `parseGoalCommand()` 只解析 `clear / pause / resume / edit / <objective>`，没有 `complete`。
2. `@deepseek-ai/dsh-goal` 的域层有 `GoalService.complete()` 与 `goals/complete` RPC，但没有模型可见工具。
3. `dsh-client-ui-goal` 对 `phase === "complete"` 直接隐藏。
4. 因此模型唯一能“结束”的方式是用户手工 `/goal clear`（清除，而非完成），丢失完成语义和审计。

## 方案

复用单一目标域状态机，把 `complete` 暴露给所有参与者：

- 模型侧：`goal_complete` 工具，调用 `ctx.goals.complete(agent, ref)`。
- 用户侧：`/goal complete` 命令，调用同一 `ctx.goals.complete()`。
- UI 后续可显示完成态（本项目仅实现命令与模型工具，UI 完成态属于 DSH client 改动）。

## 已在 Coursekeeper 仓库实现

- `src/index.ts` 新增可选 `goal_complete` 工具注册：
  - 通过 `ctx.inject(['goals'], ...)` 访问 DSH goal service；
  - 工具参数：`summary` / `reason`；
  - 成功返回 `{ ok: true, goal, summary, reason }`；
  - 无活动目标或已 complete 返回 `{ ok: false, reason }`。
- 编译/测试通过（77/77）。

## 已在本机 DSH 全局包应用的环境补丁

- `dsh-command-goal/lib/index.js`：
  - `parseGoalCommand` 支持 `complete`；
  - `commandHint` 显示 `/goal complete`；
  - handler 调用 `ctx.goals.complete(invocation.agent, goalRef(current))`。
- 备份：`dsh-command-goal/lib/index.js.bak-coursekeeper-goalcomplete`。

## 使用

重启 web 后：

- 模型调用 `goal_complete` 可自主完成当前 goal；
- 用户可输入 `/goal complete` 显式完成；
- 若未重启，用户仍可 `/goal clear` 终止当前 goal。

## 后续可选

- 在 `dsh-client-ui-goal` 显示 completed 状态与摘要；
- 可选策略：完成前要求 Coursekeeper `completionBlockers` 为空。
