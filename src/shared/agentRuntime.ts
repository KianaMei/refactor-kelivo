import type {
  AgentSdkProvider,
  ClaudePermissionMode,
  CodexApprovalPolicy,
  CodexSandboxMode
} from './types'
import type { DbAgentMessage, DbAgentSession } from './db-types'

export type AgentRunStartParams = {
  agentId: string
  sessionId?: string | null
  prompt: string
  cwd: string
  sdkProvider: AgentSdkProvider
  apiProviderId: string | null
  modelId: string | null
  claudePermissionMode: ClaudePermissionMode
  allowDangerouslySkipPermissions?: boolean
  codexSandboxMode: CodexSandboxMode
  codexApprovalPolicy: CodexApprovalPolicy
}

export type AgentRunStartResult = {
  runId: string
  sessionId: string
}

export type AgentRunAbortParams = {
  runId: string
}

export type AgentPermissionRespondParams = {
  requestId: string
  behavior: 'allow' | 'deny'
  updatedInput?: unknown
  message?: string
  interrupt?: boolean
}

export type AgentPermissionRequestEvent = {
  runId: string
  requestId: string
  toolName: string
  toolUseId: string | null
  inputPreview: string
  decisionReason: string | null
  expiresAt: number
}

export type AgentEventPayload =
  | { kind: 'session.upsert'; session: DbAgentSession }
  | { kind: 'message.upsert'; message: DbAgentMessage }
  | { kind: 'permission.request'; request: AgentPermissionRequestEvent }
  | { kind: 'run.status'; runId: string; status: 'running' | 'done' | 'aborted' | 'error'; message?: string }

