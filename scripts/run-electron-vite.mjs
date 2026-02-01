import { spawn } from 'node:child_process'

// 你的环境里可能全局设置了 ELECTRON_RUN_AS_NODE=1，
// 这会导致 Electron 以 “Node 模式”启动，从而无法加载 Electron API（require('electron') 变成一条路径）。
// 这里强制移除该变量，确保 electron-vite 能正常启动 Electron 桌面进程。
delete process.env.ELECTRON_RUN_AS_NODE

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('用法：node scripts/run-electron-vite.mjs <dev|preview|build|...>')
  process.exit(1)
}

const child = spawn('electron-vite', args, {
  stdio: 'inherit',
  shell: true,
  env: process.env
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

