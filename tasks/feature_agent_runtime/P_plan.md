# P 规划：Agent Tab 运行时（Bridge + Claude/Codex + 可升级 SDK）

## 目标（DoD）
- [ ] Bridge 子进程可启动，`initialize` 能返回各 SDK 的 `available/version/source`。
- [ ] `agent.run` 支持 Claude/Codex，UI 可流式看到 assistant 输出。
- [ ] Claude 权限：仅在 SDK 触发 `canUseTool` 时弹窗；allow/deny 闭环可用；`bypassPermissions` 有二次确认。
- [ ] Codex 权限：`sandboxMode + approvalPolicy` 可配置并透传。
- [ ] 会话/消息：写入 SQLite；`agent_sessions` 新列能正确记录 provider/model/权限；历史会话不歧义。
- [ ] SDK：内置可用；外置“一键升级”成功后可切换 external；升级失败自动回退 bundled；卸载可回退 bundled。
- [ ] 打包后（electron-builder）Bridge 与 SDK 在生产包内可用。
- [ ] 自检：Mock 模式覆盖 session/message/permission 流转。

## WBS（工作分解）
1. **SSOT 文档**
   - 建立 `tasks/feature_agent_runtime/` 与四份文档（index/plan/execution/review）
2. **配置与类型**
   - 扩展 `AppConfigV2`：agent 模板 + agentRuntime + deps 相关字段
   - `createDefaultConfig/normalizeConfig` 注入默认值（兼容旧配置）
3. **数据库**
   - 新增 migration 002：`agent_sessions` 增列（provider/model/权限/策略）
   - 更新 `db-types` 与 repo 映射、CRUD
4. **Bridge 协议 v1**
   - JSON-RPC：`initialize / agent.run / agent.abort / permission.respond`
   - 通知：`assistant.delta/done`、`tool.*`、`permission.request`、`status`、`resume.id`
5. **Bridge 子进程实现（Node）**
   - 逐行 JSON 输入输出；stdout 禁日志；stderr 脱敏日志
   - ClaudeAdapter：`query()` + `permissionMode` + `canUseTool` 等待主进程响应
   - CodexAdapter：`@openai/codex-sdk` streamed events → 统一事件
   - SDK 动态加载：external 优先，失败回退 bundled；上报 version/source
   - Mock 模式：`MOCK=1` 输出固定事件序列
6. **Main 进程**
   - `AgentBridgeManager`：spawn/watchdog/超时/单并发/JSON-RPC 客户端
   - `agentIpc`：Run/Abort/PermissionRespond
   - Bridge event 落库：写 `agent_messages` 与更新 `agent_sessions` 状态
   - 事件推送 renderer：`AgentEvent`
7. **Renderer**
   - Agent 模板列表来自 config；sessions/messages 来自 DB
   - 顶部运行配置（provider/model/权限）与持久化到 `agentRuntime`
   - 权限弹窗：仅在 `permission.request` 时出现
8. **依赖管理（可升级 SDK）**
   - `DepsManager`：安装/升级/卸载到 `${userData}/dependencies`
   - 原子替换目录；失败回退 bundled；展示最近错误（不含 secrets）
   - Settings 增加 “依赖/SDK” 页面
9. **打包调整**
   - `extraResources`：`resources/agent-bridge/**`
   - `asarUnpack`：确保内置 SDK 相关文件可被真实路径访问（如 wasm）
10. **验证**
   - typecheck/build
   - Mock 集成自检脚本
   - 手工验收清单（Claude/Codex/升级/卸载/恢复）

