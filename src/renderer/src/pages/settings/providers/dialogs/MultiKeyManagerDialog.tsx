import { useState, useEffect, useMemo, useCallback } from 'react'
import type { ProviderConfigV2, ApiKeyConfig, LoadBalanceStrategy } from '../../../../../../shared/types'
import { LOAD_BALANCE_STRATEGIES } from '../types'
import { useDialogClose } from '../../../../hooks/useDialogClose'

export function MultiKeyManagerDialog({
  open,
  provider,
  onSave,
  onClose
}: {
  open: boolean
  provider: ProviderConfigV2
  onSave: (updated: ProviderConfigV2) => Promise<void>
  onClose: () => void
}) {
  const [keys, setKeys] = useState<ApiKeyConfig[]>([])
  const [strategy, setStrategy] = useState<LoadBalanceStrategy>('roundRobin')
  const [filter, setFilter] = useState<'all' | 'active' | 'error'>('all')
  const [saving, setSaving] = useState(false)

  // 编辑 Key 对话框状态
  const [editKeyOpen, setEditKeyOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<ApiKeyConfig | null>(null)
  const [editKeyName, setEditKeyName] = useState('')
  const [editKeyValue, setEditKeyValue] = useState('')
  const [editKeyPriority, setEditKeyPriority] = useState(5)
  const [showEditKeyValue, setShowEditKeyValue] = useState(false)

  // 批量添加 Key 对话框
  const [addKeysOpen, setAddKeysOpen] = useState(false)
  const [addKeysText, setAddKeysText] = useState('')

  const handleDialogClose = useCallback(() => {
    if (addKeysOpen) {
      setAddKeysOpen(false)
    } else if (editKeyOpen) {
      setEditKeyOpen(false)
    } else {
      onClose()
    }
  }, [addKeysOpen, editKeyOpen, onClose])

  useDialogClose(open, handleDialogClose)

  // 初始化
  useEffect(() => {
    if (!open) return
    setKeys(provider.apiKeys || [])
    setStrategy(provider.keyManagement?.strategy || 'roundRobin')
    setFilter('all')
  }, [open, provider])

  // 过滤 Key 列表
  const filteredKeys = useMemo(() => {
    if (filter === 'all') return keys
    if (filter === 'active') return keys.filter(k => k.isEnabled)
    return keys.filter(k => !k.isEnabled)
  }, [keys, filter])

  // 保存更改
  const saveChanges = useCallback(async (newKeys: ApiKeyConfig[], newStrategy?: LoadBalanceStrategy) => {
    setSaving(true)
    try {
      await onSave({
        ...provider,
        apiKeys: newKeys,
        multiKeyEnabled: newKeys.length > 0,
        keyManagement: {
          strategy: newStrategy ?? strategy,
          maxFailuresBeforeDisable: provider.keyManagement?.maxFailuresBeforeDisable ?? 3,
          failureRecoveryTimeMinutes: provider.keyManagement?.failureRecoveryTimeMinutes ?? 5,
          enableAutoRecovery: provider.keyManagement?.enableAutoRecovery ?? true,
        },
        updatedAt: new Date().toISOString()
      })
      setKeys(newKeys)
      if (newStrategy) setStrategy(newStrategy)
    } finally {
      setSaving(false)
    }
  }, [provider, strategy, onSave])

  // 添加单个 Key
  const handleAddKey = () => {
    setEditingKey(null)
    setEditKeyName('')
    setEditKeyValue('')
    setEditKeyPriority(5)
    setShowEditKeyValue(false)
    setEditKeyOpen(true)
  }

  // 编辑 Key
  const handleEditKey = (key: ApiKeyConfig) => {
    setEditingKey(key)
    setEditKeyName(key.name || '')
    setEditKeyValue(key.key)
    setEditKeyPriority(key.priority)
    setShowEditKeyValue(false)
    setEditKeyOpen(true)
  }

  // 保存 Key（新增或编辑）
  const handleSaveKey = async () => {
    const keyValue = editKeyValue.trim()
    if (!keyValue) return

    if (editingKey) {
      // 编辑现有 Key
      const newKeys = keys.map(k =>
        k.id === editingKey.id
          ? { ...k, key: keyValue, name: editKeyName.trim() || undefined, priority: editKeyPriority }
          : k
      )
      await saveChanges(newKeys)
    } else {
      // 添加新 Key
      const newKey: ApiKeyConfig = {
        id: `key_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        key: keyValue,
        name: editKeyName.trim() || undefined,
        isEnabled: true,
        priority: editKeyPriority,
        sortIndex: keys.length,
        createdAt: Date.now()
      }
      await saveChanges([...keys, newKey])
    }
    setEditKeyOpen(false)
  }

  // 批量添加 Key
  const handleBatchAddKeys = async () => {
    const text = addKeysText.trim()
    if (!text) return

    // 支持逗号、换行、空格分割
    const keyStrings = text.split(/[,\n\s]+/).map(s => s.trim()).filter(s => s.length > 0)
    if (keyStrings.length === 0) return

    const newKeys: ApiKeyConfig[] = keyStrings.map((keyStr, i) => ({
      id: `key_${Date.now()}_${i}_${Math.random().toString(16).slice(2, 8)}`,
      key: keyStr,
      isEnabled: true,
      priority: 5,
      sortIndex: keys.length + i,
      createdAt: Date.now()
    }))

    await saveChanges([...keys, ...newKeys])
    setAddKeysText('')
    setAddKeysOpen(false)
  }

  // 删除 Key
  const handleDeleteKey = async (keyId: string) => {
    const newKeys = keys.filter(k => k.id !== keyId)
    await saveChanges(newKeys)
  }

  // 切换 Key 启用状态
  const handleToggleKey = async (keyId: string) => {
    const newKeys = keys.map(k =>
      k.id === keyId ? { ...k, isEnabled: !k.isEnabled } : k
    )
    await saveChanges(newKeys)
  }

  // 修改负载均衡策略
  const handleChangeStrategy = async (newStrategy: LoadBalanceStrategy) => {
    await saveChanges(keys, newStrategy)
  }

  // 全部启用/禁用
  const handleEnableAll = async () => {
    const newKeys = keys.map(k => ({ ...k, isEnabled: true }))
    await saveChanges(newKeys)
  }

  const handleDisableAll = async () => {
    const newKeys = keys.map(k => ({ ...k, isEnabled: false }))
    await saveChanges(newKeys)
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-surface"
        style={{ width: 600, maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          gap: 12
        }}>
          <button type="button" className="toolbar-icon-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
          <h4 style={{ flex: 1, margin: 0, fontSize: 16, fontWeight: 600 }}>
            多 Key 管理
          </h4>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {keys.length} 个 Key
          </span>
        </div>

        {/* 过滤器和策略选择 */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 过滤器 */}
          <div style={{ display: 'flex', gap: 0 }}>
            {(['all', 'active', 'error'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`seg-tab ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? '全部' : f === 'active' ? '正常' : '错误'}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* 负载均衡策略 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>策略:</span>
            <select
              className="input-detail"
              style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}
              value={strategy}
              onChange={(e) => void handleChangeStrategy(e.target.value as LoadBalanceStrategy)}
            >
              {LOAD_BALANCE_STRATEGIES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 工具栏 */}
        <div style={{ padding: '8px 16px', display: 'flex', gap: 8, borderBottom: '1px solid var(--border)' }}>
          <button type="button" className="desk-button" style={{ fontSize: 12 }} onClick={handleAddKey}>
            + 添加 Key
          </button>
          <button type="button" className="desk-button" style={{ fontSize: 12 }} onClick={() => setAddKeysOpen(true)}>
            批量添加
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" className="desk-button" style={{ fontSize: 12 }} onClick={handleEnableAll} disabled={saving}>
            全部启用
          </button>
          <button type="button" className="desk-button" style={{ fontSize: 12 }} onClick={handleDisableAll} disabled={saving}>
            全部禁用
          </button>
        </div>

        {/* Key 列表 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {filteredKeys.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)' }}>
              {keys.length === 0 ? '暂无 API Key，点击"添加 Key"创建' : '没有符合筛选条件的 Key'}
            </div>
          ) : (
            filteredKeys.map((key, index) => (
              <div
                key={key.id}
                className="model-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border)',
                  gap: 12
                }}
              >
                {/* 序号 */}
                <span style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: 'var(--surface-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-2)',
                  flexShrink: 0
                }}>
                  {index + 1}
                </span>

                {/* Key 信息 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {key.name && (
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{key.name}</span>
                    )}
                    <span style={{
                      fontSize: 12,
                      color: 'var(--text-2)',
                      fontFamily: 'monospace',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {key.key.slice(0, 8)}...{key.key.slice(-4)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    {/* 优先级标签 */}
                    <span style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'var(--surface-2)',
                      color: 'var(--text-2)',
                      fontWeight: 600
                    }}>
                      P{key.priority}
                    </span>
                    {/* 状态 */}
                    <span style={{
                      fontSize: 10,
                      color: key.isEnabled ? 'var(--success)' : 'var(--danger)',
                      fontWeight: 500
                    }}>
                      {key.isEnabled ? '已启用' : '已禁用'}
                    </span>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {/* 启用/禁用开关 */}
                  <label className="ios-switch ios-switch-sm" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={key.isEnabled}
                      onChange={() => void handleToggleKey(key.id)}
                    />
                    <span className="ios-slider" />
                  </label>

                  {/* 编辑 */}
                  <button
                    type="button"
                    className="toolbar-icon-btn"
                    title="编辑"
                    onClick={() => handleEditKey(key)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>

                  {/* 删除 */}
                  <button
                    type="button"
                    className="toolbar-icon-btn"
                    title="删除"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => {
                      if (window.confirm('确定要删除这个 Key 吗？')) {
                        void handleDeleteKey(key.id)
                      }
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 底部信息 */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: 12,
          color: 'var(--text-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
          </svg>
          <span>
            {LOAD_BALANCE_STRATEGIES.find(s => s.value === strategy)?.desc}
          </span>
        </div>
      </div>

      {/* 编辑/添加 Key 对话框 */}
      {editKeyOpen && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setEditKeyOpen(false)}>
          <div
            className="modal-surface"
            style={{ width: 400, padding: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                {editingKey ? '编辑 Key' : '添加 Key'}
              </h4>
            </div>
            <div style={{ padding: '16px' }}>
              {/* 别名 */}
              <div style={{ marginBottom: 12 }}>
                <label className="input-label">别名（可选）</label>
                <input
                  className="input-detail"
                  placeholder="例如: 主力 Key"
                  value={editKeyName}
                  onChange={(e) => setEditKeyName(e.target.value)}
                />
              </div>

              {/* Key 值 */}
              <div style={{ marginBottom: 12 }}>
                <label className="input-label">API Key</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input-detail"
                    style={{ paddingRight: 40 }}
                    type={showEditKeyValue ? 'text' : 'password'}
                    placeholder="sk-..."
                    value={editKeyValue}
                    onChange={(e) => setEditKeyValue(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="eye-toggle-btn"
                    onClick={() => setShowEditKeyValue(!showEditKeyValue)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {showEditKeyValue ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              {/* 优先级 */}
              <div style={{ marginBottom: 12 }}>
                <label className="input-label">优先级 (1-10, 1 最高)</label>
                <input
                  className="input-detail"
                  type="number"
                  min={1}
                  max={10}
                  value={editKeyPriority}
                  onChange={(e) => setEditKeyPriority(Math.max(1, Math.min(10, parseInt(e.target.value) || 5)))}
                />
              </div>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="desk-button" onClick={() => setEditKeyOpen(false)}>取消</button>
              <button
                className="desk-button filled"
                disabled={!editKeyValue.trim() || saving}
                onClick={() => void handleSaveKey()}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量添加 Key 对话框 */}
      {addKeysOpen && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setAddKeysOpen(false)}>
          <div
            className="modal-surface"
            style={{ width: 450, padding: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>批量添加 Key</h4>
            </div>
            <div style={{ padding: '16px' }}>
              <label className="input-label">输入多个 API Key（逗号、换行或空格分隔）</label>
              <textarea
                className="input-detail"
                style={{ minHeight: 120, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                placeholder="sk-xxx1
sk-xxx2
sk-xxx3"
                value={addKeysText}
                onChange={(e) => setAddKeysText(e.target.value)}
                autoFocus
              />
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
                将解析 {addKeysText.split(/[,\n\s]+/).filter(s => s.trim()).length} 个 Key
              </div>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="desk-button" onClick={() => setAddKeysOpen(false)}>取消</button>
              <button
                className="desk-button filled"
                disabled={!addKeysText.trim() || saving}
                onClick={() => void handleBatchAddKeys()}
              >
                {saving ? '添加中...' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
