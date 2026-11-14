export const STATUS_URL = 'https://status.mcyzw.top/api/status'
export const STATUS_HISTORY_URL = `${STATUS_URL}/history`
export type StatusTone = 'operational' | 'degraded' | 'outage' | 'unknown'
export interface StatusService {
  id: string
  name: string
  status: StatusTone
  latencyMs: number | null
}
export interface MinecraftReading {
  online: boolean | null
  status: StatusTone
  address: string
  version: string
  playersOnline: number | null
  playersMax: number | null
  latencyMs: number | null
  motd: string
  icon: string
  players: { name: string; id: string }[]
  provider: string
}
export interface StatusReading {
  generatedAt: number | null
  refreshAfterMs: number
  overall: StatusTone
  services: StatusService[]
  node: { name: string; cpu: number | null; memory: number | null; status: StatusTone }
  minecraft: MinecraftReading
  availability: { time: number; online: boolean }[]
  stale: boolean
}
export interface StatusHistoryPoint {
  time: number
  overall: StatusTone
  services: StatusService[]
  players: number | null
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10000) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
export const statusTone = (v: unknown): StatusTone =>
  v === 'operational' || v === 'degraded' || v === 'outage' ? v : 'unknown'
export function httpSource(v: unknown, fallback: string): string {
  try {
    const u = new URL(str(v) || fallback)
    if (
      u.username ||
      u.password ||
      (u.protocol !== 'https:' &&
        !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)))
    )
      return fallback
    return u.href
  } catch {
    return fallback
  }
}
export interface StatusConfig {
  url: string
  historyUrl: string
  node: boolean
  availability: boolean
  latency: boolean
}
export function statusConfig(value: unknown): StatusConfig {
  const v = record(value)
  const url = httpSource(v.url, STATUS_URL)
  return {
    url,
    historyUrl:
      typeof v.historyUrl === 'string'
        ? httpSource(v.historyUrl, '')
        : url === STATUS_URL
          ? STATUS_HISTORY_URL
          : '',
    node: v.node !== false,
    availability: v.availability !== false,
    latency: v.latency !== false,
  }
}
function services(value: unknown): StatusService[] {
  return (Array.isArray(value) ? value : [])
    .map(record)
    .slice(0, 40)
    .map((s, i) => ({
      id: str(s.id) || String(i),
      name: str(s.name) || str(s.id),
      status: statusTone(s.status),
      latencyMs: num(s.latencyMs),
    }))
}
/** 不把超时或未知状态标成离线；人数 0 与缺失人数分别保留。 */
export function parseMinecraft(value: unknown): MinecraftReading {
  const v = record(value)
  const p = record(v.players)
  const version = record(v.version)
  const online = typeof v.online === 'boolean' ? v.online : null
  const status = v.status
    ? statusTone(v.status)
    : online === true
      ? 'operational'
      : online === false
        ? 'outage'
        : 'unknown'
  const samples = Array.isArray(p.sample)
    ? p.sample
    : Array.isArray(p.list)
      ? p.list
      : Array.isArray(v.sample)
        ? v.sample
        : []
  const icon = str(v.favicon ?? v.icon)
  return {
    online: status === 'unknown' ? null : online,
    status,
    address: str(v.address),
    version: str(v.version) || str(version.name_clean ?? version.name),
    playersOnline: num(v.playersOnline ?? p.online),
    playersMax: num(v.playersMax ?? p.max),
    latencyMs: num(v.latencyMs ?? v.round_trip_latency),
    provider: str(v.provider),
    motd: typeof v.motd === 'string' ? v.motd : str(record(v.motd).raw) || plainMotd(v.description),
    icon: /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(icon) ? icon : '',
    players: samples
      .map(record)
      .slice(0, 12)
      .map((p) => ({ name: str(p.name ?? p.name_clean ?? p.name_raw), id: str(p.id ?? p.uuid) }))
      .filter((p) => p.name),
  }
}
/** Minecraft 可读取独立状态 JSON，不要求网站监控的 services / overall 字段。 */
export function parseMinecraftSnapshot(value: unknown) {
  const v = record(value)
  return {
    reading: parseMinecraft('minecraft' in v ? v.minecraft : v),
    generatedAt: num(v.generatedAt),
    refreshAfterMs: Math.min(86400000, Math.max(1000, num(v.refreshAfterMs) ?? 60000)),
  }
}
function plainMotd(value: unknown, inherited: Record<string, unknown> = {}, depth = 0): string {
  if (depth > 32) return ''
  if (typeof value === 'string') return value.slice(0, 10000)
  if (Array.isArray(value))
    return value
      .slice(0, 128)
      .map((v) => plainMotd(v, inherited, depth + 1))
      .join('')
      .slice(0, 10000)
  const v = record(value)
  const style = { ...inherited, ...v }
  const names = [
    'black',
    'dark_blue',
    'dark_green',
    'dark_aqua',
    'dark_red',
    'dark_purple',
    'gold',
    'gray',
    'dark_gray',
    'blue',
    'green',
    'aqua',
    'red',
    'light_purple',
    'yellow',
    'white',
  ]
  const color = typeof style.color === 'string' ? style.color : ''
  const colorCode = names.includes(color)
    ? `§${names.indexOf(color).toString(16)}`
    : /^#[a-f0-9]{6}$/i.test(color)
      ? '§x' +
        color
          .slice(1)
          .split('')
          .map((c) => `§${c}`)
          .join('')
      : ''
  const codes = `§r${colorCode}${style.bold ? '§l' : ''}${style.italic ? '§o' : ''}${style.strikethrough ? '§m' : ''}${style.underlined ? '§n' : ''}`
  return (
    codes +
    str(v.text) +
    (Array.isArray(v.extra)
      ? v.extra
          .slice(0, 128)
          .map((child) => plainMotd(child, style, depth + 1))
          .join('')
      : '')
  ).slice(0, 10000)
}
export function parseStatus(value: unknown): StatusReading {
  const v = record(value)
  if (!Array.isArray(v.services) || !('overall' in v)) throw new Error('invalid-status')
  const node = record(v.node)
  return {
    generatedAt: num(v.generatedAt),
    refreshAfterMs: Math.min(86400000, Math.max(1000, num(v.refreshAfterMs) ?? 60000)),
    overall: statusTone(v.overall),
    services: services(v.services),
    node: {
      name: str(node.name),
      cpu: num(node.cpuUsage),
      memory: num(node.memoryUsage),
      status: statusTone(node.status),
    },
    minecraft: parseMinecraft(v.minecraft),
    availability: (Array.isArray(v.history) ? v.history : [])
      .map(record)
      .filter((p) => num(p.time) !== null && (p.status === 'online' || p.status === 'offline'))
      .map((p) => ({ time: p.time as number, online: p.status === 'online' }))
      .sort((a, b) => a.time - b.time),
    stale: v.stale === true,
  }
}
export function parseStatusHistory(value: unknown): StatusHistoryPoint[] {
  const v = record(value)
  const points = Array.isArray(value) ? value : Array.isArray(v.samples) ? v.samples : []
  const byTime = new Map<number, StatusHistoryPoint>()
  for (const value of points) {
    const p = record(value),
      time = num(p.capturedAt ?? p.time)
    if (time === null) continue
    byTime.set(time, {
      time,
      overall: statusTone(p.overall),
      services: services(p.services),
      players: num(p.playersOnline) ?? parseMinecraft(p.minecraft).playersOnline,
    })
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time).slice(-1000)
}
export interface MinecraftServer {
  name: string
  kind: 'youzai' | 'java' | 'bedrock'
  fallbackKind: 'java' | 'bedrock' | 'none'
  address: string
  sourceUrl: string
  historyUrl: string
  actions: { label: string; url: string; kind: 'url' | 'copy' }[]
}
export interface MinecraftConfig {
  route: 'auto' | 'direct'
  servers: MinecraftServer[]
  serverIndex: number
  version: boolean
  latency: boolean
  icon: boolean
  motd: boolean
  players: boolean
  avatars: boolean
  history: boolean
}
export function minecraftConfig(value: unknown): MinecraftConfig {
  const v = record(value)
  const values = Array.isArray(v.servers)
    ? v.servers
    : [
        {
          name: '',
          kind: 'youzai',
          address: 'play.mcyzw.top:25703',
          sourceUrl: STATUS_URL,
          historyUrl: STATUS_HISTORY_URL,
        },
      ]
  const servers: MinecraftServer[] = values
    .map(record)
    .slice(0, 12)
    .map((s) => ({
      name: str(s.name),
      kind: s.kind === 'java' || s.kind === 'bedrock' ? s.kind : 'youzai',
      fallbackKind:
        s.fallbackKind === 'none' || s.fallbackKind === 'bedrock'
          ? s.fallbackKind
          : s.kind === 'java' || s.kind === 'bedrock'
            ? 'none'
            : 'java',
      address: str(s.address).trim().slice(0, 260),
      sourceUrl: httpSource(s.sourceUrl, STATUS_URL),
      historyUrl: str(s.historyUrl) ? httpSource(s.historyUrl, '') : '',
      actions: (Array.isArray(s.actions) ? s.actions : [])
        .map(record)
        .slice(0, 8)
        .map((a) => ({
          label: str(a.label),
          url: httpSource(a.url, ''),
          kind: a.kind === 'copy' ? ('copy' as const) : ('url' as const),
        }))
        .filter((a) => a.label && (a.kind === 'copy' || a.url)),
    }))
  return {
    route: v.route === 'direct' ? 'direct' : 'auto',
    servers,
    serverIndex: Math.floor(num(v.serverIndex) ?? 0),
    version: v.version !== false,
    latency: v.latency !== false,
    icon: v.icon !== false,
    motd: v.motd !== false,
    players: v.players !== false,
    avatars: v.avatars !== false,
    history: v.history !== false,
  }
}
const COLORS = [
  '#000000',
  '#0000aa',
  '#00aa00',
  '#00aaaa',
  '#aa0000',
  '#aa00aa',
  '#ffaa00',
  '#aaaaaa',
  '#555555',
  '#5555ff',
  '#55ff55',
  '#55ffff',
  '#ff5555',
  '#ff55ff',
  '#ffff55',
  '#ffffff',
]
export interface MotdRun {
  text: string
  color: string
  bold: boolean
  italic: boolean
  strike: boolean
  underline: boolean
}
/** 输出文本片段，Vue 文本插值渲染，MOTD 中的 HTML 永远不执行。 */
export function motdRuns(text: string): MotdRun[] {
  const out: MotdRun[] = []
  let style = { color: '', bold: false, italic: false, strike: false, underline: false }
  let body = ''
  const flush = () => {
    if (body) out.push({ text: body, ...style })
    body = ''
  }
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '§' || i + 1 >= text.length) {
      body += text[i]
      continue
    }
    const code = text[++i]!.toLowerCase()
    flush()
    if (code === 'x' && /^(?:§[0-9a-f]){6}$/i.test(text.slice(i + 1, i + 13))) {
      const hex = text.slice(i + 1, i + 13).replaceAll('§', '')
      style = { color: `#${hex}`, bold: false, italic: false, strike: false, underline: false }
      i += 12
    } else if (/^[0-9a-f]$/.test(code))
      style = {
        color: COLORS[parseInt(code, 16)]!,
        bold: false,
        italic: false,
        strike: false,
        underline: false,
      }
    else if (code === 'r')
      style = { color: '', bold: false, italic: false, strike: false, underline: false }
    else if (code === 'l') style.bold = true
    else if (code === 'o') style.italic = true
    else if (code === 'm') style.strike = true
    else if (code === 'n') style.underline = true
  }
  flush()
  return out
}
