/**
 * 品牌资源工具
 * 对齐 Flutter Kelivo 的 brand_assets.dart
 * 提供模型/供应商的图标和颜色映射
 */

// 品牌图标映射
const BRAND_ICON_MAPPING: Array<{ pattern: RegExp; icon: string }> = [
  { pattern: /openai|gpt|o\d/i, icon: 'openai.svg' },
  { pattern: /gemini/i, icon: 'gemini-color.svg' },
  { pattern: /google/i, icon: 'google-color.svg' },
  { pattern: /claude/i, icon: 'claude-color.svg' },
  { pattern: /anthropic/i, icon: 'anthropic.svg' },
  { pattern: /deepseek/i, icon: 'deepseek-color.svg' },
  { pattern: /grok/i, icon: 'grok.svg' },
  { pattern: /xai/i, icon: 'xai.svg' },
  { pattern: /qwen|qwq|qvq/i, icon: 'qwen-color.svg' },
  { pattern: /alibaba|aliyun|tongyi/i, icon: 'alibabacloud-color.svg' },
  { pattern: /mistral/i, icon: 'mistral-color.svg' },
  { pattern: /llama|meta/i, icon: 'meta-color.svg' },
  { pattern: /zhipu|glm|chatglm/i, icon: 'zhipu-color.svg' },
  { pattern: /moonshot|kimi/i, icon: 'kimi-color.svg' },
  { pattern: /minimax/i, icon: 'minimax-color.svg' },
  { pattern: /doubao|bytedance/i, icon: 'doubao-color.svg' },
  { pattern: /hunyuan|tencent/i, icon: 'hunyuan-color.svg' },
  { pattern: /cohere/i, icon: 'cohere-color.svg' },
  { pattern: /perplexity/i, icon: 'perplexity-color.svg' },
  { pattern: /ollama/i, icon: 'ollama.svg' },
  { pattern: /openrouter/i, icon: 'openrouter.svg' },
  { pattern: /siliconflow/i, icon: 'siliconflow-color.svg' },
  { pattern: /stepfun/i, icon: 'stepfun-color.svg' },
  { pattern: /internlm/i, icon: 'internlm-color.svg' },
  { pattern: /gemma/i, icon: 'gemma-color.svg' },
  { pattern: /codex/i, icon: 'codex.svg' },
  { pattern: /sora/i, icon: 'sora-color.svg' },
  { pattern: /cloudflare/i, icon: 'cloudflare-color.svg' },
  { pattern: /jina/i, icon: 'jina-color.svg' },
]

// 品牌颜色映射
const BRAND_COLORS: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#d97757',
  claude: '#d97757',
  google: '#4285f4',
  gemini: '#4285f4',
  deepseek: '#4d6bfe',
  qwen: '#6366f1',
  alibaba: '#ff6a00',
  mistral: '#f97316',
  meta: '#0668e1',
  llama: '#0668e1',
  zhipu: '#2563eb',
  glm: '#2563eb',
  moonshot: '#8b5cf6',
  kimi: '#8b5cf6',
  baichuan: '#ef4444',
  minimax: '#14b8a6',
  yi: '#f59e0b',
  doubao: '#3370ff',
  hunyuan: '#006eff',
  cohere: '#d18ee2',
  perplexity: '#20b8cd',
  ollama: '#ffffff',
  openrouter: '#6467f2',
  siliconflow: '#7c3aed',
  grok: '#000000',
  xai: '#000000'
}

/**
 * 获取品牌图标路径
 * @param name 模型或供应商名称
 * @returns 图标路径，如 '/icons/openai.svg'，如果没有匹配则返回 null
 */
export function getBrandIcon(name: string): string | null {
  const lower = name.toLowerCase()
  for (const { pattern, icon } of BRAND_ICON_MAPPING) {
    if (pattern.test(lower)) {
      return `/icons/${icon}`
    }
  }
  return null
}

/**
 * 获取品牌颜色
 * @param name 模型或供应商名称
 * @returns 品牌颜色，如 '#10a37f'，如果没有匹配则返回默认主色
 */
export function getBrandColor(name: string): string {
  const lower = name.toLowerCase()
  for (const [key, color] of Object.entries(BRAND_COLORS)) {
    if (lower.includes(key)) return color
  }
  return 'var(--primary)'
}
