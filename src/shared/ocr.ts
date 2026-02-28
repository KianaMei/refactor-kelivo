/**
 * OCR related types shared between main and renderer
 */

export const OCR_CHANNELS = {
    /** 执行 OCR */
    RUN: 'ocr:run',
    /** 获取缓存 */
    GET_CACHED: 'ocr:getCached',
    /** 设置缓存 */
    SET_CACHE: 'ocr:setCache',
    /** 清空缓存 */
    CLEAR_CACHE: 'ocr:clearCache',
    /** 获取缓存大小 */
    GET_CACHE_SIZE: 'ocr:getCacheSize'
} as const

/** OCR 执行请求参数 */
export interface OcrRunRequest {
    /** 图片路径列表 */
    imagePaths: string[]
    /** Provider ID (可选，默认使用配置的 OCR provider) */
    providerId?: string
    /** 模型 ID (可选，默认使用配置的 OCR 模型) */
    modelId?: string
    /** OCR 提示词 (可选) */
    prompt?: string
    /** 是否使用缓存 */
    useCache?: boolean
}

/** OCR 执行结果 */
export interface OcrRunResult {
    success: boolean
    text?: string
    error?: string
}

/** 包装 OCR 文本为结构化块 */
export function wrapOcrBlock(ocrText: string): string {
    return `The image_file_ocr tag contains a description of an image that the user uploaded to you, not the user's prompt.
<image_file_ocr>
${ocrText.trim()}
</image_file_ocr>
`
}
