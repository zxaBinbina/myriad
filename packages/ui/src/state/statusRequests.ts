import {
  parseMinecraft,
  parseMinecraftSnapshot,
  parseStatus,
  parseStatusHistory,
  type MinecraftServer,
  type StatusConfig,
  type StatusHistoryPoint,
} from '@myriad/core'
import type { MyriadStore } from './store'
import { PermissionRequired } from '../composables/useVisibleResource'
import { widgetBase, widgetJson } from './widgetRequests'
export const MCSTATUS_ORIGIN = 'https://api.mcstatus.io'
interface SourceEntry<T> {
  value: T
  expires: number
}
/** 两种组件共享同一状态快照，手动刷新也遵守 refreshAfterMs。 */
async function source<T>(
  store: MyriadStore,
  url: string,
  signal: AbortSignal,
  parse: (raw: unknown) => T,
  age: number | ((value: T) => number),
  timeoutMs = 10000,
  cacheType = '',
) {
  const key = `myriad.cache.source.${cacheType ? `${cacheType}.` : ''}${url}`
  const read = () => store.platform.storage.get<SourceEntry<T>>(key)
  const task = async () => {
    signal.throwIfAborted()
    const hit = await read()
    signal.throwIfAborted()
    if (hit && hit.expires > Date.now()) return hit.value
    const value = parse(await widgetJson(store, new URL(url), signal, timeoutMs))
    signal.throwIfAborted()
    await store.platform.storage.set(key, {
      value,
      expires: Date.now() + (typeof age === 'function' ? age(value) : age),
    })
    return value
  }
  return navigator.locks ? navigator.locks.request(key, { signal }, task) : task()
}
/** 共用原始 JSON 缓存，Minecraft 不再依赖完整网站监控格式；不读取旧解析结果缓存。 */
const statusPayload = (store: MyriadStore, url: string, signal: AbortSignal) =>
  source(
    store,
    url,
    signal,
    (raw) => raw,
    (raw) => parseMinecraftSnapshot(raw).refreshAfterMs,
    10000,
    'status-json.v2',
  )
export const statusSnapshot = async (store: MyriadStore, url: string, signal: AbortSignal) =>
  parseStatus(await statusPayload(store, url, signal))

async function history(store: MyriadStore, url: string, hours: number, signal: AbortSignal) {
  const target = new URL(url)
  target.searchParams.set('hours', String(hours))
  return source(store, target.href, signal, parseStatusHistory, 60000)
}
async function optionalHistory(
  store: MyriadStore,
  url: string,
  hours: number,
  signal: AbortSignal,
) {
  if (!url) return { points: [] as StatusHistoryPoint[], unavailable: false }
  try {
    return { points: await history(store, url, hours, signal), unavailable: false }
  } catch (e) {
    if (signal.aborted || e instanceof PermissionRequired) throw e
    return { points: [] as StatusHistoryPoint[], unavailable: true }
  }
}
export async function loadServiceStatus(
  store: MyriadStore,
  config: StatusConfig,
  withHistory: boolean,
  signal: AbortSignal,
) {
  const [snapshot, h] = await Promise.all([
    statusSnapshot(store, config.url, signal),
    optionalHistory(store, withHistory ? config.historyUrl : '', 24, signal),
  ])
  return { snapshot, history: h.points, historyUnavailable: h.unavailable }
}
export async function loadMinecraft(
  store: MyriadStore,
  route: string,
  server: MinecraftServer,
  withHistory: boolean,
  signal: AbortSignal,
) {
  let reading: ReturnType<typeof parseMinecraft>,
    refreshAfterMs = 60000,
    generatedAt: number | null = Date.now()
  const queryAddress = async (kind: 'java' | 'bedrock') => {
    signal.throwIfAborted()
    const base = widgetBase(store, route)
    const url = new URL(
      base
        ? `${base}/minecraft`
        : `${MCSTATUS_ORIGIN}/v2/status/${kind}/${encodeURIComponent(server.address)}`,
    )
    if (base) url.search = new URLSearchParams({ address: server.address, kind }).toString()
    return source(
      store,
      url.href,
      signal,
      (raw) => {
        const parsed = parseMinecraft(raw)
        if (parsed.online === null) throw new Error('invalid-minecraft-status')
        return {
          ...parsed,
          address: parsed.address || server.address,
          provider: parsed.provider || (base ? '' : 'mcstatus.io'),
        }
      },
      60000,
      20000,
      'minecraft.v2',
    )
  }
  let usedFallback = false
  if (server.kind === 'youzai') {
    const fallbackKind = server.fallbackKind
    const canFallback = fallbackKind !== 'none' && !!server.address
    try {
      const snapshot = parseMinecraftSnapshot(await statusPayload(store, server.sourceUrl, signal))
      reading = snapshot.reading
      refreshAfterMs = snapshot.refreshAfterMs
      generatedAt = snapshot.generatedAt
      if (canFallback && reading.status === 'unknown') throw new Error('unknown-minecraft-status')
    } catch (e) {
      // 权限需由用户点击申请；隐藏后也不得开始备用请求。
      if (!canFallback || signal.aborted || e instanceof PermissionRequired) throw e
      reading = await queryAddress(fallbackKind)
      refreshAfterMs = 60000
      generatedAt = Date.now()
      usedFallback = true
    }
  } else reading = await queryAddress(server.kind)
  signal.throwIfAborted()
  const h = await optionalHistory(store, withHistory ? server.historyUrl : '', 72, signal)
  return {
    reading,
    refreshAfterMs,
    generatedAt,
    usedFallback,
    history: h.points,
    historyUnavailable: h.unavailable,
  }
}
export function minecraftOrigins(
  store: MyriadStore,
  route: string,
  server: MinecraftServer,
  withHistory: boolean,
) {
  const base = widgetBase(store, route)
  return [
    ...new Set([
      ...(server.kind === 'youzai' ? [new URL(server.sourceUrl).origin] : []),
      ...(server.kind !== 'youzai' || (server.fallbackKind !== 'none' && server.address)
        ? [base ? new URL(base).origin : MCSTATUS_ORIGIN]
        : []),
      ...(withHistory && server.historyUrl ? [new URL(server.historyUrl).origin] : []),
    ]),
  ]
}
