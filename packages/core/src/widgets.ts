import { addDays, daysInMonth, plainToUtc, type PlainDate, ymd } from './calendar/dates'

export interface WeatherCity {
  name: string
  latitude: number
  longitude: number
}

export interface WeatherConfig {
  route: 'auto' | 'direct'
  cities: WeatherCity[]
  cityIndex: number
  unit: 'celsius' | 'fahrenheit'
  apparent: boolean
  hourly: boolean
  forecast: boolean
  airQuality: boolean
  sun: boolean
}

export interface Quote {
  id: string
  text: string
  source: string
  author: string
}
export const QUOTE_CATEGORIES = 'abcdefghijkl'.split('')
export interface QuoteConfig {
  route: 'auto' | 'direct'
  categories: string[]
  favorites: Quote[]
  fromFavorites: boolean
}
export interface CountdownConfig {
  includeTodos?: boolean
  title: string
  date: string
  repeat: 'none' | 'year' | 'month' | 'week'
  showElapsed: boolean
}

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const text = (v: unknown, fallback = '') => (typeof v === 'string' ? v.slice(0, 1000) : fallback)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function weatherConfig(value: unknown): WeatherConfig {
  const v = record(value)
  return {
    route: v.route === 'direct' ? 'direct' : 'auto',
    cities: (Array.isArray(v.cities) ? v.cities : [])
      .map(record)
      .filter(
        (c) =>
          finite(c.latitude) &&
          Math.abs(c.latitude) <= 90 &&
          finite(c.longitude) &&
          Math.abs(c.longitude) <= 180 &&
          typeof c.name === 'string',
      )
      .slice(0, 12)
      .map((c) => ({
        name: text(c.name),
        latitude: c.latitude as number,
        longitude: c.longitude as number,
      })),
    unit: v.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius',
    apparent: v.apparent !== false,
    cityIndex: finite(v.cityIndex) ? Math.max(0, Math.floor(v.cityIndex)) : 0,
    hourly: v.hourly !== false,
    forecast: v.forecast !== false,
    airQuality: v.airQuality !== false,
    sun: v.sun !== false,
  }
}

export function parseQuote(value: unknown): Quote {
  const v = record(value)
  const body = text(v.hitokoto ?? v.text).trim()
  if (!body) throw new Error('invalid-quote')
  return {
    id: text(typeof v.id === 'number' ? String(v.id) : v.id, body),
    text: body,
    source: text(v.from ?? v.source),
    author: text(v.from_who ?? v.author),
  }
}

export function quoteConfig(value: unknown): QuoteConfig {
  const v = record(value)
  const favorites: Quote[] = []
  for (const q of Array.isArray(v.favorites) ? v.favorites : []) {
    try {
      const quote = parseQuote(q)
      if (!favorites.some((f) => f.id === quote.id)) favorites.push(quote)
    } catch {
      /* 忽略损坏的收藏，不影响其他条目 */
    }
  }
  return {
    route: v.route === 'direct' ? 'direct' : 'auto',
    categories: [...new Set(Array.isArray(v.categories) ? v.categories : [])]
      .filter((c): c is string => typeof c === 'string' && QUOTE_CATEGORIES.includes(c))
      .sort(),
    favorites,
    fromFavorites: v.fromFavorites === true,
  }
}

export function parsePlainDate(value: string): PlainDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  return d.year >= 1000 &&
    d.year <= 9999 &&
    d.month >= 1 &&
    d.month <= 12 &&
    d.day >= 1 &&
    d.day <= daysInMonth(d.year, d.month)
    ? d
    : null
}

export function countdownConfig(value: unknown): CountdownConfig {
  const v = record(value)
  return {
    includeTodos: v.includeTodos !== false,
    title: text(v.title),
    date: typeof v.date === 'string' && parsePlainDate(v.date) ? v.date : '2025-06-20',
    repeat: v.repeat === 'none' || v.repeat === 'month' || v.repeat === 'week' ? v.repeat : 'year',
    showElapsed: v.showElapsed !== false,
  }
}

