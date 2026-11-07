/**
 * 快捷键字符串：修饰键与按键用 `+` 连接，如 `\\`、`/`、`Alt+ArrowRight`、`Ctrl+Shift+K`。
 * 按键名使用 KeyboardEvent.key；单个 `+` 写作 `Plus`。
 */

export interface KeyCombo {
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  key: string
}

const MOD_ALIASES: Record<string, keyof Omit<KeyCombo, 'key'>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  shift: 'shift',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
}

export function parseCombo(input: string): KeyCombo | null {
  const s = input.trim()
  if (!s) return null
  const combo: KeyCombo = { ctrl: false, alt: false, shift: false, meta: false, key: '' }
  // 单个字符（包括 "+"）直接作为按键
  if (s.length === 1) return { ...combo, key: s }
  const parts = s.split('+')
  const key = parts.pop()!
  for (const p of parts) {
    const mod = MOD_ALIASES[p.trim().toLowerCase()]
    if (!mod) return null
    combo[mod] = true
  }
  combo.key = key === 'Plus' ? '+' : key === 'Space' ? ' ' : key
  return combo.key ? combo : null
}

interface KeyEventLike {
  key: string
  code?: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

function isPrintable(key: string) {
  return key.length === 1
}

export function matchCombo(combo: KeyCombo, e: KeyEventLike): boolean {
  if (combo.ctrl !== e.ctrlKey || combo.alt !== e.altKey || combo.meta !== e.metaKey) return false
  // 可打印字符可能需要 Shift 才能输入，不严格比较 Shift
  if (!isPrintable(combo.key) && combo.shift !== e.shiftKey) return false
  if (e.key.toLowerCase() === combo.key.toLowerCase()) return true
  // Alt / Option 会改变 key（macOS），退回比较物理按键
  if (e.code && isPrintable(combo.key)) {
    const k = combo.key.toUpperCase()
    if (/^[A-Z]$/.test(k) && e.code === `Key${k}`) return true
    if (/^[0-9]$/.test(k) && e.code === `Digit${k}`) return true
    const punct: Record<string, string> = {
      ',': 'Comma',
      '.': 'Period',
      '/': 'Slash',
      '\\': 'Backslash',
      ';': 'Semicolon',
    }
    if (punct[combo.key] && e.code === punct[combo.key]) return true
  }
  return false
}

export function matchAny(bindings: readonly string[], e: KeyEventLike): boolean {
  return bindings.some((b) => {
    const c = parseCombo(b)
    return c ? matchCombo(c, e) : false
  })
}

/** 由键盘事件生成快捷键字符串（用于「录制快捷键」） */
export function comboFromEvent(e: KeyEventLike): string | null {
  if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) return null
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.metaKey) mods.push('Meta')
  let key = e.key
  if (e.altKey && e.code) {
    if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
    else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5)
  }
  if (e.shiftKey && !isPrintable(key)) mods.push('Shift')
  if (key === '+') key = 'Plus'
  if (key === ' ') key = 'Space'
  if (isPrintable(key) && /[a-z]/i.test(key)) key = key.toUpperCase()
  return [...mods, key].join('+')
}

const KEY_LABELS: Record<string, string> = {
  ArrowRight: '→',
  ArrowLeft: '←',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  ' ': 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
}

export function formatCombo(input: string, platform: 'mac' | 'other' = 'other'): string {
  const c = parseCombo(input)
  if (!c) return input
  const mac = platform === 'mac'
  const parts: string[] = []
  if (c.ctrl) parts.push(mac ? '⌃' : 'Ctrl')
  if (c.alt) parts.push(mac ? '⌥' : 'Alt')
  if (c.shift) parts.push(mac ? '⇧' : 'Shift')
  if (c.meta) parts.push(mac ? '⌘' : 'Win')
  parts.push(KEY_LABELS[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key))
  return parts.join(mac ? '' : ' + ')
}
