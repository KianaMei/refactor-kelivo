// 模型相关类型定义
export type ModelType = 'chat' | 'embedding'
export type Modality = 'text' | 'image'
export type ModelAbility = 'tool' | 'reasoning'

export interface ModelOverride {
  name?: string
  type?: ModelType
  input?: Modality[]
  output?: Modality[]
  abilities?: ModelAbility[]
  headers?: Array<{ name: string; value: string }>
  body?: Array<{ key: string; value: string }>
  tools?: { search?: boolean; urlContext?: boolean }
}

// 负载均衡策略选项
export const LOAD_BALANCE_STRATEGIES: { value: string; label: string; desc: string }[] = [
  { value: 'roundRobin', label: '轮询', desc: '按顺序循环使用所有 Key' },
  { value: 'priority', label: '优先级', desc: '优先使用高优先级的 Key' },
  { value: 'leastUsed', label: '最少使用', desc: '优先使用调用次数最少的 Key' },
  { value: 'random', label: '随机', desc: '随机选择可用的 Key' },
]
