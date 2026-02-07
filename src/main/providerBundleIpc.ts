import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import JSZip from 'jszip'

import { IpcChannel } from '../shared/ipc'
import type { ProviderConfigV2, BundleImportResult } from '../shared/types'
import { resolveAvatarPath, saveProviderAvatar } from './avatarStore'

interface BundleManifest {
  version: 1
  exportedAt: string
  providers: ProviderConfigV2[]
}

export function registerProviderBundleIpc(): void {
  // --- Export: providers → .kelivo ZIP buffer ---
  ipcMain.handle(
    IpcChannel.ProviderBundleExport,
    async (_event, providers: ProviderConfigV2[]): Promise<Buffer> => {
      const zip = new JSZip()

      // 收集头像，记录哪些成功加入了 ZIP
      const avatarAdded = new Set<string>()
      for (const p of providers) {
        if (!p.customAvatarPath) continue
        try {
          const absPath = resolveAvatarPath(p.customAvatarPath)
          const buf = await readFile(absPath)
          const ext = p.customAvatarPath.split('.').pop() ?? 'png'
          zip.file(`avatars/${p.id}.${ext}`, buf)
          avatarAdded.add(p.id)
        } catch {
          // 头像文件不存在，跳过
        }
      }

      // 导出时只有真正加入 ZIP 的头像才映射路径
      const exportProviders = providers.map((p) => {
        if (!p.customAvatarPath || !avatarAdded.has(p.id)) {
          return { ...p, customAvatarPath: '' }
        }
        const ext = p.customAvatarPath.split('.').pop() ?? 'png'
        return { ...p, customAvatarPath: `avatars/${p.id}.${ext}` }
      })

      const manifest: BundleManifest = {
        version: 1,
        exportedAt: new Date().toISOString(),
        providers: exportProviders
      }

      zip.file('providers.json', JSON.stringify(manifest, null, 2))

      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
      return buf
    }
  )

  // --- Import: .kelivo ZIP buffer → providers ---
  ipcMain.handle(
    IpcChannel.ProviderBundleImport,
    async (_event, buffer: Buffer): Promise<BundleImportResult> => {
      const zip = await JSZip.loadAsync(buffer)
      const manifestFile = zip.file('providers.json')
      if (!manifestFile) {
        throw new Error('无效的 .kelivo 文件：缺少 providers.json')
      }

      const manifestStr = await manifestFile.async('string')
      const manifest = JSON.parse(manifestStr) as BundleManifest
      if (manifest.version !== 1 || !Array.isArray(manifest.providers)) {
        throw new Error('无效的 .kelivo 文件：版本不支持')
      }

      // 构建 avatars/ 下所有文件的 map（兼容不同 ZIP 库的编码差异）
      const avatarEntries = new Map<string, JSZip.JSZipObject>()
      zip.forEach((path, entry) => {
        if (!entry.dir && path.startsWith('avatars/')) {
          avatarEntries.set(path, entry)
        }
      })
      console.log(`[bundle-import] ZIP 中共 ${avatarEntries.size} 个头像文件:`, [...avatarEntries.keys()])
      console.log(`[bundle-import] 共 ${manifest.providers.length} 个供应商`)

      // 还原头像：从 ZIP 中读取 → saveProviderAvatar → 更新 customAvatarPath
      const restoredProviders: ProviderConfigV2[] = []
      for (const p of manifest.providers) {
        let restored = { ...p }

        if (p.customAvatarPath) {
          console.log(`[bundle-import] 供应商 "${p.id}" manifest 头像路径: ${p.customAvatarPath}`)

          // 1. 精确匹配
          let avatarEntry = avatarEntries.get(p.customAvatarPath) ?? null
          // 2. 遍历查找（兼容编码差异）
          if (!avatarEntry) {
            for (const [path, entry] of avatarEntries) {
              if (path.includes(p.id)) {
                avatarEntry = entry
                console.log(`[bundle-import]   模糊匹配命中: ${path}`)
                break
              }
            }
          }
          // 3. 仅剩一个头像且仅一个供应商时直接匹配
          if (!avatarEntry && avatarEntries.size === 1 && manifest.providers.length === 1) {
            avatarEntry = avatarEntries.values().next().value ?? null
          }

          if (avatarEntry) {
            try {
              const avatarBuf = await avatarEntry.async('nodebuffer')
              console.log(`[bundle-import]   头像数据大小: ${avatarBuf.length} bytes`)
              const ext = p.customAvatarPath.split('.').pop() ?? 'png'
              const mime = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : 'png'
              const dataUrl = `data:image/${mime};base64,${avatarBuf.toString('base64')}`
              const savedPath = await saveProviderAvatar(p.id, dataUrl)
              console.log(`[bundle-import]   保存成功: ${savedPath}`)
              restored = { ...restored, customAvatarPath: savedPath }
            } catch (err) {
              console.error(`[bundle-import] 头像保存失败 (${p.id}):`, err)
              restored = { ...restored, customAvatarPath: '' }
            }
          } else {
            console.warn(`[bundle-import] 头像未找到 (${p.id}): ${p.customAvatarPath}`)
            console.warn(`[bundle-import] ZIP 中的头像文件:`, [...avatarEntries.keys()])
            restored = { ...restored, customAvatarPath: '' }
          }
        }

        restoredProviders.push(restored)
      }
      console.log(`[bundle-import] 导入完成，${restoredProviders.filter((p) => p.customAvatarPath).length}/${restoredProviders.length} 个供应商有头像`)

      return { providers: restoredProviders }
    }
  )

  // --- File dialogs ---
  ipcMain.handle(
    IpcChannel.DialogSaveFile,
    async (
      _event,
      options: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }
    ): Promise<{ canceled: boolean; filePath?: string }> => {
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const result = await dialog.showSaveDialog(
        win as BrowserWindow,
        {
          defaultPath: options.defaultPath,
          filters: options.filters
        }
      )
      if (result.canceled || !result.filePath) {
        return { canceled: true }
      }
      return { canceled: false, filePath: result.filePath }
    }
  )

  ipcMain.handle(
    IpcChannel.DialogOpenFile,
    async (
      _event,
      options: { filters?: { name: string; extensions: string[] }[] }
    ): Promise<{ canceled: boolean; buffer?: Buffer; filePath?: string }> => {
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const result = await dialog.showOpenDialog(
        win as BrowserWindow,
        {
          filters: options.filters,
          properties: ['openFile']
        }
      )
      if (result.canceled || !result.filePaths.length) {
        return { canceled: true }
      }
      const filePath = result.filePaths[0]
      const buffer = await readFile(filePath)
      return { canceled: false, buffer, filePath }
    }
  )

  // --- Write file (for saving exported bundle) ---
  ipcMain.handle(
    'dialog:write-file',
    async (_event, filePath: string, data: Buffer): Promise<void> => {
      await writeFile(filePath, data)
    }
  )
}
