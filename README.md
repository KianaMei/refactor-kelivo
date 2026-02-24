# Kelivo

多模型 AI 聊天客户端，Electron + React + TypeScript 构建。

支持 OpenAI / Claude / Gemini 等主流 API，本地 SQLite 存储，MCP 工具集成，Agent 模式。

## 功能

- 多供应商多模型切换（OpenAI、Claude、Gemini 及兼容 API）
- 流式对话，思考链可视化（ChainOfThought），工具调用展示
- Markdown 渲染、代码高亮、一键复制
- MCP Server 管理与工具调用
- Agent 模式（基于 Claude Agent SDK / Codex SDK）
- 图片工作室（AI 图像生成）
- 对话管理、分支、翻译、TTS 朗读
- 网络代理、快捷短语、助手预设
- 本地 SQLite 持久化，数据导入导出

## 技术栈

- Electron 35 + electron-vite
- React 19 + TypeScript
- SQLite（better-sqlite3）
- Radix UI + Lucide Icons
- Shiki（代码高亮）

## 项目结构

```
src/
├── main/          # Electron 主进程（DB、API 适配、IPC、服务）
├── preload/       # preload 桥接
├── renderer/      # React 前端
│   └── src/
│       ├── components/   # 通用组件（ChainOfThought、MarkdownView 等）
│       ├── pages/        # 页面（Chat、Agent、ImageStudio、Settings 等）
│       └── layout/       # 布局（NavRail）
└── shared/        # 主进程与渲染进程共享（类型、API 适配器、工具函数）
```

## 开发

```bash
yarn
yarn dev
```

## 构建

```bash
yarn build:win    # Windows x64
```

## 环境要求

- Node.js >= 22
- yarn
