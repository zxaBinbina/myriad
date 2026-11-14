import { parseQuote, parseWeather, type WeatherCity } from '@myriad/core'
import { PermissionRequired } from '../composables/useVisibleResource'
import type { MyriadStore } from './store'

export const WEATHER_ORIGIN = 'https://api.open-meteo.com'
export const AIR_ORIGIN = 'https://air-quality-api.open-meteo.com'
export const CITY_ORIGIN = 'https://geocoding-api.open-meteo.com'
export const QUOTE_ORIGIN = 'https://v1.hitokoto.cn'

export function widgetBase(store: MyriadStore, route: string) {
  const sync = store.local.sync
  if (route === 'direct' || !sync.enabled || !sync.apiBase) return ''
  try {
    const url = new URL(sync.apiBase)
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    )
      return ''
    return url.origin + url.pathname.replace(/\/$/, '').replace(/\/v1$/, '') + '/v1'
  } catch {
    return ''
  }
}

export async function widgetJson(
  store: MyriadStore,
  url: URL,
  signal: AbortSignal,
  timeoutMs = 10000,
) {
  if (store.platform.origins && !(await store.platform.origins.has(url.origin)))
    throw new PermissionRequired()
  signal.throwIfAborted()
  const timeout = AbortSignal.timeout(timeoutMs)
  // 此处只有公开免费接口，绝不带同步令牌。
  const res = await fetch(url, { signal: AbortSignal.any([signal, timeout]), credentials: 'omit' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
const get = widgetJson

export function grantSources(store: MyriadStore, origins: string[]) {
  const api = store.platform.origins
  if (!api) return Promise.resolve(true)
  const unique = [...new Set(origins)]
  if (!unique.length) return Promise.resolve(true)
  return api.requestMany
    ? api.requestMany(unique)
    : Promise.all(unique.map((origin) => api.request(origin))).then((results) =>
        results.every(Boolean),
      )
}

/** 必须直接在点击处理器中调用，先发起权限申请，再 await。 */
export function grantWidgetOrigins(store: MyriadStore, route: string, direct: string[]) {
  const base = widgetBase(store, route)
  const origins = base ? [new URL(base).origin] : direct
  return grantSources(store, origins)
}

export async function loadWeather(
  store: MyriadStore,
  route: string,
  city: WeatherCity,
  air: boolean,
  signal: AbortSignal,
) {
  const base = widgetBase(store, route)
  const url = new URL(base ? `${base}/weather` : `${WEATHER_ORIGIN}/v1/forecast`)
  url.search = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    ...(base
      ? { air: air ? '1' : '0' }
      : {
          timezone: 'auto',
          forecast_days: '7',
          current: 'temperature_2m,apparent_temperature,weather_code,is_day',
          hourly: 'temperature_2m,weather_code',
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset',
        }),
  }).toString()
  if (base) return parseWeather(await get(store, url, signal))
  const aqiUrl = new URL(`${AIR_ORIGIN}/v1/air-quality`)
  aqiUrl.search = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    current: 'us_aqi',
  }).toString()
  const [data, aqi] = await Promise.all([
    get(store, url, signal),
    air
      ? get(store, aqiUrl, signal).catch((e) => {
          if (e instanceof PermissionRequired) throw e
          return null
        })
      : Promise.resolve(null),
  ])
  return parseWeather({ ...data, aqi: aqi?.current?.us_aqi ?? null })
}

export async function searchCities(
  store: MyriadStore,
  route: string,
  name: string,
  language: string,
  signal: AbortSignal,
): Promise<WeatherCity[]> {
  const base = widgetBase(store, route)
  const url = new URL(base ? `${base}/weather/cities` : `${CITY_ORIGIN}/v1/search`)
  url.search = new URLSearchParams({ name, language, count: '8', format: 'json' }).toString()
  const data = await get(store, url, signal)
  return (Array.isArray(data.results) ? data.results : [])
    .map((c: Record<string, unknown>) => ({
      name: [c.name, c.admin1, c.country].filter(Boolean).join(' · '),
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
    }))
    .filter((c: WeatherCity) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude))
}

export async function loadQuote(
  store: MyriadStore,
  route: string,
  day: string,
  categories: string[],
  signal: AbortSignal,
) {
  const base = widgetBase(store, route)
  const url = new URL(base ? `${base}/quote` : `${QUOTE_ORIGIN}/`)
  if (base) url.searchParams.set('day', day)
  categories.forEach((c) => url.searchParams.append('c', c))
  return parseQuote(await get(store, url, signal))
}

export async function locateByIp(store: MyriadStore, route: string, signal: AbortSignal) {
  const base = widgetBase(store, route)
  if (!base) throw new Error('worker-required')
  const geo = await get(store, new URL(`${base}/geo`), signal)
  if (typeof geo.latitude !== 'number' || typeof geo.longitude !== 'number')
    throw new Error('no-geo')
  return {
    name: geo.city || geo.region || geo.country || 'IP',
    latitude: geo.latitude,
    longitude: geo.longitude,
  } as WeatherCity
}
