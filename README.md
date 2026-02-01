# refactor-kelivo（新一代 Kelivo）

## 目标
- 使用 Electron + React + TypeScript 重写桌面端（Windows 优先）。
- 重点打造 AI Chat 的“代码渲染体验”（Markdown/高亮/复制/长代码性能）。
- 为未来自动同步准备：本地 SQLite + 明确的后端层（本机 API）。

## 当前状态
- 已完成 Electron + React + TypeScript 的最小工程骨架。
- 详细计划与里程碑见：`tasks/refactor_kelivo_react_electron/`。

## 下一步（建议）
1) 先跑通：Markdown + 代码块渲染（高亮/复制/滚动/选择体验）
2) 确定后端层语言与形态（复用 Go gateway / Node TS 本地服务）
3) 落地 SQLite 与数据导入（从旧端 chats.json/settings.json）

## 开发命令
```bash
yarn
yarn dev
```

## 常见问题
- 如果你系统环境里设置了 `ELECTRON_RUN_AS_NODE=1`，Electron 会以“Node 模式”启动，导致无法加载 Electron API。
  - 本项目已在 `scripts/run-electron-vite.mjs` 内强制移除该变量，正常情况下直接 `yarn dev` 即可。
