/**
 * Bridge MOCK 冒烟测试（不需要真实 Key）
 *
 * 运行：
 *   node refactor-kelivo/tasks/feature_agent_runtime/tests/agent_bridge_mock_smoke.mjs
 */

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const repoRoot = join(__dirname, '../../..') // -> refactor-kelivo/
const bridgePath = join(repoRoot, 'resources', 'agent-bridge', 'bridge.mjs')

const child = spawn(process.execPath, [bridgePath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, MOCK: '1' }
})

child.stderr.setEncoding('utf8')
child.stderr.on('data', (d) => process.stderr.write(String(d)))

let nextId = 1
const pending = new Map()

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n')
}

function request(method, params) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    send({ jsonrpc: '2.0', id, method, params })
  })
}

function notify(method, params) {
  send({ jsonrpc: '2.0', method, params })
}

const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })

rl.on('line', async (line) => {
  const s = String(line ?? '').trim()
  if (!s) return
  let msg
  try { msg = JSON.parse(s) } catch { return }

  if (msg.id) {
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.error) p.reject(new Error(msg.error.message))
    else p.resolve(msg.result)
    return
  }

  if (msg.method === 'notifications/event') {
    const evt = msg.params ?? {}
    if (evt.type === 'permission.request') {
      // MOCK：永远允许
      await request('permission.respond', { requestId: evt.requestId, behavior: 'allow' })
      return
    }
    if (evt.type === 'status') {
      process.stdout.write(`[event] status=${evt.status} ${evt.message ?? ''}\n`)
      return
    }
  }
})

async function main() {
  await request('initialize', { protocolVersion: 1, externalDepsDir: null })

  const runId = `mock_${Date.now()}`
  const result = await request('agent.run', {
    runId,
    sessionId: 'session_mock',
    sdkProvider: 'claude',
    prompt: 'hello',
    cwd: process.cwd()
  })

  if (!result?.success) {
    throw new Error(`run failed: ${JSON.stringify(result)}`)
  }

  process.stdout.write(`[ok] ${JSON.stringify(result)}\n`)
  child.kill()
}

main().catch((e) => {
  process.stderr.write(`[fail] ${e?.message ?? String(e)}\n`)
  try { child.kill() } catch { }
  process.exit(1)
})
