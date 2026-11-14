import { addDays, type PlainDate, zonedParts, ymd } from '../calendar/dates'
import { countdownOccurrence, parsePlainDate } from '../widgets'

/** 每个字段是原子字符串，避免 CRDT 把两次 AES 的 IV 和密文分别合并。 */
export interface MemoList {
  id: string
  protection: 'plain' | 'encrypted'
  keyId: string
  salt: string
  order: string[]
  fields: Record<string, string>
}
export type TaskRepeat = 'none' | 'day' | 'week' | 'month' | 'year'
export interface TodoTask {
  id: string
  title: string
  done: boolean
  archived: boolean
  priority: 0 | 1 | 2 | 3
  color: 'none' | 'blue' | 'red' | 'green' | 'yellow'
  due: string
  time: string
  reminder: 'off' | 'at' | '10m' | '1h' | '1d'
  repeat: TaskRepeat
  anchor: string
  series: string
  subtasks: { id: string; title: string; done: boolean }[]
}
export interface MemoContent {
  title: string
  note: string
  tasks: TodoTask[]
}
export interface MemoConfig {
  listId: string
  view: 'tasks' | 'note'
  completed: 'fold' | 'archive'
  calendar: boolean
}
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const text = (v: unknown, limit = 1000) => (typeof v === 'string' ? v.slice(0, limit) : '')
const safeId = (v: string) =>
  /^[\w:.-]{1,180}$/.test(v) &&
  !['__proto__', 'constructor', 'prototype', 'title', 'note'].includes(v)
export function memoConfig(value: unknown): MemoConfig {
  const v = object(value)
  return {
    listId: text(v.listId, 180),
    view: v.view === 'note' ? 'note' : 'tasks',
    completed: v.completed === 'archive' ? 'archive' : 'fold',
    calendar: v.calendar !== false,
  }
}
export function createMemoList(id: string, title: string): MemoList {
  return {
    id,
    protection: 'plain',
    keyId: '',
    salt: '',
    order: [],
    fields: { title: JSON.stringify(title), note: JSON.stringify('') },
  }
}
export function normalizeMemoList(value: unknown, id: string): MemoList | null {
  if (!safeId(id)) return null
  const v = object(value),
    raw = object(v.fields)
  if (v.protection !== 'plain' && v.protection !== 'encrypted') return null
  if (v.protection === 'encrypted' && !safeId(text(v.keyId, 180))) return null
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw))
    if (
      (key === 'title' || key === 'note' || safeId(key)) &&
      typeof value === 'string' &&
      value.length <= 1000000
    )
      fields[key] = value
  const keys = Object.keys(fields).filter(safeId)
  const order = [
    ...new Set([
      ...(Array.isArray(v.order)
        ? v.order.filter((k): k is string => typeof k === 'string' && safeId(k) && k in fields)
        : []),
      ...keys,
    ]),
  ]
  return {
    id,
    protection: v.protection,
    keyId: text(v.keyId, 180),
    salt: text(v.salt, 100),
    fields,
    order,
  }
}
export function todoTask(value: unknown, id: string): TodoTask {
  const v = object(value),
    date = text(v.due),
    anchor = text(v.anchor)
  return {
    id,
    title: text(v.title),
    done: v.done === true,
    archived: v.archived === true,
    priority: v.priority === 1 || v.priority === 2 || v.priority === 3 ? v.priority : 0,
    color: ['blue', 'red', 'green', 'yellow'].includes(String(v.color))
      ? (v.color as TodoTask['color'])
      : 'none',
    due: parsePlainDate(date) ? date : '',
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(text(v.time)) ? text(v.time) : '',
    reminder: ['at', '10m', '1h', '1d'].includes(String(v.reminder))
      ? (v.reminder as TodoTask['reminder'])
      : 'off',
    repeat: ['day', 'week', 'month', 'year'].includes(String(v.repeat))
      ? (v.repeat as TaskRepeat)
      : 'none',
    anchor: parsePlainDate(anchor) ? anchor : '',
    series: text(v.series, 180),
    subtasks: (Array.isArray(v.subtasks) ? v.subtasks : [])
      .map(object)
      .slice(0, 100)
      .map((s, i) => ({
        id: text(s.id, 180) || `${id}.s${i}`,
        title: text(s.title),
        done: s.done === true,
      })),
  }
}
export function nextTask(task: TodoTask, today: PlainDate): TodoTask | null {
  const start = parsePlainDate(task.due)
  if (!start || task.repeat === 'none') return null
  const after = addDays(ymd(today) > task.due ? today : start, 1)
  const anchor = task.anchor || task.due
  const next =
    task.repeat === 'day'
      ? ymd(after)
      : countdownOccurrence(
          { title: '', date: anchor, repeat: task.repeat, showElapsed: false },
          after,
        ).date
  const series = task.series || task.id
  return {
    ...task,
    id: `${series}:${next}`,
    due: next,
    anchor,
    series,
    done: false,
    archived: false,
    subtasks: task.subtasks.map((s) => ({ ...s, done: false })),
  }
}
/** 日期 / 时间按主时钟时区解释；不存在的 DST 时刻返回 null。 */
export function taskDeadline(task: TodoTask, zone: string): number | null {
  const d = parsePlainDate(task.due)
  if (!d) return null
  const [hour, minute] = (task.time || '09:00').split(':').map(Number)
  const desired = Date.UTC(d.year, d.month - 1, d.day, hour, minute)
  let epoch = desired
  for (let i = 0; i < 4; i++) {
    const p = zonedParts(new Date(epoch), zone)
    const delta = desired - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    if (!delta) return epoch
    epoch += delta
  }
  return null
}
export function reminderTime(task: TodoTask, zone: string): number | null {
  if (task.done || task.archived || task.reminder === 'off') return null
  const at = taskDeadline(task, zone)
  const delta = { at: 0, '10m': 600000, '1h': 3600000, '1d': 86400000, off: 0 }[task.reminder]
  return at === null ? null : at - delta
}

