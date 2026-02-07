# 任务：Agent Tab 运行时重构（Claude + Codex｜Bridge 子进程｜SDK 可一键升级）

> **类型**：feature
> **优先级**：P0（紧急）
> **负责人**：AreaSongWcc
> **状态**：🟡 进行中
> **开始时间**：2026-02-06
> **预计完成**：以 DoD 验收为准

## 🎯 目标
- 在 `refactor-kelivo` 中实现**稳定、可靠、可升级**的 Agent 运行架构。
- 采用 **B 架构**：独立 Node Bridge 子进程（stdio JSON-RPC），由 Electron `process.execPath --runAsNode` 启动（不依赖系统 Node）。
- Provider 同时支持：
  - `claude`：`@anthropic-ai/claude-agent-sdk`
  - `codex`：`@openai/codex-sdk`
- 权限策略：
  - Claude：完全按 SDK 机制（`permissionMode` + `canUseTool` 触发时才弹窗），并在 UI 暴露全部模式（含 `bypassPermissions`，需二次确认）。
  - Codex：按其机制（`sandboxMode + approvalPolicy`）。
- SDK：**内置可用**，同时支持**一键升级**到用户目录（失败自动回退内置）。
- 持久化：会话/消息写入现有 SQLite，并通过 migration 记录 `sdk_provider` 等关键字段，保证恢复可靠。

## 📌 范围
### 本任务范围
- ✅ Bridge 协议 v1 + Bridge 子进程实现（Claude/Codex 适配器）
- ✅ Main 进程：进程管理 + IPC + DB 落库 + 事件推送
- ✅ Renderer：AgentPage 真实数据流 + 权限弹窗 + 运行态配置
- ✅ 依赖管理：内置 + 外置安装/升级/卸载 + 自动回退
- ✅ 打包：`extraResources`/`asarUnpack` 确保 Bridge 与 SDK 可用

### 不在本任务范围（后续任务）
- ⏳ 模型列表自动拉取（`/models`）与智能缓存
- ⏳ “永远允许”之类的高级权限策略（首期仅 allow/deny）
- ⏳ 多 run 并发（首期单并发，清晰错误提示）

## 📊 进度仪表盘
| 阶段 | 状态 | 文档 |
|------|------|------|
| P 规划 | ✅ | [P_plan.md](./P_plan.md) |
| E 执行 | 🟡 | [E_execution.md](./E_execution.md) |
| R2 验收 | 🔵 | [R2_review.md](./R2_review.md) |

## 📝 关键决策（已锁定）
- 架构：Bridge 子进程（B）
- Node 启动：`process.execPath --runAsNode`
- Provider：Claude + Codex
- Agent 模板：只存 `name/prompt`，provider/model/权限为运行时选择
- DB：通过 migration 给 `agent_sessions` 加列记录 provider/model/权限等
- SDK 更新：内置 + 一键升级到用户目录 + 失败自动回退内置

## 🚨 风险与问题
- **许可证风险**：`references/idea-claude-code-gui` 为 AGPL，仅借鉴设计，不拷贝代码。
- **asar 模块解析**：Bridge 外置后动态加载 SDK 需显式处理路径与回退策略。
- **安全**：API Key 不写入 DB/日志；Bridge stdout 仅 JSON-RPC，严禁混入普通日志。

