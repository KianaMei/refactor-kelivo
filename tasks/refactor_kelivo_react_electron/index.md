# 任务：Kelivo 迁移（React + TypeScript + Electron）

> **类型**：refactor
> **优先级**：P1（重要）
> **负责人**：AreaSongWcc
> **状态**：🟡 进行中
> **开始时间**：2026-01-30
> **预计完成**：按里程碑推进（先桌面端全功能对齐，再做同步与移动端）

## 🎯 目标
- 在工作区根目录创建新项目：`refactor-kelivo/`，作为 Kelivo 的下一代实现。
- Windows 桌面端技术栈固定为：**Electron + React + TypeScript**，重点解决 AI Chat 的“代码渲染体验”。
- 以旧项目 `kelivo/` 的 Windows 桌面端为规格，做到**界面与功能一比一对齐**（不做“删减版/MVP”）。
- 为未来“数据库后端 + 自动同步”做架构预留：
  - 本地持久化采用 SQLite（便于查询/搜索/增量同步）。
  - 同步逻辑与附件管理尽量下沉到明确的“后端层”（可独立进程/服务），避免绑死在 UI。
- 迁移路径可控：从旧端（Flutter 项目 `kelivo/`）的备份数据导入到新端。

## 📌 范围（先做什么 / 暂不做什么）
### 本任务范围（全功能对齐）
- ✅ 对齐旧版桌面入口与导航（Chat/Translate/API Test/Storage/Settings/Agent）
- ✅ 对齐旧版设置页（Display/Assistant/Providers/DefaultModel/Search/MCP/QuickPhrases/TTS/NetworkProxy/Backup/About）
- ✅ 对齐旧版对话核心能力（流式、Markdown/代码渲染、消息操作、附件、相关侧栏与弹窗）
- ✅ 数据迁移与持久化（旧备份导入 + SQLite）

### 不在本任务内（另起任务）
- ⏳ Android Kotlin/Compose 全量重写（此任务先把“桌面端 + 后端层 + 同步协议”打稳）

## 📊 进度仪表盘
| 阶段 | 状态 | 文档 |
|------|------|------|
| R1 调研 | ✅ | [R1_research.md](./R1_research.md) |
| I 设计 | ✅ | [I_solutions.md](./I_solutions.md) |
| P 规划 | ✅ | [P_plan.md](./P_plan.md) |
| E 执行 | 🟡 | [E_execution.md](./E_execution.md) |
| R2 验收 | 🔵 | [R2_review.md](./R2_review.md) |

## ✅ 已完成（可验证的交付）
> 说明：这里记录“已经能在新端实际跑起来/用起来”的内容；细节以 `E_execution.md` 为准。

- ✅ 新项目骨架：`refactor-kelivo/`（Electron + React + TS + Yarn + electron-vite）
- ✅ 配置系统 v2：落盘 `userData/config.json`，自动 normalize/升级
- ✅ Providers（供应商）完整能力：
  - ✅ 新增/编辑/删除供应商、设为默认、启用/禁用
  - ✅ 供应商详情面板（对齐 Dart `provider_detail_page.dart`）
  - ✅ 头像选择器：品牌图标 / Emoji / 图片上传 / URL 输入
  - ✅ 测试连接、获取模型列表
  - ✅ 模型管理：搜索、添加、编辑、删除
  - ✅ 模型设置对话框（对齐 Dart `model_detail_sheet.dart`）：基本/高级双 Tab
  - ✅ 多Key管理（对齐 Dart `multi_key_manager_page.dart`）：批量添加、负载均衡策略、启用/禁用
- ✅ Default Model（默认模型）：对话/翻译默认模型均可配置
  - ✅ 支持拉取 `/models` 列表、搜索、选择（OpenAI-compatible）
  - ✅ 顶部快速"切换模型"（Chat 内）
- ✅ Settings 全部 11 个面板 UI 实现：
  - ✅ Display（显示）：主题模式、消息气泡圆角、代码字体等
  - ✅ Assistant（助手）：助手列表、新增/编辑/删除、设为默认、系统提示词
  - ✅ Providers（供应商）：完整功能（见上）
  - ✅ DefaultModel（默认模型）：对话/翻译默认模型配置
  - ✅ Search（搜索）：搜索引擎配置、API Key 配置
  - ✅ MCP（MCP 服务器）：服务器列表管理、添加/编辑/删除
  - ✅ QuickPhrases（快捷短语）：短语列表、添加/编辑/删除
  - ✅ TTS（语音合成）：TTS 服务配置、自定义服务、测试播放
  - ✅ NetworkProxy（网络代理）：代理类型/地址/端口配置
  - ✅ Backup（备份）：备份/恢复入口（占位）
  - ✅ About（关于）：版本信息、项目链接
