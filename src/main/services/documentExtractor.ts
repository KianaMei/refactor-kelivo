/**
 * 文档文本提取器
 * 支持 PDF、DOCX、纯文本等格式的文本提取
 */

import * as fs from 'fs'
import * as path from 'path'

// 文档内容缓存
const documentCache = new Map<string, string | null>()

/** 支持的纯文本 MIME 类型 */
const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'text/css',
  'text/javascript',
  'text/xml',
  'application/json',
  'application/xml',
  'application/javascript'
])

/** 支持的纯文本扩展名 */
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.css',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.rs',
  '.go',
  '.rb',
  '.php',
  '.sh',
  '.bash',
  '.zsh',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.log',
  '.csv'
])

/**
 * 提取文档文本内容
 *
 * @param filePath 文件路径
 * @param mime MIME 类型
 * @returns 提取的文本内容，失败返回 null
 */
export async function extractDocumentText(
  filePath: string,
  mime: string
): Promise<string | null> {
  // 跳过视频文件
  if (mime.toLowerCase().startsWith('video/')) {
    return null
  }

  // 检查缓存
  if (documentCache.has(filePath)) {
    return documentCache.get(filePath) ?? null
  }

  try {
    let text: string | null = null

    // 根据 MIME 类型或扩展名选择提取方式
    const ext = path.extname(filePath).toLowerCase()
    const mimeL = mime.toLowerCase()

    if (mimeL === 'application/pdf' || ext === '.pdf') {
      text = await extractPdfText(filePath)
    } else if (
      mimeL === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === '.docx'
    ) {
      text = await extractDocxText(filePath)
    } else if (TEXT_MIME_TYPES.has(mimeL) || TEXT_EXTENSIONS.has(ext)) {
      text = await extractPlainText(filePath)
    } else {
      // 尝试作为纯文本读取
      text = await extractPlainText(filePath)
    }

    // 缓存结果
    documentCache.set(filePath, text)
    return text
  } catch (error) {
    console.error(`Failed to extract text from ${filePath}:`, error)
    documentCache.set(filePath, null)
    return null
  }
}

/**
 * 提取纯文本文件内容
 */
async function extractPlainText(filePath: string): Promise<string | null> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    return content.trim() || null
  } catch {
    return null
  }
}

/**
 * 提取 PDF 文本
 * 使用 pdf-parse 库 (v2.4.5+)
 */
async function extractPdfText(filePath: string): Promise<string | null> {
  try {
    // 动态导入 pdf-parse (可能未安装)
    const { PDFParse } = await import('pdf-parse')
    const buffer = await fs.promises.readFile(filePath)

    // pdf-parse v2.4.5 使用 PDFParse 类
    const parser = new PDFParse({ data: buffer })
    const textResult = await parser.getText()
    await parser.destroy()

    return textResult.text?.trim() || null
  } catch (error) {
    console.error('PDF extraction failed:', error)
    return null
  }
}

/**
 * 提取 DOCX 文本
 * 通过解析 ZIP 中的 word/document.xml
 */
async function extractDocxText(filePath: string): Promise<string | null> {
  try {
    // 动态导入 adm-zip (可能未安装)
    const AdmZip = await import('adm-zip').then((m) => m.default || m)
    const zip = new AdmZip(filePath)
    const documentXml = zip.readAsText('word/document.xml')

    if (!documentXml) {
      return null
    }

    // 简单提取文本: 移除 XML 标签，保留换行
    const text = documentXml
      // 替换段落结束为换行
      .replace(/<\/w:p>/g, '\n')
      // 移除所有 XML 标签
      .replace(/<[^>]+>/g, '')
      // 解码 XML 实体
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      // 清理多余空白
      .replace(/\n\s*\n/g, '\n\n')
      .trim()

    return text || null
  } catch (error) {
    console.error('DOCX extraction failed:', error)
    return null
  }
}

/**
 * 获取缓存的文档内容
 */
export function getCachedDocument(filePath: string): string | null | undefined {
  return documentCache.get(filePath)
}

/**
 * 清空文档缓存
 */
export function clearDocumentCache(): void {
  documentCache.clear()
}

/**
 * 从缓存中移除指定文档
 */
export function removeCachedDocument(filePath: string): boolean {
  return documentCache.delete(filePath)
}

/**
 * 获取缓存大小
 */
export function getDocumentCacheSize(): number {
  return documentCache.size
}

/**
 * 批量提取文档文本 (带缓存)
 *
 * @param docs 文档列表
 * @returns 文档路径到文本的映射
 */
export async function extractDocumentsText(
  docs: Array<{ path: string; mime: string }>
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>()

  await Promise.all(
    docs.map(async (doc) => {
      const text = await extractDocumentText(doc.path, doc.mime)
      results.set(doc.path, text)
    })
  )

  return results
}
