# R2 验收：Agent Tab 运行时（Bridge + Claude/Codex + 可升级 SDK）

## 验收清单（DoD）
- [x] Bridge `initialize` 可用（已用 MOCK 冒烟验证）
- [ ] Claude：权限弹窗按需触发；allow/deny 闭环正确；`bypassPermissions` 二次确认
- [ ] Codex：`sandboxMode + approvalPolicy` 透传生效；写入受限时行为清晰
- [ ] 会话恢复：provider/model/权限字段不歧义；resumeId 可复用
- [ ] SDK 升级：外置安装成功可用；失败回退 bundled；卸载回退 bundled
- [ ] 安全：API Key 不写 DB、不写日志；stdout 仅 JSON-RPC
- [ ] 打包：生产包可运行 Bridge；SDK 加载路径正确
- [x] 自检：Mock 冒烟脚本通过（`tasks/feature_agent_runtime/tests/agent_bridge_mock_smoke.mjs`）

## 经验沉淀（待补）
- 关键坑点
- 可靠性策略
- 后续演进建议