export function dateDistance(from: PlainDate, to: PlainDate): number {
  return Math.round((plainToUtc(to).getTime() - plainToUtc(from).getTime()) / 86400000)
}

/** 循环日期保留原始日号：2 月短月夹到月末，后续月份恢复原日号。 */
export function countdownOccurrence(config: CountdownConfig, today: PlainDate) {
  const start = parsePlainDate(config.date) ?? { year: 2025, month: 6, day: 20 }
  let target = start
  if (dateDistance(today, start) < 0) {
    if (config.repeat === 'week') {
      target = addDays(start, Math.ceil(dateDistance(start, today) / 7) * 7)
    } else if (config.repeat === 'year' || config.repeat === 'month') {
      let year = today.year
      let month = config.repeat === 'year' ? start.month : today.month
      const candidate = () => ({ year, month, day: Math.min(start.day, daysInMonth(year, month)) })
      target = candidate()
      if (dateDistance(today, target) < 0) {
        if (config.repeat === 'year') year++
        else if (++month > 12) {
          month = 1
          year++
        }
        target = candidate()
      }
    }
  }
  return {
    date: ymd(target),
    remaining: dateDistance(today, target),
    elapsed: dateDistance(start, today),
  }
}

export interface WeatherReading {
  temperature: number | null
  apparent: number | null
  code: number | null
  isDay: boolean
  time: string
  hourly: { time: string; temperature: number | null; code: number | null }[]
  daily: {
    date: string
    low: number | null
    high: number | null
    code: number | null
    sunrise: string
    sunset: string
  }[]
  aqi: number | null
}

/** 保留缺失值；上游 null 不能被显示成 0°C 或空气质量良好。 */
export function parseWeather(value: unknown): WeatherReading {
  const v = record(value)
  const current = record(v.current)
  if (!finite(current.temperature_2m)) throw new Error('invalid-weather')
  const h = record(v.hourly)
  const d = record(v.daily)
  const numberAt = (obj: Record<string, unknown>, key: string, i: number) => {
    const value = Array.isArray(obj[key]) ? obj[key][i] : undefined
    return finite(value) ? value : null
  }
  const stringAt = (obj: Record<string, unknown>, key: string, i: number) =>
    text(Array.isArray(obj[key]) ? obj[key][i] : '')
  return {
    temperature: current.temperature_2m,
    apparent: finite(current.apparent_temperature) ? current.apparent_temperature : null,
    code: finite(current.weather_code) ? current.weather_code : null,
    isDay: current.is_day !== 0,
    time: text(current.time),
    hourly: (Array.isArray(h.time) ? h.time : [])
      .map((time, i) => ({
        time: text(time),
        temperature: numberAt(h, 'temperature_2m', i),
        code: numberAt(h, 'weather_code', i),
      }))
      .filter((p) => p.time >= text(current.time))
      .slice(0, 24),
    daily: (Array.isArray(d.time) ? d.time : []).slice(0, 7).map((date, i) => ({
      date: text(date),
      low: numberAt(d, 'temperature_2m_min', i),
      high: numberAt(d, 'temperature_2m_max', i),
      code: numberAt(d, 'weather_code', i),
      sunrise: stringAt(d, 'sunrise', i),
      sunset: stringAt(d, 'sunset', i),
    })),
    aqi: finite(v.aqi) ? v.aqi : null,
  }
}

export function weatherCondition(code: number | null): string {
  if (code === 0) return 'clear'
  if (code !== null && code <= 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code !== null && ((code >= 71 && code <= 77) || code === 85 || code === 86)) return 'snow'
  if (code !== null && code >= 95) return 'thunder'
  if (code !== null && code >= 51 && code <= 82) return 'rain'
  return 'unknown'
}

export function temperatureIn(value: number | null, unit: WeatherConfig['unit']) {
  return value === null
    ? '—'
    : String(Math.round(unit === 'fahrenheit' ? (value * 9) / 5 + 32 : value))
}
