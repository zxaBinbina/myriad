import { type Json, SETTINGS_SCOPES, type SettingsScope } from '@myriad/core'
import type { Messages } from '../i18n'

/**
 * 同步相关界面里，把设置路径（如 ['clock', 'hour12']）显示成文案。
 * 文案按 i18n 中 settings 的分区查找：语言、配色、明暗等顶层键在「外观」里，openIn 在「图标」里。
 */

const TOP_SECTION: Record<string, string> = {
  language: 'appearance',
  palette: 'appearance',
  theme: 'appearance',
  reducedMotion: 'appearance',
  openIn: 'icons',
}

type Dict = Record<string, unknown>

function sectionOf(m: Messages, path: readonly string[]): [Dict | undefined, string] {
  const [top = '', ...rest] = path
  const settings = m.settings as unknown as Dict
  if (TOP_SECTION[top]) return [settings[TOP_SECTION[top]!] as Dict, top]
  return [settings[top] as Dict | undefined, rest[rest.length - 1] ?? top]
}

/** 设置路径所属的同步范围名称，如「外观（语言、配色、明暗）」 */
export function settingScopeName(m: Messages, path: readonly string[]): string {
  const top = path[0] ?? ''
  for (const [scope, keys] of Object.entries(SETTINGS_SCOPES))
    if ((keys as readonly string[]).includes(top)) return m.sync.scopeNames[scope as SettingsScope]
  return top
}

/** 设置项名称，如「12 小时制」；找不到文案时显示路径 */
export function settingLabel(m: Messages, path: readonly string[]): string {
  const [section, key] = sectionOf(m, path)
  const label = section?.[key]
  return typeof label === 'string' ? label : path.join(' › ')
}

/** 设置项的取值文案：开关显示开 / 关，枚举在 `${key}s` 选项表中查找 */
export function settingValue(m: Messages, path: readonly string[], v: Json | undefined): string {
  if (v === undefined || v === null || v === '') return m.sync.emptyValue
  if (typeof v === 'boolean') return v ? m.common.on : m.common.off
  if (typeof v === 'string' || typeof v === 'number') {
    const [section, key] = sectionOf(m, path)
    const label = (section?.[`${key}s`] as Dict | undefined)?.[String(v)]
    if (typeof label === 'string') return label
  }
  return plainValue(m, v)
}

export function plainValue(m: Messages, v: Json | undefined): string {
  if (v === undefined || v === null || v === '') return m.sync.emptyValue
  if (typeof v === 'boolean') return v ? m.common.on : m.common.off
  if (typeof v === 'string') return v.startsWith('data:') ? `${v.slice(0, 32)}…` : v
  const s = JSON.stringify(v)
  return s.length > 80 ? `${s.slice(0, 80)}…` : s
}
