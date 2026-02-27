export type ResponsesReasoningSummary = 'off' | 'auto' | 'concise' | 'detailed'

export type ResponsesTextVerbosity = 'low' | 'medium' | 'high'

export function normalizeResponsesReasoningSummary(value: unknown): ResponsesReasoningSummary | null {
  if (value === 'off' || value === 'auto' || value === 'concise' || value === 'detailed') return value
  return null
}

export function normalizeResponsesTextVerbosity(value: unknown): ResponsesTextVerbosity | null {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return null
}
