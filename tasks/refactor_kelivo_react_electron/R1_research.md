# R1 调研：现状、约束与风险（已按 React/Electron 方向重启）

## ⏱️ 时间
- 重启时间：2026-01-30 22:21（Asia/Shanghai）

## 现状概览（来自现有仓库）
- 旧端 Flutter 工程位于：`kelivo/`。
- 数据层：Hive 持久化（会话/消息等，见 `kelivo/lib/core/models/*`）。
- 已存在“导出/备份”通道：ZIP（settings.json、chats.json + 可选附件），并支持 WebDAV（见 `kelivo/lib/core/services/backup/data_sync_io.dart`）。
- 存在 Go 网关雏形：`kelivo/gateway`，提供 LLM 代理、上传/文件服务、WebDAV 代理。

## 关键约束
- 目标平台：Windows（桌面端）+ Android（后续）。
- 你最看重：桌面端**功能兼容性**与“代码渲染体验”。
- 未来必做：数据库后端 + 自动同步。

## 主要风险
- **渲染体验**：Markdown/代码块必须优先投入（否则迁移没有意义）。
- **数据 SSOT**：迁移期避免双端各自写库；建议新端 SQLite 为准、旧端只导出。
- **同步推倒风险**：若不提前预留 revision/updatedAt/deletedAt/deviceId 等字段，后期会大改。

## 结论
- Electron + React + TS 能最大化利用前端生态，快速把 UI/渲染打到“顶级 AI Chat”水准。
- 后端层建议独立出来（Go 或 Node/TS 均可），让桌面壳仅负责启动/守护，避免未来演进被壳绑定。
