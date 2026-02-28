/**
 * 模型选择弹出层
 * 对齐 Flutter Kelivo 的 model_select_sheet.dart
 * 包括：供应商标签页、模型搜索、模型列表（含类型/模态标签）、收藏功能
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Search,
  Check,
  Heart,
  ChevronRight,
  Type,
  Image,
  Hammer,
  Sparkles
} from 'lucide-react'
import type { ProviderConfigV2 } from '../../../shared/types'
import { getBrandColor } from '../utils/brandAssets'
import { BrandAvatar } from '../pages/settings/providers/components/BrandAvatar'

// 模糊匹配算法 (Subsequence Match)
// 允许 "gt" 匹配 "gpt"
function fuzzyMatch(text: string, query: string) {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  let i = 0, j = 0
  while (i < t.length && j < q.length) {
    if (t[i] === q[j]) {
      j++
    }
    i++
  }
  return j === q.length
}

interface Props {
  providers: ProviderConfigV2[]
  currentProviderId?: string
  currentModelId?: string
  onSelect: (providerId: string, modelId: string) => void
  onClose: () => void
}

// 模型能力推断
interface ModelMeta {
  type: 'chat' | 'embedding'
  inputModality: ('text' | 'image')[]
  outputModality: ('text' | 'image')[]
  abilities: ('tool' | 'reasoning')[]
}

function inferModelMeta(modelId: string, provider?: ProviderConfigV2): ModelMeta {
  const id = modelId.toLowerCase()

  // 默认值
  const meta: ModelMeta = {
    type: 'chat',
    inputModality: ['text'],
    outputModality: ['text'],
    abilities: []
  }

  const ov = provider?.modelOverrides?.[modelId] as Record<string, unknown> | undefined
  if (ov) {
    if (ov.type === 'chat' || ov.type === 'embedding') meta.type = ov.type
    if (Array.isArray(ov.input)) meta.inputModality = ov.input as ModelMeta['inputModality']
    if (Array.isArray(ov.output)) meta.outputModality = ov.output as ModelMeta['outputModality']
    if (Array.isArray(ov.abilities)) meta.abilities = ov.abilities as ModelMeta['abilities']
    return meta
  }

  // 嵌入模型
  if (id.includes('embed') || id.includes('ada') || id.includes('voyage')) {
    meta.type = 'embedding'
    return meta
  }

  // 视觉模型
  if (id.includes('vision') || id.includes('4o') || id.includes('gpt-4-turbo') ||
    id.includes('gemini') || id.includes('claude-3') || id.includes('claude-4') ||
    id.includes('qwen-vl') || id.includes('glm-4v')) {
    meta.inputModality = ['text', 'image']
  }

  // 图像生成
  if (id.includes('dall-e') || id.includes('imagen') || id.includes('midjourney') ||
    id.includes('stable-diffusion') || id.includes('flux')) {
    meta.outputModality = ['image']
  }

  // 推理能力
  if (id.includes('o1') || id.includes('o3') || id.includes('thinking') ||
    id.includes('reasoning') || id.includes('deepseek-r') || id.includes('qwq')) {
    meta.abilities.push('reasoning')
  }

  // 工具调用能力（大多数现代模型都支持）
  if (id.includes('gpt-4') || id.includes('gpt-3.5') || id.includes('claude') ||
    id.includes('gemini') || id.includes('qwen') || id.includes('glm') ||
    id.includes('deepseek') || id.includes('mistral') || id.includes('llama')) {
    meta.abilities.push('tool')
  }

  return meta
}

export function ModelSelectPopover(props: Props) {
  const { providers, currentProviderId, currentModelId, onSelect, onClose } = props

  const [selectedProviderId, setSelectedProviderId] = useState(currentProviderId || providers[0]?.id || '')
  const [searchQuery, setSearchQuery] = useState('')
  const [pinnedModels, setPinnedModels] = useState<Set<string>>(new Set())

  // 拖拽滚动状态
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  const tabsRef = useRef<HTMLDivElement>(null)

  // 自动滚动到选中的供应商
  useEffect(() => {
    if (tabsRef.current) {
      const activeBtn = tabsRef.current.querySelector('.modelSelectProviderChip.active') as HTMLElement
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' })
      }
    }
  }, [selectedProviderId])

  const selectedProvider = providers.find((p) => p.id === selectedProviderId)

  // 直接使用供应商配置中的 models 字段，不从 API 拉取
  const models = selectedProvider?.models ?? []

  // 过滤模型 (仅用于当前供应商模式)
  const filteredModels = useMemo(() => {
    // 搜索模式下，这个变量仅用于 fallback 或非搜索状态
    if (searchQuery) return []
    return models
  }, [models, searchQuery])

  // === 全局搜索逻辑 ===
  const searchResults = useMemo(() => {
    const q = searchQuery.trim()
    if (!q) return null // 非搜索模式

    const results: { provider: ProviderConfigV2; models: string[] }[] = []

    for (const p of providers) {
      if (!p.models || p.models.length === 0) continue
      // 使用模糊匹配
      const matched = p.models.filter(m => fuzzyMatch(m, q))
      if (matched.length > 0) {
        results.push({ provider: p, models: matched })
      }
    }
    return results
  }, [providers, searchQuery])

  // 收藏的模型
  const favoriteModels = useMemo(() => {
    return filteredModels.filter((m: string) => pinnedModels.has(`${selectedProviderId}::${m}`))
  }, [filteredModels, pinnedModels, selectedProviderId])

  // 非收藏的模型
  const regularModels = useMemo(() => {
    return filteredModels.filter((m: string) => !pinnedModels.has(`${selectedProviderId}::${m}`))
  }, [filteredModels, pinnedModels, selectedProviderId])

  function handleSelectModel(modelId: string) {
    onSelect(selectedProviderId, modelId)
    onClose()
  }

  function handleTogglePin(modelId: string, e: React.MouseEvent) {
    e.stopPropagation()
    const key = `${selectedProviderId}::${modelId}`
    setPinnedModels((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // 滚轮切换供应商
  const wheelAccumulator = useRef(0)
  function handleWheel(e: React.WheelEvent) {
    // 累积滚动距离
    wheelAccumulator.current += e.deltaY

    // 阈值设为 100 (匹配常规鼠标滚轮一格的行程)
    const THRESHOLD = 100

    // 只要累积超过阈值，就触发一次切换
    if (Math.abs(wheelAccumulator.current) < THRESHOLD) return

    const direction = wheelAccumulator.current > 0 ? 1 : -1

    // === 核心修正：严格逐个切换 ===
    // 1. 每次判定只走 1 步 (direction)
    // 2. 触发后立即清空累积器 (wheelAccumulator.current = 0)
    //    这会丢弃"多余"的动量，防止一次快速滚动导致连续跳多格
    //    实现"滚轮动一下，只切一个"的严格对应关系
    wheelAccumulator.current = 0

    const currentIndex = providers.findIndex((p) => p.id === selectedProviderId)
    if (currentIndex === -1) return

    let nextIndex = currentIndex + direction

    // 边界限制
    if (nextIndex < 0) nextIndex = 0
    if (nextIndex >= providers.length) nextIndex = providers.length - 1

    // 只有索引实际改变时才更新，减少无效渲染
    if (nextIndex !== currentIndex) {
      setSelectedProviderId(providers[nextIndex].id)
    }
  }

  // 拖拽滚动处理
  function handleMouseDown(e: React.MouseEvent) {
    if (!tabsRef.current) return
    setIsDragging(true)
    setStartX(e.pageX - tabsRef.current.offsetLeft)
    setScrollLeft(tabsRef.current.scrollLeft)
  }

  function handleMouseLeave() {
    setIsDragging(false)
  }

  function handleMouseUp() {
    setIsDragging(false)
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging || !tabsRef.current) return
    e.preventDefault()
    const x = e.pageX - tabsRef.current.offsetLeft
    const walk = (x - startX) * 2 // 滚动速度系数
    tabsRef.current.scrollLeft = scrollLeft - walk
  }

  // 渲染模型标签
  function renderModelTags(meta: ModelMeta) {
    return (
      <div className="modelTagsWrap">
        {/* 类型标签 */}
        <span className="modelTag modelTagType">
          {meta.type === 'chat' ? '对话' : '嵌入'}
        </span>

        {/* 模态标签 */}
        <span className="modelTag modelTagModality">
          {meta.inputModality.map((m, i) => (
            <span key={`in-${i}`} className="modelTagIcon">
              {m === 'text' ? <Type size={10} /> : <Image size={10} />}
            </span>
          ))}
          <ChevronRight size={10} className="modelTagArrow" />
          {meta.outputModality.map((m, i) => (
            <span key={`out-${i}`} className="modelTagIcon">
              {m === 'text' ? <Type size={10} /> : <Image size={10} />}
            </span>
          ))}
        </span>

        {/* 能力标签 */}
        {meta.abilities.includes('tool') && (
          <span className="modelTag modelTagAbility" title="工具调用">
            <Hammer size={10} />
          </span>
        )}
        {meta.abilities.includes('reasoning') && (
          <span className="modelTag modelTagReasoning" title="深度推理">
            <Sparkles size={10} />
          </span>
        )}
      </div>
    )
  }

  // 渲染模型项 (支持传入特定 providerId，默认为当前选中)
  function renderModelItem(modelId: string, providerId: string = selectedProviderId) {
    const isSelected = providerId === currentProviderId && modelId === currentModelId
    const isPinned = pinnedModels.has(`${providerId}::${modelId}`)
    const provider = providers.find((p) => p.id === providerId)
    const meta = inferModelMeta(modelId, provider)

    return (
      <button
        key={`${providerId}-${modelId}`}
        type="button"
        className={`modelSelectItem ${isSelected ? 'active' : ''}`}
        onClick={() => {
          onSelect(providerId, modelId)
          onClose()
        }}
      >
        {/* 模型头像 */}
        <BrandAvatar name={modelId} size={40} square />

        {/* 模型信息 */}
        <div className="modelItemInfo">
          <div className="modelItemName">{modelId}</div>
          {renderModelTags(meta)}
        </div>

        {/* 操作按钮 */}
        <div className="modelItemActions">
          {isSelected && <Check size={14} className="modelItemCheck" />}
          <button
            type="button"
            className={`modelItemPin ${isPinned ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              const key = `${providerId}::${modelId}`
              setPinnedModels((prev) => {
                const next = new Set(prev)
                if (next.has(key)) {
                  next.delete(key)
                } else {
                  next.add(key)
                }
                return next
              })
            }}
            title={isPinned ? '取消收藏' : '收藏'}
          >
            <Heart size={14} fill={isPinned ? 'currentColor' : 'none'} />
          </button>
        </div>
      </button>
    )
  }

  return (
    <div className="modelSelectPopover" style={{ width: 600, minWidth: 300 }}>
      {/* 搜索框 */}
      <div className="modelSelectSearch">
        <Search size={14} className="modelSelectSearchIcon" />
        <input
          type="text"
          className="modelSelectSearchInput"
          placeholder="搜索模型..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
        <span className="modelSelectSearchCount">
          {searchResults
            ? searchResults.reduce((acc, cur) => acc + cur.models.length, 0)
            : models.length}
        </span>
      </div>

      {/* 搜索模式：显示分组列表 */}
      {searchResults ? (
        <div className="modelSelectList">
          {searchResults.length === 0 ? (
            <div className="modelSelectEmpty">无匹配模型</div>
          ) : (
            searchResults.map(group => (
              <div key={group.provider.id} className="modelSelectSection">
                <div className="modelSelectSectionTitle" style={{ marginTop: 8, marginBottom: 4 }}>
                  <BrandAvatar
                    name={group.provider.name}
                    size={16}
                    customAvatarPath={group.provider.customAvatarPath}
                    square
                  />
                  <span style={{ marginLeft: 6 }}>{group.provider.name}</span>
                </div>
                {group.models.map(m => renderModelItem(m, group.provider.id))}
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {/* 供应商标签页 (非搜索模式下显示) */}
          <div
            ref={tabsRef}
            className="modelSelectProviders"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            {providers.map((p) => {
              const isActive = selectedProviderId === p.id
              // 用多个候选匹配品牌色
              const brandKey = [p.name, p.id, p.baseUrl].find((c) => getBrandColor(c) !== 'var(--primary)') || p.name
              const color = getBrandColor(brandKey)
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`modelSelectProviderChip ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedProviderId(p.id)}
                  style={isActive ? {
                    backgroundColor: `${color}18`,
                    borderColor: `${color}40`
                  } : undefined}
                >
                  <BrandAvatar
                    name={p.name}
                    size={32}
                    customAvatarPath={p.customAvatarPath}
                    square
                  />
                  <span className="providerChipName">{p.name}</span>
                </button>
              )
            })}
          </div>

          {/* 模型列表 (当前供应商) */}
          <div className="modelSelectList">
            {models.length === 0 ? (
              <div className="modelSelectEmpty">无可用模型</div>
            ) : (
              <>
                {/* 收藏的模型 */}
                {favoriteModels.length > 0 && (
                  <div className="modelSelectSection">
                    <div className="modelSelectSectionTitle">
                      <Heart size={12} />
                      <span>收藏</span>
                    </div>
                    {favoriteModels.map(m => renderModelItem(m))}
                  </div>
                )}

                {/* 所有模型 */}
                {regularModels.length > 0 && (
                  <div className="modelSelectSection">
                    {favoriteModels.length > 0 && (
                      <div className="modelSelectSectionTitle">
                        <span>全部</span>
                      </div>
                    )}
                    {regularModels.map(m => renderModelItem(m))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
