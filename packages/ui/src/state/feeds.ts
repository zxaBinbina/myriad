import {
  HOT_REQUESTS,
  parseHot,
  parseFeed,
  httpUrl,
  feedConfig,
  parseArticle,
  type ReaderArticle,
  type FeedSnapshot,
  type FeedEntry,
  type WidgetItem,
} from '@zxabinbina/myriad-core'
import type { MyriadStore } from './store'
import { grantSources, personalApi, widgetBase, widgetJson } from './widgetRequests'
import { PermissionRequired } from '../composables/useVisibleResource'

export async function publicText(
  store: MyriadStore,
  url: string,
  signal: AbortSignal,
  init: RequestInit = {},
  cookies = false,
) {
  return (await publicPage(store, url, signal, init, cookies)).text
}
async function publicPage(
  store: MyriadStore,
  url: string,
  signal: AbortSignal,
  init: RequestInit = {},
  cookies = false,
) {
  if (store.platform.origins && !(await store.platform.origins.has(new URL(url).origin)))
    throw new PermissionRequired()
  const res = await fetch(url, {
    ...init,
    credentials: cookies ? 'include' : 'omit',
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
  })
  if (!res.ok) throw new Error('upstream')
  if (Number(res.headers.get('Content-Length')) > 1024 * 1024) throw new Error('too-large')
  const reader = res.body?.getReader(),
    decoder = new TextDecoder()
  if (!reader) throw new Error('upstream')
  let bytes = 0,
    text = ''
  for (;;) {
    const r = await reader.read()
    if (r.done) break
    bytes += r.value.byteLength
    if (bytes > 1024 * 1024) {
      await reader.cancel()
      throw new Error('too-large')
    }
    text += decoder.decode(r.value, { stream: true })
  }
  return { text: text + decoder.decode(), url: res.url || url }
}
export function feedOrigins(store: MyriadStore, route: string, source: string, rss: string) {
  const base = widgetBase(store, route)
  const direct = rss || HOT_REQUESTS[source]?.url || ''
  return [
    ...new Set(
      [
        ...(base ? [new URL(base).origin] : []),
        ...(!base || store.platform.kind === 'extension' ? [direct && new URL(direct).origin] : []),
      ].filter(Boolean),
    ),
  ]
}
export async function loadFeed(
  store: MyriadStore,
  route: string,
  source: string,
  rss: string,
  period: number,
  signal: AbortSignal,
): Promise<FeedSnapshot> {
  const base = widgetBase(store, route)
  if (base) {
    const url = new URL(`${base}/${rss ? 'rss' : 'hot'}`)
    url.search = new URLSearchParams({
      ...(rss ? { url: rss } : { source }),
      period: String(period),
    }).toString()
    try {
      return await widgetJson(store, url, signal, 15000)
    } catch (e) {
      signal.throwIfAborted()
      if (
        e instanceof PermissionRequired ||
        route === 'worker' ||
        store.platform.kind !== 'extension'
      )
        throw e
    }
  }
  if (rss) return parseFeed(await publicText(store, rss, signal), rss)
  const r = HOT_REQUESTS[source]
  if (!r) throw new Error('source-unavailable')
  const text = await publicText(
    store,
    r.url,
    signal,
    r.body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(r.body),
        }
      : {},
    store.platform.kind === 'extension',
  )
  return parseHot(source, r.format ? text : JSON.parse(text))
}
export function toggleFeedFavorite(item: WidgetItem, entry: FeedEntry) {
  const cfg = feedConfig(item.config)
  item.config.favorites = cfg.favorites.some((e) => e.id === entry.id)
    ? cfg.favorites.filter((e) => e.id !== entry.id)
    : [...cfg.favorites, entry].slice(-300)
}
export function openFeed(store: MyriadStore, item: WidgetItem, entry: FeedEntry) {
  if (!httpUrl(entry.url)) return
  const cfg = feedConfig(item.config)
  if (cfg.readMarks) item.config.read = [...new Set([...cfg.read, entry.id])].slice(-1000)
  if (!cfg.preview) {
    store.openUrl(entry.url)
    return
  }
  // Invoke optional permissions directly in the original click, before asynchronous work.
  const base = widgetBase(store, 'auto')
  const origins = base ? [new URL(base).origin] : []
  if (store.platform.preview) {
    const ready = store.platform.preview.prepare(entry.url, origins).catch(() => null)
    store.ui.feedPreview = { itemId: item.id, entry, ready }
  } else {
    const permission = grantSources(store, origins)
    store.ui.feedPreview = { itemId: item.id, entry }
    void permission.catch(() => {})
  }
}
export async function loadSummary(store: MyriadStore, url: string, signal: AbortSignal) {
  return (await personalApi(store, signal)).summary(url, store.lang.value, signal)
}
/** Hover uses only existing permissions; permission prompts stay in the click handler. */
export async function loadReader(
  store: MyriadStore,
  target: string,
  signal: AbortSignal,
): Promise<ReaderArticle | undefined> {
  const base = widgetBase(store, 'auto')
  if (base) {
    const url = new URL(`${base}/reader`)
    url.searchParams.set('url', target)
    return widgetJson(store, url, signal, 15000)
  }
  if (store.platform.kind === 'extension') {
    const page = await publicPage(store, target, signal)
    return parseArticle(page.text, page.url)
  }
}
