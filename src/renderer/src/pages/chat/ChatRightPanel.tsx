/**
 * 聊天右侧工具面板
 * 对齐旧版 Kelivo 的 home_page.dart 右侧面板
 * 包括：模型信息、推理预算、最大 Tokens、MCP 服务器、工具循环、快捷短语等
 */
import { useState, useMemo } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Brain,
  Maximize2,
  Server,
  RefreshCw,
  MessageSquare,
  Zap,
  Settings,
  Search as SearchIcon
} from 'lucide-react'
import type { AppConfig, ProviderConfigV2 } from '../../../../shared/types'

interface McpServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  status?: 'connected' | 'connecting' | 'error'
}

interface Props {
  config: AppConfig
  currentProvider: ProviderConfigV2 | null
  onOpenSettings?: (pane?: string) => void
}

interface SectionProps {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: string | number
}

function Section({ title, icon, children, defaultOpen = true, badge }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rightPanelSection">
      <button type="button" className="rightPanelSectionHeader" onClick={() => setOpen(!open)}>
        {icon}
        <span style={{ flex: 1, textAlign: 'left' }}>{title}</span>
        {badge !== undefined && <span className="rightPanelBadge">{badge}</span>}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div className="rightPanelSectionBody">{children}</div>}
    </div>
  )
}

function KVRow({ label, value, action }: { label: string; value: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rightPanelKV">
      <span className="rightPanelKVLabel">{label}</span>
      <span className="rightPanelKVValue">{value}</span>
      {action}
    </div>
  )
}