- ✅ Chat（对话）已具备"能用"的最小链路：
  - ✅ 基于 OpenAI-compatible 的流式输出（SSE），支持停止（Abort）
  - ✅ Markdown + 代码块高亮 + 一键复制
- ✅ Translate（翻译）双栏 + 流式输出 + 停止 + 复制
- ✅ 桌面观感底座：主题（system/light/dark）、基础控件样式、Lucide 图标
- ✅ 品牌资源迁移：`kelivo/assets/icons/` → `refactor-kelivo/src/renderer/public/icons/`
- ✅ 体验修正：模态遮罩亮度（light/dark 区分），模型列表刷新失败时友好提示

## 🟡 进行中（必须按旧版 1:1 补齐）
### UI（6 个 Tab）
- 🟡 Chat：当前只完成"能用链路"，距离旧版 **全套交互**还差大量细节：
  - ⏳ 会话管理（创建/删除/重命名/置顶/搜索/标签等）
  - ⏳ 消息操作（编辑/导出/更多菜单/版本选择等）
  - ⏳ 右侧面板/弹窗（推理预算、最大 tokens、工具循环、MCP 服务器、快捷短语等）
  - ⏳ 图片/文件输入与上传
- ⏳ API Test：未实现（旧版为双栏 + 多配置 + 模型拉取 + 工具面板）
- ⏳ Storage：未实现（旧版为统计 + 分类 + 清理）
- ⏳ Agent：未实现（旧版为完整 Agent sidebar + 会话 + 权限弹窗 + 设置）
- ✅ Settings：全部 11 个面板 UI 已完成（Display/Assistant/Providers/DefaultModel/Search/MCP/QuickPhrases/TTS/NetworkProxy/Backup/About）

### 数据层/后端层
- ⏳ SQLite：会话/消息/附件落库未做（当前 Chat 会话仍为内存 mock）
- ⏳ 旧备份导入：ZIP/settings.json/chats.json + 附件迁移未做
- ⏳ 自动同步：不在本任务内（另起任务），但需要预留字段/接口

## 🎯 下一步目标（优先级）

> 详细任务清单见 [E_execution.md](./E_execution.md) 的「待办任务」章节（任务 #16~#26）。

### P0（阻塞发布）- Chat 一比一对齐
| 任务 | 内容 |
|------|------|
| #16 | 会话管理（创建/删除/重命名/置顶/搜索/标签） |
| #17 | 消息操作（编辑/导出/更多菜单/版本选择） |
| #18 | 右侧面板/弹窗（推理预算、tokens、MCP、快捷短语） |
| #19 | 图片/文件输入与上传 |

### P1（重要）- 数据持久化 + 其他 Tab
| 任务 | 内容 |
|------|------|
| #20 | SQLite 数据持久化（会话/消息/附件） |
| #21 | 旧备份导入（chats.json + attachments） |
| #22 | API Test 页面实现 |
| #23 | Storage 页面实现 |
| #24 | Agent 页面实现 |

### P2（优化收尾）
| 任务 | 内容 |
|------|------|
| #25 | ProvidersPane 代码拆分（2460+ 行 → 独立组件） |
| #26 | Windows MSIX 打包与签名 |

## 📝 关键决策（本次已确定 / 待定）
### 已确定
- **桌面 UI/壳**：Electron + React + TypeScript。
- **新项目根目录**：`refactor-kelivo/`。
- **包管理器**：Yarn（兼容性优先）。
- **构建/打包**：electron-vite + electron-builder（参考 Cherry Studio 的实践）。

### 待定（进入 M0 时定死）
- **后端层形态**：
  - 方案 1：复用/扩展现有 Go `kelivo/gateway`（独立进程，本机 HTTP API）
  - 方案 2：用 Node/TypeScript 实现本地服务（独立进程，本机 HTTP API）

## 🚨 风险与问题
- **数据迁移**：Hive → SQLite 的字段映射与幂等导入需要一次性做对。
- **同步复杂度**：必须先做“最小可用”同步（增量 + LWW/追加式），避免一开始上高复杂冲突策略。
- **附件一致性**：附件引用路径必须 SSOT 化，避免平台路径差异。

## 🔗 相关参考
- 旧端数据模型：`kelivo/lib/core/models/chat_message.dart`、`kelivo/lib/core/models/conversation.dart`
- 旧端备份/导出：`kelivo/lib/core/services/backup/data_sync_io.dart`
- 旧端本地网关：`kelivo/gateway/main.go`
- 新项目目录：`refactor-kelivo/`
