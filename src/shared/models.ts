export interface ModelsListParams {
  providerId: string
}

export interface ModelsTestFetchParams {
  providerType: string
  baseUrl: string
  apiKey: string
}

// 模型类型
export type ModelType = 'chat' | 'embedding'

// 输入/输出模态
export type Modality = 'text' | 'image'

// 模型能力
export type ModelAbility = 'tool' | 'reasoning'

// 模型信息
export interface ModelInfo {
  id: string
  displayName: string
  type: ModelType
  input: Modality[]
  output: Modality[]
  abilities: ModelAbility[]
}

export interface ModelsListResult {
  providerId: string
  models: string[]
  // 新增：带能力信息的模型列表
  modelInfos?: ModelInfo[]
}