export function ChatRightPanel(props: Props) {
  const { config, currentProvider } = props

  // 推理预算 slider
  const [reasoningBudget, setReasoningBudget] = useState(0) // 0 = auto, 1-100 = manual %
  const [maxTokens, setMaxTokens] = useState<number | null>(null) // null = 不限制
  const [toolLoopEnabled, setToolLoopEnabled] = useState(true)
  const [toolLoopMax, setToolLoopMax] = useState(10)
  const [searchEnabled, setSearchEnabled] = useState(false)

  // MCP 服务器列表（从 config 读取，实际应该从 config.mcpServers 获取）
  const mcpServers: McpServerConfig[] = useMemo(() => {
    // TODO: 从 config 读取 MCP 服务器配置
    return [
      { id: 'mcp-1', name: 'Filesystem', command: 'npx', args: ['@anthropic/fs-server'], status: 'connected' },
      { id: 'mcp-2', name: 'Browser', command: 'npx', args: ['@anthropic/browser-server'], status: 'connecting' }
    ] as any[]
  }, [])

  // 快捷短语（从 config 读取）
  const quickPhrases = useMemo(() => {
    return [
      { id: 'qp-1', title: '继续', content: '请继续' },
      { id: 'qp-2', title: '总结', content: '请总结上面的内容' },
      { id: 'qp-3', title: '翻译中文', content: '请将上面的内容翻译成中文' }
    ]
  }, [])

  function handleOpenMcpSettings() {
    props.onOpenSettings?.('mcp')
  }

  function handleOpenSearchSettings() {
    props.onOpenSettings?.('search')
  }

  return (
    <div className="chatRightPanel frosted">
      <div className="chatRightPanelHeader">
        <span style={{ fontWeight: 700 }}>工具面板</span>
      </div>
      <div className="chatRightPanelBody">
        {/* 当前模型 */}
        <Section title="模型" icon={<Zap size={14} />}>
          <KVRow label="供应商" value={currentProvider?.name ?? '未设置'} />
          <KVRow label="模型" value={config.currentModelId ?? '未设置'} />
        </Section>

        {/* 推理预算 */}
        <Section title="推理预算" icon={<Brain size={14} />} badge={reasoningBudget === 0 ? 'Auto' : `${reasoningBudget}%`}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            控制模型推理时的计算资源分配
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="range"
              min={0}
              max={100}
              value={reasoningBudget}
              onChange={(e) => setReasoningBudget(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, minWidth: 40, textAlign: 'right' }}>
              {reasoningBudget === 0 ? 'Auto' : `${reasoningBudget}%`}
            </span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>
            0 = 自动（推荐），手动设置可能影响响应质量
          </div>
        </Section>

        {/* 最大 Tokens */}
        <Section title="最大 Tokens" icon={<Maximize2 size={14} />} badge={maxTokens ?? '无限制'}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            限制模型单次回复的最大 token 数量
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[null, 1024, 2048, 4096, 8192, 16384].map((val) => (
              <button
                key={val ?? 'null'}
                type="button"
                className={`btn btn-sm ${maxTokens === val ? 'btn-primary' : ''}`}
                onClick={() => setMaxTokens(val)}
              >
                {val ?? '无限制'}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <input
              type="number"
              className="input"
              placeholder="自定义 token 数"
              value={maxTokens ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setMaxTokens(v ? Number(v) : null)
              }}
              style={{ width: '100%' }}
            />
          </div>
        </Section>

        {/* 搜索 */}
        <Section title="搜索" icon={<SearchIcon size={14} />} badge={searchEnabled ? 'ON' : 'OFF'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ flex: 1, fontSize: 13 }}>启用网络搜索</span>
            <button
              type="button"
              className={`toggle ${searchEnabled ? 'toggleOn' : ''}`}
              onClick={() => setSearchEnabled(!searchEnabled)}
            >
              <span className="toggleThumb" />
            </button>
          </div>
          {searchEnabled && (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              模型将在需要时自动调用搜索工具获取实时信息
            </div>
          )}
          <button type="button" className="btn btn-ghost" style={{ marginTop: 8, width: '100%' }} onClick={handleOpenSearchSettings}>
            <Settings size={14} />
            <span>搜索设置</span>
          </button>
        </Section>

        {/* MCP 服务器 */}
        <Section
          title="MCP 服务器"
          icon={<Server size={14} />}
          badge={`${mcpServers.filter((s: any) => s.status === 'connected').length}/${mcpServers.length}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {mcpServers.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.6 }}>暂无 MCP 服务器</div>
            ) : (
              mcpServers.map((s: any) => (
                <div key={s.id} className="mcpServerItem">
                  <span
                    className="mcpServerDot"
                    style={{
                      background:
                        s.status === 'connected' ? 'var(--success)' : s.status === 'connecting' ? 'var(--warning)' : 'var(--error)'
                    }}
                  />
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>
                    {s.status === 'connected' ? '已连接' : s.status === 'connecting' ? '连接中' : '错误'}
                  </span>
                </div>
              ))
            )}
          </div>
          <button type="button" className="btn btn-ghost" style={{ marginTop: 8, width: '100%' }} onClick={handleOpenMcpSettings}>
            <Settings size={14} />
            <span>MCP 设置</span>
          </button>
        </Section>

        {/* 工具循环 */}
        <Section title="工具循环" icon={<RefreshCw size={14} />} badge={toolLoopEnabled ? `最多${toolLoopMax}次` : 'OFF'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ flex: 1, fontSize: 13 }}>允许多轮工具调用</span>
            <button
              type="button"
              className={`toggle ${toolLoopEnabled ? 'toggleOn' : ''}`}
              onClick={() => setToolLoopEnabled(!toolLoopEnabled)}
            >
              <span className="toggleThumb" />
            </button>
          </div>
          {toolLoopEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>最大轮数</span>
              <input
                type="range"
                min={1}
                max={50}
                value={toolLoopMax}
                onChange={(e) => setToolLoopMax(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 12, minWidth: 24 }}>{toolLoopMax}</span>
            </div>
          )}
        </Section>

        {/* 快捷短语 */}
        <Section title="快捷短语" icon={<MessageSquare size={14} />} badge={quickPhrases.length}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {quickPhrases.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.6 }}>暂无快捷短语</div>
            ) : (
              quickPhrases.map((p) => (
                <button key={p.id} type="button" className="quickPhraseChip" title={p.content}>
                  {p.title}
                </button>
              ))
            )}
          </div>
          <button type="button" className="btn btn-ghost" style={{ marginTop: 8, width: '100%' }} onClick={() => props.onOpenSettings?.('quickphrases')}>
            <Settings size={14} />
            <span>管理短语</span>
          </button>
        </Section>
      </div>
    </div>
  )
}
