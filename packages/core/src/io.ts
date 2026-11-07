import { defaultLocalState, defaultSettings } from './defaults'
import { normalizeData } from './model'
import type { LocalState, MyriadData, MyriadSettings } from './types'

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * 深度合并：以默认值为骨架，用保存的值覆盖同类型字段。
 * 新版本新增的设置项会自动得到默认值，类型不符的旧值被丢弃。
 */
export function mergeDefaults<T>(defaults: T, saved: unknown): T {
  if (!isObject(defaults) || !isObject(saved)) {
    if (saved === undefined) return defaults
    if (Array.isArray(defaults)) return (Array.isArray(saved) ? saved : defaults) as T
    if (defaults === null || saved === null) return (saved ?? defaults) as T
    return (typeof saved === typeof defaults ? saved : defaults) as T
  }
  const out: Record<string, unknown> = { ...defaults }
  for (const [k, dv] of Object.entries(defaults)) {
    if (k in saved) out[k] = mergeDefaults(dv, saved[k])
  }
  // 记录类字段（如 wallpapers、iconCache）允许出现默认值里没有的键
  if (Object.keys(defaults).length === 0) Object.assign(out, saved)
  return out as T
}

export function loadSettings(saved: unknown): MyriadSettings {
  return mergeDefaults(defaultSettings(), saved)
}

export function loadLocalState(saved: unknown): LocalState {
  return mergeDefaults(defaultLocalState(), saved)
}

export function isMyriadData(v: unknown): v is MyriadData {
  return isObject(v) && Array.isArray(v.groups) && isObject(v.items) && Array.isArray(v.dock)
}

export function loadData(saved: unknown): MyriadData | null {
  if (!isMyriadData(saved)) return null
  const data = structuredClone(saved) as MyriadData
  data.schema = 1
  if (typeof data.updatedAt !== 'number') data.updatedAt = Date.now()
  for (const g of data.groups) if (!Array.isArray(g.items)) g.items = []
  return normalizeData(data)
}

/* ------------------------------------------------------------------ */
/* 导入 / 导出                                                         */
/* ------------------------------------------------------------------ */

export const EXPORT_FORMAT = 'myriad-backup'

export interface MyriadBackup {
  format: typeof EXPORT_FORMAT
  version: 1
  exportedAt: string
  app: string
  data?: MyriadData
  settings?: MyriadSettings
}

export function createBackup(
  parts: { data?: MyriadData; settings?: MyriadSettings },
  app = 'Myriad',
): MyriadBackup {
  return {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    app,
    ...(parts.data ? { data: structuredClone(parts.data) } : {}),
    ...(parts.settings ? { settings: structuredClone(parts.settings) } : {}),
  }
}

export class BackupError extends Error {}

/** 解析备份文件；只接受万象导出的格式 */
export function parseBackup(text: string): {
  data: MyriadData | null
  settings: MyriadSettings | null
} {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new BackupError('invalid-json')
  }
  if (!isObject(json) || json.format !== EXPORT_FORMAT) throw new BackupError('not-myriad')
  if (typeof json.version !== 'number' || json.version > 1)
    throw new BackupError('unsupported-version')
  const data = json.data === undefined ? null : loadData(json.data)
  if (json.data !== undefined && !data) throw new BackupError('invalid-data')
  const settings = json.settings === undefined ? null : loadSettings(json.settings)
  if (!data && !settings) throw new BackupError('empty')
  return { data, settings }
}

/** 把导入的数据追加到现有数据后面（重新分配 id，避免冲突） */
export function appendData(target: MyriadData, incoming: MyriadData): void {
  const remap = new Map<string, string>()
  const fresh = (id: string) => {
    let n = remap.get(id)
    if (!n) {
      n = `${id}_${Math.random().toString(36).slice(2, 8)}`
      remap.set(id, n)
    }
    return n
  }
  for (const [id, item] of Object.entries(incoming.items)) {
    const copy = structuredClone(item)
    copy.id = fresh(id)
    if (copy.type === 'folder') copy.children = copy.children.map(fresh)
    target.items[copy.id] = copy
  }
  for (const g of incoming.groups) {
    target.groups.push({ ...structuredClone(g), id: fresh(g.id), items: g.items.map(fresh) })
  }
  for (const id of incoming.dock) target.dock.push(fresh(id))
  target.updatedAt = Date.now()
  normalizeData(target)
}
