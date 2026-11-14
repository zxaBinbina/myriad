import { addDays, ymd, type PlainDate } from '../calendar/dates'
export const FIAT_CURRENCIES = [
  'CNY',
  'USD',
  'EUR',
  'JPY',
  'HKD',
  'GBP',
  'AUD',
  'CAD',
  'CHF',
  'KRW',
  'SGD',
  'NZD',
  'INR',
  'RUB',
  'TWD',
  'THB',
  'MYR',
  'IDR',
  'BRL',
  'ZAR',
  'AED',
]
export const CRYPTO_CURRENCIES = ['BTC', 'ETH', 'SOL']
export const FRANKFURTER_ORIGIN = 'https://api.frankfurter.dev'
export const ER_ORIGIN = 'https://open.er-api.com'
export const CURRENCY_API_ORIGIN = 'https://cdn.jsdelivr.net'
const currency = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^[A-Za-z]{2,12}$/.test(v) ? v.toUpperCase() : fallback
export interface CurrencyConfig {
  route: 'auto' | 'direct'
  base: string
  quote: string
  crypto: boolean
  history: boolean
}
export function defaultCurrency(timeZone = '') {
  const byZone: Record<string, string> = {
    'Asia/Shanghai': 'CNY',
    'Asia/Chongqing': 'CNY',
    'Asia/Urumqi': 'CNY',
    'Asia/Tokyo': 'JPY',
    'Asia/Hong_Kong': 'HKD',
    'Asia/Taipei': 'TWD',
    'Asia/Seoul': 'KRW',
    'Asia/Singapore': 'SGD',
    'Europe/London': 'GBP',
    'Europe/Paris': 'EUR',
    'Europe/Berlin': 'EUR',
    'America/New_York': 'USD',
    'America/Los_Angeles': 'USD',
    'America/Toronto': 'CAD',
    'Australia/Sydney': 'AUD',
  }
  return byZone[timeZone] ?? 'CNY'
}
export function currencyConfig(value: unknown, timeZone = ''): CurrencyConfig {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const crypto = v.crypto === true
  let base = currency(v.base, defaultCurrency(timeZone)),
    quote = currency(v.quote, 'USD')
  if (!crypto) {
    if (CRYPTO_CURRENCIES.includes(base)) base = defaultCurrency(timeZone)
    if (CRYPTO_CURRENCIES.includes(quote)) quote = 'USD'
  }
  return {
    route: v.route === 'direct' ? 'direct' : 'auto',
    base,
    quote,
    crypto,
    history: v.history !== false,
  }
}
export interface CurrencyReading {
  base: string
  quote: string
  date: string
  rate: number
  provider: string
  history: { date: string; rate: number }[]
}
export function exchangeRate(
  value: unknown,
  quote: string,
  provider: 'frankfurter' | 'er' | 'currency-api',
): { rate: number; date: string } {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const rates =
    provider === 'currency-api'
      ? Object.values(v).find((x) => x && typeof x === 'object' && !Array.isArray(x))
      : v.rates
  const rate =
    rates && typeof rates === 'object'
      ? (rates as Record<string, unknown>)[
          provider === 'currency-api' ? quote.toLowerCase() : quote.toUpperCase()
        ]
      : undefined
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0)
    throw new Error('unsupported-currency')
  const date =
    typeof v.date === 'string'
      ? v.date
      : typeof v.time_last_update_unix === 'number'
        ? new Date(v.time_last_update_unix * 1000).toISOString().slice(0, 10)
        : ''
  return { rate, date }
}
export function currencyHistory(value: unknown, quote: string) {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const rates = v.rates && typeof v.rates === 'object' ? (v.rates as Record<string, unknown>) : {}
  return Object.entries(rates)
    .flatMap(([date, values]) => {
      const rate =
        values && typeof values === 'object' ? (values as Record<string, unknown>)[quote] : null
      return typeof rate === 'number' &&
        rate > 0 &&
        Number.isFinite(rate) &&
        /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? [{ date, rate }]
        : []
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}
/** 备用源按 5 天采样；日期保留原间隔，图表不会把缺失日补成 0。 */
export function sampledCurrencyDates(today: PlainDate): string[] {
  return [30, 25, 20, 15, 10, 5, 0].map((days) => ymd(addDays(today, -days)))
}
export function convertCurrency(amount: number, rate: number) {
  return Number.isFinite(amount) && Number.isFinite(rate) && rate > 0 ? amount * rate : null
}
