/**
 * XML Tag Extractor for Streaming Tool Use Detection
 *
 * 从流式模型输出中提取 `<tool_use>` 标签，处理标签跨多个 chunk 的情况。
 * 对齐 Flutter 版 xml_tag_extractor.dart
 */

export interface TagExtractionResult {
  content: string
  isTagContent: boolean
}

export interface ParsedToolUse {
  id: string
  name: string
  arguments: Record<string, unknown>
}

let _toolUseIdCounter = 0

export class XmlTagExtractor {
  private static readonly OPENING_TAG = '<tool_use>'
  private static readonly CLOSING_TAG = '</tool_use>'

  private buffer = ''
  private insideTag = false

  /** 处理一个流式文本 chunk，返回提取结果列表 */
  processChunk(chunk: string): TagExtractionResult[] {
    const results: TagExtractionResult[] = []
    this.buffer += chunk

    while (this.buffer.length > 0) {
      if (this.insideTag) {
        const closeIndex = this.buffer.indexOf(XmlTagExtractor.CLOSING_TAG)
        if (closeIndex !== -1) {
          const tagContent = this.buffer.substring(0, closeIndex)
          results.push({ content: tagContent, isTagContent: true })
          this.buffer = this.buffer.substring(closeIndex + XmlTagExtractor.CLOSING_TAG.length)
          this.insideTag = false
        } else {
          // 可能包含部分 closing tag，等待更多数据
          break
        }
      } else {
        const openIndex = this.buffer.indexOf(XmlTagExtractor.OPENING_TAG)
        if (openIndex !== -1) {
          if (openIndex > 0) {
            results.push({ content: this.buffer.substring(0, openIndex), isTagContent: false })
          }
          this.buffer = this.buffer.substring(openIndex + XmlTagExtractor.OPENING_TAG.length)
          this.insideTag = true
        } else {
          const partialIndex = this.findPartialTagStart(this.buffer, XmlTagExtractor.OPENING_TAG)
          if (partialIndex !== -1) {
            if (partialIndex > 0) {
              results.push({ content: this.buffer.substring(0, partialIndex), isTagContent: false })
              this.buffer = this.buffer.substring(partialIndex)
            }
            break
          } else {
            results.push({ content: this.buffer, isTagContent: false })
            this.buffer = ''
          }
        }
      }
    }

    return results
  }

  reset(): void {
    this.buffer = ''
    this.insideTag = false
  }

  /** 在 buffer 末尾查找 tag 的部分匹配起始位置 */
  private findPartialTagStart(buffer: string, tag: string): number {
    for (let i = 1; i < tag.length && i <= buffer.length; i++) {
      const suffix = buffer.substring(buffer.length - i)
      if (tag.startsWith(suffix)) {
        return buffer.length - i
      }
    }
    return -1
  }

  /**
   * 解析 tool_use 标签内容为 ParsedToolUse 对象
   *
   * 期望格式:
   * ```xml
   *   <name>tool_name</name>
   *   <arguments>{"key": "value"}</arguments>
   * ```
   */
  static parseToolUse(xmlContent: string): ParsedToolUse | null {
    try {
      const nameMatch = xmlContent.match(/<name>\s*([\s\S]*?)\s*<\/name>/)
      if (!nameMatch) return null
      const name = nameMatch[1].trim()
      if (!name) return null

      const argsMatch = xmlContent.match(/<arguments>\s*([\s\S]*?)\s*<\/arguments>/)
      let args: Record<string, unknown> = {}
      if (argsMatch) {
        const argsStr = argsMatch[1].trim() || '{}'
        try {
          const decoded = JSON.parse(argsStr)
          if (typeof decoded === 'object' && decoded !== null && !Array.isArray(decoded)) {
            args = decoded as Record<string, unknown>
          }
        } catch {
          args = {}
        }
      }

      _toolUseIdCounter++
      return {
        id: `prompt_tool_${_toolUseIdCounter}`,
        name,
        arguments: args
      }
    } catch {
      return null
    }
  }
}

/** 将 ParsedToolUse 序列化回 XML 字符串 */
export function toolUseToXml(parsed: ParsedToolUse): string {
  return `<tool_use>\n  <name>${parsed.name}</name>\n  <arguments>${JSON.stringify(parsed.arguments)}</arguments>\n</tool_use>`
}
