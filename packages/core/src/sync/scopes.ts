import { loadSettings } from '../io'
import type { LocalState, MyriadData, MyriadSettings } from '../types'
import { isObject, type JsonObject } from './yjson'

/** 同步文档的顶层分区 */
export const SYNC_ROOTS = ['data', 'settings', 'history'] as const
export type SyncRoot = (typeof SYNC_ROOTS)[number]

/**
 * 可以单独改为「只在本机生效」的范围。快捷方式与分组（data）始终同步。
 * 每个设置范围对应 MyriadSettings 的若干顶层键。
 */
export const SETTINGS_SCOPES = {
  appearance: ['language', 'palette', 'theme', 'reducedMotion'],
  background: ['background'],
  layout: ['layout', 'dock'],
  icons: ['icons', 'openIn'],
  search: ['search'],
  shortcuts: ['shortcuts'],
  clock: ['clock'],
} as const satisfies Record<string, readonly (keyof MyriadSettings)[]>

export type SettingsScope = keyof typeof SETTINGS_SCOPES
export type SyncScope = SettingsScope | 'history'
export const SYNC_SCOPES: SyncScope[] = [
  ...(Object.keys(SETTINGS_SCOPES) as SettingsScope[]),
  'history',
]

export type SyncScopes = Record<SyncScope, boolean>

export function defaultSyncScopes(): SyncScopes {
  return Object.fromEntries(SYNC_SCOPES.map((s) => [s, true])) as SyncScopes
}

/** 当前范围下参与同步的设置键 */
export function syncedSettingKeys(scopes: SyncScopes): string[] {
  return (Object.keys(SETTINGS_SCOPES) as SettingsScope[])
    .filter((s) => scopes[s])
    .flatMap((s) => SETTINGS_SCOPES[s])
}

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** 分组、条目与 Dock；不含 updatedAt（时间戳不参与合并） */
export function dataToJson(data: MyriadData): JsonObject {
  const { updatedAt: _u, ...rest } = plain(data)
  return rest as unknown as JsonObject
}

export function settingsToJson(settings: MyriadSettings, keys: readonly string[]): JsonObject {
  const s = plain(settings) as unknown as JsonObject
  const out: JsonObject = {}
  for (const k of keys) if (s[k] !== undefined) out[k] = s[k]!
  return out
}

/** 把同步来的设置合并进本机设置：只覆盖参与同步的键，其余保留本机值 */
export function mergeSyncedSettings(
  current: MyriadSettings,
  remote: JsonObject | null,
  keys: readonly string[],
): MyriadSettings {
  const next = plain(current) as unknown as Record<string, unknown>
  if (remote) for (const k of keys) if (k in remote) next[k] = remote[k]
  return loadSettings(next)
}

type History = LocalState['searchHistory']
export const HISTORY_LIMIT = 100

/** 搜索历史按关键词做键，两台设备的历史合并时取并集 */
export function historyToJson(list: History): JsonObject {
  const out: JsonObject = {}
  for (const h of list.slice(0, HISTORY_LIMIT))
    out[`q:${h.q}`] = { q: h.q, engine: h.engine, at: h.at }
  return out
}

export function historyFromJson(obj: JsonObject | null): History {
  if (!obj) return []
  const list: History = []
  for (const v of Object.values(obj)) {
    if (isObject(v) && typeof v.q === 'string' && typeof v.at === 'number')
      list.push({ q: v.q, engine: typeof v.engine === 'string' ? v.engine : '', at: v.at })
  }
  return list.sort((a, b) => b.at - a.at).slice(0, HISTORY_LIMIT)
}
