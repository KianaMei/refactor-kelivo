/**
 * Token 工具函数
 * 提供 Token 估算、修复和合并功能
 */

import type { TokenUsage } from './chatStream'

/** 扩展的 Token 使用统计 */
export interface TokenUsageExtended extends TokenUsage {
  /** 思考/推理 Token 数 */
  thoughtTokens?: number
  /** 工具调用轮数 */
  rounds?: number
}

/**
 * 估算或修复 Token 使用量
 *
 * 当 API 未返回 token 使用信息，或返回的 promptTokens/completionTokens 为 0 时，
 * 使用字符数 / 4 的近似公式进行估算
 *
 * @param params 参数
 * @returns 估算或修复后的 TokenUsage，如果无法估算返回 null
 */
export function estimateOrFixTokenUsage(params: {
  /** API 返回的原始 usage */
  usage: TokenUsage | null
  /** 发送给 API 的消息列表 */
  apiMessages: Array<{ content?: string | unknown }>
  /** 响应内容 */
  responseContent: string
}): TokenUsage | null {
  const { usage, apiMessages, responseContent } = params

  // 计算输入字符数
  const calculatePromptChars = (): number => {
    return apiMessages.reduce((acc, m) => {
      const content = m.content
      if (typeof content === 'string') {
        return acc + content.length
      }
      return acc
    }, 0)
  }

  // 如果完全没有 usage，进行估算
  if (!usage && (responseContent || apiMessages.length > 0)) {
    const promptChars = calculatePromptChars()
    const approxPromptTokens = Math.round(promptChars / 4)
    const approxCompletionTokens = Math.round(responseContent.length / 4)

    return {
      promptTokens: approxPromptTokens,
      completionTokens: approxCompletionTokens,
      totalTokens: approxPromptTokens + approxCompletionTokens
    }
  }

  // 如果有 usage 但某些值为 0，进行修复
  if (usage && (usage.promptTokens === 0 || usage.completionTokens === 0)) {
    let fixedPromptTokens = usage.promptTokens
    let fixedCompletionTokens = usage.completionTokens

    // 修复 promptTokens
    if (fixedPromptTokens === 0 && apiMessages.length > 0) {
      const promptChars = calculatePromptChars()
      fixedPromptTokens = Math.round(promptChars / 4)
    }

    // 修复 completionTokens
    if (fixedCompletionTokens === 0 && responseContent) {
      fixedCompletionTokens = Math.round(responseContent.length / 4)
    }

    const cachedTokens = usage.cachedTokens ?? 0

    return {
      promptTokens: fixedPromptTokens,
      completionTokens: fixedCompletionTokens,
      cachedTokens,
      totalTokens: fixedPromptTokens + fixedCompletionTokens + cachedTokens
    }
  }

  return usage
}

/**
 * 合并多轮 Token 使用统计
 *
 * 用于工具调用场景，需要累加多轮的 token 使用
 *
 * @param usages Token 使用统计数组
 * @returns 合并后的统计
 */
export function mergeTokenUsages(usages: TokenUsage[]): TokenUsageExtended {
  if (usages.length === 0) {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      rounds: 0
    }
  }

  let totalPromptTokens = 0
  let totalCompletionTokens = 0
  let totalCachedTokens = 0

  for (const usage of usages) {
    totalPromptTokens += usage.promptTokens
    totalCompletionTokens += usage.completionTokens
    totalCachedTokens += usage.cachedTokens ?? 0
  }

  return {
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
    cachedTokens: totalCachedTokens > 0 ? totalCachedTokens : undefined,
    totalTokens: totalPromptTokens + totalCompletionTokens + totalCachedTokens,
    rounds: usages.length
  }
}

/**
 * 累加 Token 使用统计
 *
 * @param current 当前统计
 * @param additional 新增统计
 * @returns 累加后的统计
 */
export function addTokenUsage(
  current: TokenUsage | null,
  additional: TokenUsage
): TokenUsageExtended {
  if (!current) {
    return {
      ...additional,
      rounds: 1
    }
  }

  const currentExt = current as TokenUsageExtended

  return {
    promptTokens: current.promptTokens + additional.promptTokens,
    completionTokens: current.completionTokens + additional.completionTokens,
    cachedTokens: (current.cachedTokens ?? 0) + (additional.cachedTokens ?? 0) || undefined,
    totalTokens: current.totalTokens + additional.totalTokens,
    rounds: (currentExt.rounds ?? 1) + 1
  }
}

/**
 * 格式化 Token 数量为可读字符串
 *
 * @param tokens Token 数量
 * @returns 格式化字符串（如 "1.2K", "3.5M"）
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) {
    return String(tokens)
  }
  if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}K`
  }
  return `${(tokens / 1000000).toFixed(1)}M`
}

/**
 * 格式化 TokenUsage 为可读字符串
 *
 * @param usage Token 使用统计
 * @returns 格式化字符串
 */
export function formatTokenUsage(usage: TokenUsage | null): string {
  if (!usage) {
    return '-'
  }

  const parts: string[] = []

  parts.push(`↑${formatTokenCount(usage.promptTokens)}`)
  parts.push(`↓${formatTokenCount(usage.completionTokens)}`)

  if (usage.cachedTokens && usage.cachedTokens > 0) {
    parts.push(`⚡${formatTokenCount(usage.cachedTokens)}`)
  }

  return parts.join(' ')
}

/**
 * 创建空的 TokenUsage
 */
export function emptyTokenUsage(): TokenUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  }
}
