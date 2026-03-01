import { useMemo, useState } from 'react'
import { ChevronDown, RotateCcw, Sliders, Sparkles } from 'lucide-react'

import type { AssistantConfig, ProviderConfigV2 } from '../../../../../../shared/types'
import { ModelPickerModal } from '../ModelPickerModal'
import { CustomSelect } from '../../../../components/ui/CustomSelect'
import { LabeledRow, RowDivider, SliderRow } from './FormRows'

export function ModelTab(props: {
  assistant: AssistantConfig
  providers: ProviderConfigV2[]
  onPatch: (patch: Partial<AssistantConfig>) => void
}) {
  const { assistant, providers, onPatch } = props

  const [pickerOpen, setPickerOpen] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const providerName = useMemo(() => {
    if (!assistant.boundModelProvider) return '（使用全局默认）'
    return providers.find((p) => p.id === assistant.boundModelProvider)?.name ?? assistant.boundModelProvider
  }, [assistant.boundModelProvider, providers])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Sparkles size={14} />
        <div style={{ fontWeight: 700 }}>模型绑定</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
        为此助手指定专用模型，不设置则使用全局默认
      </div>

      <LabeledRow label="供应商">
        <CustomSelect
          value={assistant.boundModelProvider ?? ''}
          onChange={(val) => {
            const v = val || null
            onPatch({ boundModelProvider: v, boundModelId: null })
          }}
          options={[
            { value: '', label: '（使用全局默认）' },
            ...providers.map(p => ({ value: p.id, label: p.name }))
          ]}
          className="input"
          width={240}
        />
      </LabeledRow>

      <RowDivider />

      <LabeledRow label="模型">
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minWidth: 240, textAlign: 'left', justifyContent: 'flex-start' }}
          disabled={!assistant.boundModelProvider}
          onClick={() => setPickerOpen((v) => !v)}
        >
          {assistant.boundModelId ?? '选择模型'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: '6px 10px' }}
          disabled={!assistant.boundModelProvider}
          onClick={() => setPickerOpen((v) => !v)}
        >
          获取
        </button>
      </LabeledRow>

      <RowDivider />

      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: '100%', justifyContent: 'space-between', padding: '10px 4px' }}
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sliders size={14} />
          参数覆盖
        </div>
        <ChevronDown
          size={14}
          style={{ transform: showAdvanced ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }}
        />
      </button>

      {showAdvanced && (
        <div style={{ padding: '8px 4px', background: 'var(--surface)', borderRadius: 8, marginTop: 4 }}>
          <SliderRow
            label="温度 (Temperature)"
            value={assistant.temperature ?? 0.7}
            min={0}
            max={2}
            step={0.1}
            onChange={(v) => onPatch({ temperature: v })}
          />
          <RowDivider />
          <SliderRow
            label="Top P"
            value={assistant.topP ?? 1}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => onPatch({ topP: v })}
          />
          <RowDivider />
          <LabeledRow label="最大输出 Token">
            <input
              type="number"
              className="input"
              style={{ width: 120 }}
              value={assistant.maxTokens ?? ''}
              placeholder="自动"
              onChange={(e) => {
                const v = e.target.value ? parseInt(e.target.value, 10) : undefined
                onPatch({ maxTokens: v })
              }}
            />
          </LabeledRow>
          <RowDivider />
          <LabeledRow label="工具循环上限">
            <input
              type="number"
              className="input"
              style={{ width: 120 }}
              value={assistant.maxToolLoopIterations ?? 10}
              onChange={(e) => onPatch({ maxToolLoopIterations: Math.max(0, parseInt(e.target.value || '0', 10)) })}
            />
          </LabeledRow>
          <RowDivider />
          <LabeledRow label="限制上下文">
            <button
              type="button"
              className={`toggle ${assistant.limitContextMessages ? 'toggleOn' : ''}`}
              onClick={() => onPatch({ limitContextMessages: !assistant.limitContextMessages })}
            >
              <div className="toggleThumb" />
            </button>
          </LabeledRow>
          {assistant.limitContextMessages && (
            <>
              <RowDivider />
              <LabeledRow label="保留最近消息数">
                <input
                  type="number"
                  className="input"
                  style={{ width: 120 }}
                  value={assistant.contextMessageSize}
                  onChange={(e) => onPatch({ contextMessageSize: Math.max(0, Math.min(512, parseInt(e.target.value || '0', 10))) })}
                />
              </LabeledRow>
            </>
          )}
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => onPatch({ temperature: undefined, topP: undefined, maxTokens: undefined })}
              style={{ gap: 4 }}
            >
              <RotateCcw size={12} />
              重置为默认
            </button>
          </div>
        </div>
      )}

      <ModelPickerModal
        open={pickerOpen}
        providerId={assistant.boundModelProvider}
        activeModelId={assistant.boundModelId}
        onClose={() => setPickerOpen(false)}
        onSelect={(modelId) => onPatch({ boundModelId: modelId })}
      />

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        当前：{providerName}{assistant.boundModelId ? ` / ${assistant.boundModelId}` : ''}
      </div>
    </div>
  )
}

