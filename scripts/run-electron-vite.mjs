import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 你的环境里可能全局设置了 ELECTRON_RUN_AS_NODE=1，
// 这会导致 Electron 以 “Node 模式”启动，从而无法加载 Electron API（require('electron') 变成一条路径）。
// 这里强制移除该变量，确保 electron-vite 能正常启动 Electron 桌面进程。
delete process.env.ELECTRON_RUN_AS_NODE

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('用法：node scripts/run-electron-vite.mjs <dev|preview|build|...>')
  process.exit(1)
}

// Windows 下某些环境（尤其是通过 node 脚本二次 spawn）可能拿不到 yarn 注入的 .bin PATH，
// 这里直接调用本地安装的 electron-vite 入口，避免 “electron-vite 不是内部或外部命令”。
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const electronViteBin = path.resolve(projectRoot, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')

// 开发/预览启动前，确保 better-sqlite3 已按 Electron ABI 重建（否则主进程会在加载 DB 时直接崩溃）。
const subCommand = args[0]
if (subCommand === 'dev' || subCommand === 'preview') {
  const ensureNative = path.resolve(projectRoot, 'scripts', 'ensure-electron-native.mjs')
  if (existsSync(ensureNative)) {
    const r = spawnSync(process.execPath, [ensureNative], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit'
    })
    if ((r.status ?? 0) !== 0) {
      process.exit(r.status ?? 1)
    }
  }
}

const child = spawn(process.execPath, [electronViteBin, ...args], {
  stdio: 'inherit',
  env: process.env
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
