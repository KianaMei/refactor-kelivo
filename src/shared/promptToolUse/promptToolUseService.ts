/**
 * Prompt-based Tool Use Service
 *
 * 构建包含工具定义的增强系统提示词，以及工具结果消息。
 * 对齐 Flutter 版 prompt_tool_use_service.dart
 */

import type { ToolDefinition } from '../chatStream'

const SYSTEM_PROMPT_TEMPLATE = `# 工具使用说明

你可以使用以下工具来完成任务。当你需要使用工具时，请使用 XML 格式输出工具调用。

## 可用工具

{available_tools}

## 工具调用格式

当你需要调用工具时，请使用以下 XML 格式：

\`\`\`xml
<tool_use>
  <name>工具名称</name>
  <arguments>{"参数名": "参数值"}</arguments>
</tool_use>
\`\`\`

## 重要规则

1. **一次只调用一个工具**：每次回复中最多包含一个 \`<tool_use>\` 标签
2. **等待结果**：发出工具调用后，等待工具结果返回再继续
3. **参数格式**：arguments 必须是有效的 JSON 格式
4. **正常回复**：如果不需要使用工具，直接正常回复即可

## 工具结果格式

工具执行后，你会收到以下格式的结果：

\`\`\`xml
<tool_use_result>
  <name>工具名称</name>
  <result>{"结果字段": "结果值"}</result>
</tool_use_result>
\`\`\`

{user_instructions}`

/** 将工具定义列表转为 XML 格式文本 */
function buildAvailableToolsXml(tools: ToolDefinition[]): string {
  if (tools.length === 0) return ''

  const parts: string[] = []
  for (const tool of tools) {
    const fn = tool.function
    if (!fn) continue

    const name = fn.name ?? ''
    const description = fn.description ?? ''
    const parameters = fn.parameters as Record<string, unknown> | undefined

    const lines: string[] = []
    lines.push(`### ${name}`)
    lines.push('')
    lines.push(`**描述**: ${description}`)
    lines.push('')

    if (parameters) {
      const properties = (parameters.properties ?? {}) as Record<string, Record<string, unknown>>
      const required = Array.isArray(parameters.required)
        ? (parameters.required as string[])
        : []

      if (Object.keys(properties).length > 0) {
        lines.push('**参数**:')
        for (const [paramName, paramDef] of Object.entries(properties)) {
          const paramType = (paramDef.type as string) ?? 'any'
          const paramDesc = (paramDef.description as string) ?? ''
          const isRequired = required.includes(paramName)
          lines.push(`- \`${paramName}\` (${paramType}${isRequired ? ', 必填' : ', 可选'}): ${paramDesc}`)
        }
        lines.push('')
      }
    }

    lines.push('**调用示例**:')
    lines.push('```xml')
    lines.push('<tool_use>')
    lines.push(`  <name>${name}</name>`)
    lines.push(`  <arguments>${buildExampleArguments(parameters)}</arguments>`)
    lines.push('</tool_use>')
    lines.push('```')
    lines.push('')

    parts.push(lines.join('\n'))
  }

  return parts.join('\n').trim()
}

/** 构建示例参数 JSON */
function buildExampleArguments(parameters: Record<string, unknown> | undefined): string {
  if (!parameters) return '{}'

  const properties = (parameters.properties ?? {}) as Record<string, Record<string, unknown>>
  if (Object.keys(properties).length === 0) return '{}'

  const example: Record<string, unknown> = {}
  for (const [key, paramDef] of Object.entries(properties)) {
    const paramType = (paramDef.type as string) ?? 'string'
    switch (paramType) {
      case 'integer':
        example[key] = (paramDef.minimum as number) ?? 0
        break
      case 'number':
        example[key] = (paramDef.minimum as number) ?? 0.0
        break
      case 'boolean':
        example[key] = true
        break
      case 'string':
      default:
        example[key] = 'example_value'
        break
    }
  }

  return JSON.stringify(example)
}

/**
 * 构建包含工具定义的完整系统提示词
 *
 * 将工具列表转为 XML 格式注入系统提示词，保留用户原始 system prompt。
 */
export function buildPromptToolSystemPrompt(params: {
  userSystemPrompt: string
  tools: ToolDefinition[]
}): string {
  const { userSystemPrompt, tools } = params
  if (tools.length === 0) return userSystemPrompt

  const availableToolsXml = buildAvailableToolsXml(tools)

  let userInstructions = ''
  if (userSystemPrompt.trim()) {
    userInstructions = `## 用户指令\n\n${userSystemPrompt}`
  }

  return SYSTEM_PROMPT_TEMPLATE
    .replace('{available_tools}', availableToolsXml)
    .replace('{user_instructions}', userInstructions)
    .trim()
}

/**
 * 构建工具执行结果消息（XML 格式）
 */
export function buildToolResultMessage(params: {
  toolName: string
  result: string
  isError?: boolean
}): string {
  const { toolName, result, isError } = params
  if (isError) {
    return `<tool_use_result>\n  <name>${toolName}</name>\n  <error>${result}</error>\n</tool_use_result>`
  }
  return `<tool_use_result>\n  <name>${toolName}</name>\n  <result>${result}</result>\n</tool_use_result>`
}
