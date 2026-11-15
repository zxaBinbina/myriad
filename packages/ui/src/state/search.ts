import {
  searchApiUrl,
  webSearchUrl,
  parseSearchHtml,
  parseSearchJson,
  type SearchPage,
  type SearchRoute,
  SEARCH_PROVIDERS,
} from '@myriad/core'
import type { MyriadStore } from './store'
import { grantSources, widgetJson, widgetBase, personalApi } from './widgetRequests'
import { publicText } from './feeds'
import { PermissionRequired } from '../composables/useVisibleResource'

export function aggregateEngines(store: MyriadStore) {
  return store.settings.search.aggregate.engines.filter(
    (id, i, a) => SEARCH_PROVIDERS.includes(id as never) && a.indexOf(id) === i,
  )
}
export function searchOrigins(store: MyriadStore, ids = aggregateEngines(store)) {
  const base = widgetBase(store, 'auto')
  return [
    ...new Set(
      ids.flatMap((id) => {
        const route = store.settings.search.aggregate.routes[id] || 'auto'
        if (route === 'link') return []
        const url =
          searchApiUrl(id, '', 0, store.lang.value) ||
          (store.platform.kind === 'extension' ? webSearchUrl(id, '') : '')
        return [
          ...(base ? [new URL(base).origin] : []),
          ...(url && (route !== 'worker' || !base) ? [new URL(url).origin] : []),
        ]
      }),
    ),
  ]
}
export function searchFromLocation(store: MyriadStore) {
  if (!location.hash.startsWith('#search?')) {
    store.ui.search = null
    return
  }
  const params = new URLSearchParams(location.hash.slice(8)),
    q = (params.get('q') || '').trim().slice(0, 300)
  store.ui.search = q ? { q, engine: params.get('engine') || '', nonce: Date.now() } : null
}
export function openAggregate(store: MyriadStore, q: string, engine: string) {
  const permission = grantSources(store, searchOrigins(store))
  const url = new URL(location.href)
  url.hash = `search?${new URLSearchParams({ q, engine })}`
  if (store.settings.search.openIn === 'new') store.openUrl(url.href, true)
  else {
    history.pushState(null, '', url)
    store.ui.search = { q, engine, nonce: Date.now() }
    void permission
      .then(() => {
        if (store.ui.search?.q === q) store.ui.search.nonce++
      })
      .catch(() => {})
  }
}
export function closeAggregate(store: MyriadStore) {
  const url = new URL(location.href)
  url.hash = ''
  history.pushState(null, '', url)
  store.ui.search = null
}
export async function loadSearch(
  store: MyriadStore,
  engine: string,
  q: string,
  page: number,
  signal: AbortSignal,
): Promise<SearchPage> {
  const route: SearchRoute = store.settings.search.aggregate.routes[engine] || 'auto'
  const web = !!webSearchUrl(engine, q, page),
    base = widgetBase(store, route)
  if (route === 'link' || (web && store.platform.kind === 'web' && !base))
    throw new Error('link-only')
  // Free official site APIs can be called by visitors; configured Worker is an optional fallback.
  if (!web) {
    const direct = searchApiUrl(engine, q, page, store.lang.value)
    if (!direct) throw new Error('link-only')
    if (base && route === 'worker') {
      const url = new URL(`${base}/search`)
      url.search = new URLSearchParams({
        engine,
        q,
        page: String(page),
        lang: store.lang.value,
      }).toString()
      return widgetJson(store, url, signal)
    }
    try {
      return parseSearchJson(
        engine,
        await widgetJson(store, new URL(direct), signal),
        page,
        store.lang.value,
      )
    } catch (e) {
      signal.throwIfAborted()
      if (!base || route === 'direct' || e instanceof PermissionRequired) throw e
      const url = new URL(`${base}/search`)
      url.search = new URLSearchParams({
        engine,
        q,
        page: String(page),
        lang: store.lang.value,
      }).toString()
      return widgetJson(store, url, signal)
    }
  }
  if (store.platform.kind === 'extension' && route !== 'worker') {
    try {
      return parseSearchHtml(
        engine,
        await publicText(store, webSearchUrl(engine, q, page), signal, {}, true),
        page,
      )
    } catch (e) {
      signal.throwIfAborted()
      if (route === 'direct' || !base || e instanceof PermissionRequired) throw e
    }
  }
  if (!base) throw new Error('link-only')
  return (await personalApi(store, signal)).search(
    new URLSearchParams({ engine, q, page: String(page), lang: store.lang.value }),
    signal,
  )
}
