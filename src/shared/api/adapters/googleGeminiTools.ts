import type { ToolDefinition } from '../../chatStream'

type JsonMap = Record<string, unknown>

export interface GeminiToolsPayload {
  builtInToolEntries: JsonMap[]
  functionToolEntries: JsonMap[]
  hasFunctionDeclarations: boolean
}

export interface ResolveGeminiToolsPayloadParams {
  isOfficialGemini: boolean
  builtIns: ReadonlySet<string>
  tools?: ToolDefinition[]
  normalizeParameters: (parameters: Record<string, unknown>) => Record<string, unknown>
}

function resolveBuiltInTools(isOfficialGemini: boolean, builtIns: ReadonlySet<string>): JsonMap[] {
  if (!isOfficialGemini || builtIns.size === 0) return []

  const entries: JsonMap[] = []
  if (builtIns.has('search')) entries.push({ google_search: {} })
  if (builtIns.has('url_context')) entries.push({ url_context: {} })
  return entries
}

function resolveFunctionDeclarations(
  tools: ToolDefinition[] | undefined,
  normalizeParameters: (parameters: Record<string, unknown>) => Record<string, unknown>
): JsonMap[] {
  if (!tools || tools.length === 0) return []

  const declarations: JsonMap[] = []
  for (const tool of tools) {
    const fn = tool.function
    if (!fn?.name) continue

    const declaration: JsonMap = { name: fn.name }
    if (fn.description) declaration.description = fn.description
    if (fn.parameters) declaration.parameters = normalizeParameters(fn.parameters)
    declarations.push(declaration)
  }

  if (declarations.length === 0) return []
  return [{ function_declarations: declarations }]
}

export function resolveGeminiToolsPayload(params: ResolveGeminiToolsPayloadParams): GeminiToolsPayload {
  const builtInToolEntries = resolveBuiltInTools(params.isOfficialGemini, params.builtIns)

  // Keep built-in tools and function declarations mutually exclusive.
  // This avoids Gemini API compatibility errors when built-ins are enabled.
  const functionToolEntries = builtInToolEntries.length > 0
    ? []
    : resolveFunctionDeclarations(params.tools, params.normalizeParameters)

  return {
    builtInToolEntries,
    functionToolEntries,
    hasFunctionDeclarations: functionToolEntries.some((entry) => {
      const declarations = entry.function_declarations
      return Array.isArray(declarations) && declarations.length > 0
    })
  }
}
