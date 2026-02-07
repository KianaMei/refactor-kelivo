/**
 * 版本折叠逻辑
 * 处理消息的多版本显示和选择
 */

import type { DbMessage } from '../../shared/db-types'

/**
 * 折叠消息版本 - 只保留每个 groupId 的选定版本
 *
 * 消息可能有多个版本（重新生成时创建新版本而非覆盖）。
 * 此函数根据用户的版本选择，返回每组消息中选定的版本。
 *
 * @param messages 消息列表（按 sortOrder 排序）
 * @param versionSelections 版本选择映射 (groupId -> 选中的版本索引)
 * @returns 折叠后的消息列表（每组只保留一个版本）
 */
export function collapseVersions(
  messages: DbMessage[],
  versionSelections: Record<string, number> | null
): DbMessage[] {
  const selections = versionSelections ?? {}

  // 按 groupId 分组
  const byGroup = new Map<string, DbMessage[]>()
  const order: string[] = []

  for (const m of messages) {
    const gid = m.groupId ?? m.id

    if (!byGroup.has(gid)) {
      byGroup.set(gid, [])
      order.push(gid)
    }

    byGroup.get(gid)!.push(m)
  }

  // 按版本号排序每个分组
  for (const [, group] of byGroup) {
    group.sort((a, b) => a.version - b.version)
  }

  // 选择每组的显示版本
  const result: DbMessage[] = []

  for (const gid of order) {
    const versions = byGroup.get(gid)!
    const selectedIndex = selections[gid]

    // 确定索引：如果有有效选择使用它，否则使用最后一个版本
    const idx =
      selectedIndex !== undefined && selectedIndex >= 0 && selectedIndex < versions.length
        ? selectedIndex
        : versions.length - 1

    result.push(versions[idx])
  }

  return result
}

/**
 * 获取消息组的版本信息
 *
 * @param messages 消息列表
 * @param groupId 分组 ID
 * @returns 该组的所有版本
 */
export function getVersionsForGroup(messages: DbMessage[], groupId: string): DbMessage[] {
  return messages
    .filter((m) => (m.groupId ?? m.id) === groupId)
    .sort((a, b) => a.version - b.version)
}

/**
 * 获取消息的版本显示信息
 *
 * @param messages 消息列表
 * @param messageId 消息 ID
 * @returns 版本信息 { current: 当前版本号, total: 总版本数 } 或 null
 */
export function getVersionInfo(
  messages: DbMessage[],
  messageId: string
): { current: number; total: number } | null {
  const message = messages.find((m) => m.id === messageId)
  if (!message) return null

  const gid = message.groupId ?? message.id
  const versions = getVersionsForGroup(messages, gid)

  const currentIndex = versions.findIndex((v) => v.id === messageId)
  if (currentIndex === -1) return null

  return {
    current: currentIndex + 1, // 1-based for display
    total: versions.length
  }
}

/**
 * 计算新版本号
 *
 * @param messages 消息列表
 * @param groupId 分组 ID
 * @returns 新版本号
 */
export function getNextVersion(messages: DbMessage[], groupId: string): number {
  const versions = getVersionsForGroup(messages, groupId)
  if (versions.length === 0) return 0

  const maxVersion = Math.max(...versions.map((v) => v.version))
  return maxVersion + 1
}

/**
 * 更新版本选择
 *
 * @param currentSelections 当前选择
 * @param groupId 分组 ID
 * @param versionIndex 选中的版本索引
 * @returns 新的选择映射
 */
export function updateVersionSelection(
  currentSelections: Record<string, number> | null,
  groupId: string,
  versionIndex: number
): Record<string, number> {
  return {
    ...(currentSelections ?? {}),
    [groupId]: versionIndex
  }
}

/**
 * 清理过期的版本选择
 * 移除不再存在的 groupId 的选择
 *
 * @param selections 当前选择
 * @param messages 消息列表
 * @returns 清理后的选择
 */
export function cleanupVersionSelections(
  selections: Record<string, number> | null,
  messages: DbMessage[]
): Record<string, number> {
  if (!selections) return {}

  const validGroupIds = new Set<string>()
  for (const m of messages) {
    validGroupIds.add(m.groupId ?? m.id)
  }

  const cleaned: Record<string, number> = {}
  for (const [gid, index] of Object.entries(selections)) {
    if (validGroupIds.has(gid)) {
      cleaned[gid] = index
    }
  }

  return cleaned
}
