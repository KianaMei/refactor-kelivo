# P 规划：WBS 执行计划（React + TS + Electron）

## DoD（Definition of Done：一比一全功能对齐）
> 说明：本任务目标是**对齐旧项目 `kelivo/` 的 Windows 桌面端**，不做“删减版/MVP”。

### 桌面端（Electron + React + TS）
- 入口与导航：对齐 `kelivo/lib/desktop/desktop_home_page.dart`
  - [x] Chat（对话）
  - [x] Translate（翻译）
  - [x] API Test（API 测试）
  - [x] Storage（存储）
  - [x] Settings（设置）
  - [x] Agent（Agent）
- Chat：对齐 `kelivo/lib/features/home/pages/home_page.dart`（桌面分支）
  - [ ] 会话管理（创建/删除/重命名/置顶/搜索/标签等，按旧版行为）
  - [ ] 消息列表（流式、滚动、跳转、mini rail 等）
  - [ ] 消息操作（编辑/导出/更多菜单/版本选择等）
  - [x] Markdown + 代码块渲染（已完成：Markdown/高亮/复制）
  - [ ] 长代码性能优化 / 代码查看弹窗
  - [ ] 图片/文件输入与上传（对齐旧版）
  - [ ] 右侧面板/弹窗：推理预算、最大 tokens、工具循环、MCP 服务器、快捷短语等
- Translate：对齐 `kelivo/lib/desktop/desktop_translate_page.dart`
  - [x] 双栏翻译 UI + 模型选择 + 语言选择 + 流式/停止/复制
- API Test：对齐 `kelivo/lib/desktop/desktop_api_test_page.dart`
  - [ ] 多配置管理、拉取 models、流式测试、工具面板等
- Storage：对齐 `kelivo/lib/features/settings/pages/storage_space_page.dart`
  - [ ] 存储统计 + 清理项（按旧版）
- Agent：对齐 `kelivo/lib/desktop/agent/desktop_agent_page.dart`
  - [ ] Agent 主流程与相关设置（按旧版）
- Settings：对齐 `kelivo/lib/desktop/desktop_settings_page.dart`
  - [x] Display（显示）：主题模式、消息气泡圆角、代码字体
  - [x] Assistant（助手）：助手列表、新增/编辑/删除、设为默认、系统提示词
  - [x] Providers（供应商）：完整功能（详情面板、模型管理、头像选择器）
  - [x] DefaultModel（默认模型）：对话/翻译默认模型配置、模型列表获取
  - [x] Search（搜索）：搜索引擎配置、API Key 配置
  - [x] MCP（MCP 服务器）：服务器列表管理、添加/编辑/删除
  - [x] QuickPhrases（快捷短语）：短语列表、添加/编辑/删除
  - [x] TTS（语音合成）：TTS 服务配置、自定义服务、测试播放
  - [x] NetworkProxy（网络代理）：代理类型/地址/端口配置
  - [x] Backup（备份）：备份/恢复入口（UI 占位）
  - [x] About（关于）：版本信息、项目链接

### 数据与后端层
- [ ] 配置与密钥：对齐旧版 Settings/Providers 的结构（含代理、多 Key、Vertex 等字段）
- [ ] 本地数据：SQLite（会话/消息/附件索引）
- [ ] 网络与流式：对齐旧版 ChatApiService（SSE/WS/兼容 endpoints）
- [ ] 导入导出：对齐旧版备份结构（ZIP + settings.json/chats.json + 附件）

### 测试与验收
- [ ] UI：关键链路可手动验收（与旧版一致）
- [ ] 核心逻辑单测：导入/存取/查询/流式拼接
- [ ] 端到端冒烟：启动→导入→选择供应商/模型→发送消息→落库→重启后仍存在

---

## 里程碑拆解

### M0：新项目骨架 + 契约（0.5～2 天）
- 创建新项目根目录：`refactor-kelivo/`（已完成）。
- 定义 SSOT 数据结构（JSON）：Conversation/Message/Attachment（兼容旧字段）。
- 定义本地 API（v1）：
  - `/v1/conversations`、`/v1/messages`、`/v1/stream`、`/v1/attachments`
  - 认证：启动生成本机 token（写入本机配置文件）
- 初始化 Electron + React + TS：
  - 构建：electron-vite（参考 Cherry Studio）
  - 打包：electron-builder
  - 包管理：Yarn
  - 进程：main/preload/renderer

验收：新项目可启动；UI 框架与页面路由/布局对齐旧版桌面结构；接口文档完成。

### M1：后端层 SQLite（1～4 天）
- 设计 SQLite schema（conversation/message/attachment + 索引）。
- 实现 API：
  - 会话：创建/列表/更新标题/置顶
  - 消息：追加、按会话分页拉取、全文搜索（先 LIKE，后续 FTS5）
  - 流式：SSE 或 WebSocket（把 LLM 流式结果推给前端）
- 导入器：`chats.json` → SQLite（幂等/重复导入检测）。

验收：可导入旧数据；发送消息后落库；重启后数据存在。

### M2：桌面 UI 一比一对齐（以旧版为规格，2～10 天，按模块完成）
- 对齐 DesktopHomePage：NavRail、标题栏、窗口行为（Windows）
- 对齐 Chat：三栏结构 + 所有弹窗/侧栏/工具条（不留占位）
- 对齐 Translate / API Test / Storage / Agent / Settings 全部页面（不留占位）

验收：对照旧版逐项勾选“对齐清单”，全部完成。

### M3：Electron 集成与打包（0.5～3 天）
- Electron 主进程：启动/守护后端层（端口探活、退出清理）。
- Windows 打包：先能装能跑；日志落地到 `refactor-kelivo/logs/`（并忽略进 git）。

验收：双击即可用（无需手动启动后端）。

### M4：自动同步（另起任务）
> 同步是后续任务：本任务先把“桌面端全功能对齐 + 数据层/导入导出”做扎实，并为同步协议预留字段。

---

## 风险缓解（计划内动作）
- 迁移期“数据 SSOT”：新端 SQLite 为准；旧端只导出。
- 同步先简单：先 LWW/追加式，避免 CRDT 拖慢进度。
- UI 与后端解耦：避免把 SQLite/同步写进 React/Electron 业务层。
