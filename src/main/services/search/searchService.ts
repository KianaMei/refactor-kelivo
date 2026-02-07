/**
 * 搜索服务基类和类型定义
 */

/** 搜索结果项 */
export interface SearchResultItem {
  /** 标题 */
  title: string
  /** URL */
  url: string
  /** 摘要/片段 */
  text: string
  /** 可选的唯一标识 */
  id?: string
  /** 结果索引 */
  index?: number
}

/** 搜索结果 */
export interface SearchResult {
  /** 可选的答案摘要 (某些 API 如 Perplexity 会返回) */
  answer?: string
  /** 搜索结果列表 */
  items: SearchResultItem[]
}

/** 搜索选项 */
export interface SearchOptions {
  /** 结果数量限制 */
  resultSize?: number
  /** 超时时间 (毫秒) */
  timeout?: number
}

/** 搜索服务配置基类 */
export interface SearchServiceConfig {
  /** 配置 ID */
  id: string
  /** 服务类型 */
  type: string
}

/**
 * 搜索服务抽象基类
 */
export abstract class SearchService {
  /** 服务名称 */
  abstract readonly name: string

  /** 服务类型标识 */
  abstract readonly type: string

  /**
   * 执行搜索
   *
   * @param query 搜索查询
   * @param options 搜索选项
   * @returns 搜索结果
   */
  abstract search(query: string, options?: SearchOptions): Promise<SearchResult>

  /**
   * 检查服务是否可用（配置是否完整）
   */
  abstract isAvailable(): boolean
}

/** 默认搜索选项 */
export const DEFAULT_SEARCH_OPTIONS: Required<SearchOptions> = {
  resultSize: 10,
  timeout: 10000
}

/**
 * 合并搜索选项
 */
export function mergeSearchOptions(options?: SearchOptions): Required<SearchOptions> {
  return {
    ...DEFAULT_SEARCH_OPTIONS,
    ...options
  }
}

/**
 * 格式化搜索结果为 Markdown
 */
export function formatSearchResultsMarkdown(result: SearchResult): string {
  const lines: string[] = []

  if (result.answer) {
    lines.push('## Answer')
    lines.push(result.answer)
    lines.push('')
  }

  lines.push('## Search Results')
  lines.push('')

  result.items.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.title}`)
    lines.push(`- URL: ${item.url}`)
    lines.push(`- ${item.text}`)
    lines.push('')
  })

  return lines.join('\n')
}

/**
 * 格式化搜索结果为 XML（用于 LLM 上下文）
 */
export function formatSearchResultsXml(result: SearchResult): string {
  const lines: string[] = []

  lines.push('<search_results>')

  if (result.answer) {
    lines.push(`  <answer>${escapeXml(result.answer)}</answer>`)
  }

  result.items.forEach((item, index) => {
    lines.push(`  <result index="${index + 1}">`)
    lines.push(`    <title>${escapeXml(item.title)}</title>`)
    lines.push(`    <url>${escapeXml(item.url)}</url>`)
    lines.push(`    <snippet>${escapeXml(item.text)}</snippet>`)
    lines.push('  </result>')
  })

  lines.push('</search_results>')

  return lines.join('\n')
}

/**
 * XML 转义
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 搜索工具定义 (用于 function calling) */
export const SEARCH_TOOL_DEFINITION = {
  type: 'function' as const,
  function: {
    name: 'web_search',
    description: 'Search the web for information. Use this when you need up-to-date information or facts you are not certain about.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        }
      },
      required: ['query']
    }
  }
}
