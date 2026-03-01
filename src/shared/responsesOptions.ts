export type ResponsesReasoningSummary = 'auto' | 'concise' | 'detailed'

export type ResponsesTextVerbosity = 'low' | 'medium' | 'high'

export function normalizeResponsesReasoningSummary(value: unknown): ResponsesReasoningSummary | null {
  if (value === 'auto' || value === 'concise' || value === 'detailed') return value
  if (value === 'off') return 'auto' // legacy: 'off' 不是有效 API 值，回退到 'auto'
  return null
}

export function normalizeResponsesTextVerbosity(value: unknown): ResponsesTextVerbosity | null {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return null
}
