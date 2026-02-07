/**
 * 消息内容解析器
 * 从消息内容中提取图片路径和文档附件标记
 */

/** 文档附件信息 */
export interface DocumentAttachment {
  /** 文件绝对路径 */
  path: string
  /** 文件名 */
  fileName: string
  /** MIME 类型 */
  mime: string
}

/** 解析后的消息内容 */
export interface ParsedMessageContent {
  /** 清理后的纯文本内容 */
  text: string
  /** 提取的图片路径列表 */
  imagePaths: string[]
  /** 提取的文档附件列表 */
  documents: DocumentAttachment[]
}

// 正则表达式
const IMAGE_REGEX = /\[image:([^\]]+)\]/g
const DOCUMENT_REGEX = /\[file:([^|]+)\|([^|]+)\|([^\]]+)\]/g

/**
 * 解析消息内容，提取图片和文档标记
 *
 * 消息格式:
 * - 图片: [image:/path/to/image.jpg]
 * - 文档: [file:path|fileName|mime]
 *
 * @param rawContent 原始消息内容
 * @returns 解析后的内容对象
 */
export function parseMessageContent(rawContent: string): ParsedMessageContent {
  const imagePaths: string[] = []
  const documents: DocumentAttachment[] = []

  // 提取图片路径
  const imageMatches = rawContent.matchAll(IMAGE_REGEX)
  for (const match of imageMatches) {
    const path = match[1]?.trim()
    if (path) {
      imagePaths.push(path)
    }
  }

  // 提取文档附件
  const docMatches = rawContent.matchAll(DOCUMENT_REGEX)
  for (const match of docMatches) {
    const path = match[1]?.trim() ?? ''
    const fileName = match[2]?.trim() ?? ''
    const mime = match[3]?.trim() ?? ''
    if (path) {
      documents.push({ path, fileName, mime })
    }
  }

  // 清理文本内容，移除所有标记
  const cleanText = rawContent
    .replace(IMAGE_REGEX, '')
    .replace(DOCUMENT_REGEX, '')
    .trim()

  return {
    text: cleanText,
    imagePaths,
    documents
  }
}

/**
 * 构建图片标记
 * @param imagePath 图片路径
 */
export function buildImageMarker(imagePath: string): string {
  return `[image:${imagePath}]`
}

/**
 * 构建文档标记
 * @param doc 文档附件信息
 */
export function buildDocumentMarker(doc: DocumentAttachment): string {
  return `[file:${doc.path}|${doc.fileName}|${doc.mime}]`
}

/**
 * 包装 OCR 文本块
 * @param ocrText OCR 提取的文本
 */
export function wrapOcrBlock(ocrText: string): string {
  return `The image_file_ocr tag contains a description of an image that the user uploaded to you, not the user's prompt.
<image_file_ocr>
${ocrText.trim()}
</image_file_ocr>
`
}

/**
 * 包装文档内容块
 * @param fileName 文件名
 * @param content 文档内容
 */
export function wrapDocumentBlock(fileName: string, content: string): string {
  return `<document name="${fileName}">
${content}
</document>`
}
