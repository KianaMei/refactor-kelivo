# P 阶段执行计划（WBS）

## 1. 范围与验收（DoD）
- 新增绘画页与导航入口。
- fal provider 可提交、轮询、取消、入库、落盘。
- OpenRouter provider 可配置 Key 但不可执行。
- 支持 URL + 本地多图输入；支持 Prompt 与 fal 全量参数。
- 支持历史列表、详情、删除、重试。
- 通过 `npm run typecheck`。

## 2. 工作分解
1. 文档与任务目录初始化。
2. Shared 类型与 IPC 常量扩展。
3. DB 迁移与仓储实现。
4. 主进程服务（provider + 调度 + 事件广播 + 落盘）。
5. IPC / preload / renderer 全局类型接入。
6. 前端页面实现（参数表单、输入管理、任务状态、历史操作）。
7. storage 统计联动与联调验证。

## 3. 风险与缓解
- **API 变更风险**：严格按 fal 文档定义字段并统一映射层。
- **大图上传风险**：设置输入数量与总图量限制，前端先拦截。
- **密钥泄露风险**：Key 仅配置持久化，不入历史表、不进日志。
- **并发状态风险**：任务上下文按 jobId 管理 AbortController 与轮询。

## 4. 依赖
- Electron 主进程 `fetch`（Node 22）。
- 现有 `configStore`、SQLite 迁移体系、`userData/images` 存储体系。
