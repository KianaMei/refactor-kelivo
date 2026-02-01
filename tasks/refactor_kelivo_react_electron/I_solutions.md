# I 设计：架构方案与推荐（Electron 固定）

## 设计目标
- 渲染强：Markdown + 代码块高亮/复制/选择/长代码性能。
- 兼容性强：Windows 上行为一致、坑少。
- 可演进：未来加“自动同步/Android 端”时不推倒重来。

## 工具链选择（参考 Cherry Studio）
- **包管理器**：Yarn
- **构建**：electron-vite（Vite 生态，开发体验好）
- **打包**：electron-builder（Windows 安装包）

## 方案 A：Electron + React/TS（UI）+ 独立本地服务（后端层）【推荐】
后端层可以是：
- A1：复用/扩展 Go `kelivo/gateway`
- A2：Node/TypeScript 自建本地服务

**优点**
- UI 只做展示与交互，复杂能力（SQLite、附件、同步、LLM 代理）集中在后端层，跨端复用更容易。
- Electron 主进程变得很薄：只负责启动/守护后端、窗口/托盘等。
- 未来如果你想把桌面壳从 Electron 换掉（例如 Tauri），核心业务层不受影响。

**缺点**
- 多进程/多模块，工程组织要清晰（但长期最省事）。

## 方案 B：Electron 主进程（Node）直接承担后端能力（无独立服务）
**优点**
- 初期实现最快，少一个进程。

**缺点**
- 业务逻辑与 Electron 绑定更紧，后续做 Android/服务端同步复用困难。
- 主进程越来越重，调试与稳定性成本上升。

## 推荐
- 选择方案 A。
- M0 阶段把“后端层”先做成最小可用：SQLite + Conversations/Messages API + 流式接口。
- 后端语言在 M0 决策：
  - 如果你倾向快速复用现有能力：选 Go（在现有 gateway 上扩展）。
  - 如果你倾向全栈 TS、一套语言：选 Node/TS。