function bytes64(bytes: Uint8Array) {
  let raw = ''
  for (let i = 0; i < bytes.length; i += 32768)
    raw += String.fromCharCode(...bytes.subarray(i, i + 32768))
  return btoa(raw)
}
function from64(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('invalid-key')
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}
const encoded = (value: string) => new TextEncoder().encode(value)
const aad = (list: MemoList, field: string) => encoded(`myriad-memo-v1:${list.keyId}:${field}`)
export function generateMemoKey() {
  return bytes64(crypto.getRandomValues(new Uint8Array(32)))
}
export function generateMemoSalt() {
  return bytes64(crypto.getRandomValues(new Uint8Array(16)))
}
async function cryptoKey(key: string) {
  const raw = from64(key)
  if (raw.length !== 32) throw new Error('invalid-key')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function deriveMemoKey(passphrase: string, salt: string): Promise<string> {
  const bytes = from64(salt)
  if (bytes.length !== 16) throw new Error('invalid-salt')
  const material = await crypto.subtle.importKey('raw', encoded(passphrase), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: bytes, iterations: 600000 },
    material,
    256,
  )
  return bytes64(new Uint8Array(bits))
}
export async function encodeMemoField(
  list: MemoList,
  field: string,
  value: unknown,
  key?: string,
): Promise<string> {
  const body = JSON.stringify(value)
  if (list.protection === 'plain') return body
  if (!key) throw new Error('locked')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(list, field) },
    await cryptoKey(key),
    encoded(body),
  )
  return `e1:${bytes64(iv)}:${bytes64(new Uint8Array(cipher))}`
}
export async function decodeMemoField(
  list: MemoList,
  field: string,
  value: string,
  key?: string,
): Promise<unknown> {
  if (list.protection === 'plain') return JSON.parse(value)
  if (!key) throw new Error('locked')
  const parts = value.split(':')
  if (parts.length !== 3 || parts[0] !== 'e1') throw new Error('invalid-ciphertext')
  const iv = from64(parts[1]!),
    body = from64(parts[2]!)
  if (iv.length !== 12 || body.length < 16) throw new Error('invalid-ciphertext')
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad(list, field) },
    await cryptoKey(key),
    body,
  )
  return JSON.parse(new TextDecoder().decode(raw))
}
export async function readMemoList(list: MemoList, key?: string): Promise<MemoContent> {
  const read = (field: string) =>
    list.fields[field] === undefined
      ? Promise.resolve(undefined)
      : decodeMemoField(list, field, list.fields[field]!, key)
  const [title, note, ...tasks] = await Promise.all(['title', 'note', ...list.order].map(read))
  return {
    title: text(title),
    note: text(note, 100000),
    tasks: tasks.map((v, i) => todoTask(v, list.order[i]!)),
  }
}
export async function protectMemoList(
  list: MemoList,
  keyId: string,
  key: string,
  salt = '',
): Promise<MemoList> {
  const next: MemoList = {
    ...list,
    protection: 'encrypted',
    keyId,
    salt,
    fields: {},
    order: [...list.order],
  }
  for (const [field, body] of Object.entries(list.fields))
    next.fields[field] = await encodeMemoField(next, field, JSON.parse(body), key)
  return next
}
export function memoKeyBackup(keyId: string, key: string) {
  return { format: 'myriad-memo-key', version: 1, keyId, key }
}
export function parseMemoKeyBackup(value: string): { keyId: string; key: string } {
  const v = object(JSON.parse(value))
  if (
    v.format !== 'myriad-memo-key' ||
    v.version !== 1 ||
    !safeId(text(v.keyId, 180)) ||
    from64(text(v.key, 100)).length !== 32
  )
    throw new Error('invalid-key')
  return { keyId: text(v.keyId, 180), key: text(v.key, 100) }
}
