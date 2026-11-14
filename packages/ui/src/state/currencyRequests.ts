import {
  addDays,
  currencyHistory,
  exchangeRate,
  sampledCurrencyDates,
  ymd,
  FRANKFURTER_ORIGIN,
  ER_ORIGIN,
  CURRENCY_API_ORIGIN,
  type CurrencyConfig,
  type CurrencyReading,
  type PlainDate,
} from '@myriad/core'
import type { MyriadStore } from './store'
import { PermissionRequired } from '../composables/useVisibleResource'
import { widgetBase, widgetJson } from './widgetRequests'
export const CURRENCY_ORIGINS = [FRANKFURTER_ORIGIN, ER_ORIGIN, CURRENCY_API_ORIGIN]
async function rate(store: MyriadStore, config: CurrencyConfig, date: string, signal: AbortSignal) {
  const base = widgetBase(store, config.route)
  if (base) {
    const url = new URL(`${base}/currency`)
    url.search = new URLSearchParams({ base: config.base, quote: config.quote, date }).toString()
    const data = await widgetJson(store, url, signal)
    if (typeof data.rate !== 'number' || !Number.isFinite(data.rate) || data.rate <= 0)
      throw new Error('invalid-currency')
    return {
      rate: data.rate as number,
      date: data.date as string,
      provider: data.provider as string,
    }
  }
  const sources = [
    {
      provider: 'frankfurter' as const,
      url: `${FRANKFURTER_ORIGIN}/v1/${date}?base=${config.base}&symbols=${config.quote}`,
      name: 'Frankfurter',
    },
    ...(date === 'latest'
      ? [
          {
            provider: 'er' as const,
            url: `${ER_ORIGIN}/v6/latest/${config.base}`,
            name: 'ExchangeRate-API',
          },
        ]
      : []),
    {
      provider: 'currency-api' as const,
      url: `${CURRENCY_API_ORIGIN}/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${config.base.toLowerCase()}.json`,
      name: 'Currency API',
    },
  ]
  for (const source of sources) {
    signal.throwIfAborted()
    try {
      return {
        ...exchangeRate(
          await widgetJson(store, new URL(source.url), signal),
          config.quote,
          source.provider,
        ),
        provider: source.name,
      }
    } catch (e) {
      if (signal.aborted || e instanceof PermissionRequired) throw e
    }
  }
  throw new Error('currency-unavailable')
}
export async function loadCurrency(
  store: MyriadStore,
  config: CurrencyConfig,
  today: PlainDate,
  withHistory: boolean,
  signal: AbortSignal,
): Promise<CurrencyReading> {
  const dates = sampledCurrencyDates(today)
  if (config.base === config.quote)
    return {
      base: config.base,
      quote: config.quote,
      date: ymd(today),
      rate: 1,
      provider: '',
      history: withHistory ? dates.map((date) => ({ date, rate: 1 })) : [],
    }
  const current = await rate(store, config, 'latest', signal)
  let points: CurrencyReading['history'] = []
  if (withHistory) {
    const base = widgetBase(store, config.route)
    const from = ymd(addDays(today, -30)),
      to = ymd(today)
    const url = new URL(
      base ? `${base}/currency/history` : `${FRANKFURTER_ORIGIN}/v1/${from}..${to}`,
    )
    url.search = new URLSearchParams(
      base
        ? { base: config.base, quote: config.quote, from, to }
        : { base: config.base, symbols: config.quote },
    ).toString()
    try {
      const data = await widgetJson(store, url, signal)
      points = base
        ? Array.isArray(data.history)
          ? data.history.filter((p: any) => typeof p.rate === 'number' && p.rate > 0)
          : []
        : currencyHistory(data, config.quote)
    } catch (e) {
      if (signal.aborted || e instanceof PermissionRequired) throw e
    }
    if (!points.length) {
      // 备用源不支持范围接口，取 30 天内的离散样本，单次最多两个请求。
      for (let i = 0; i < dates.length; i += 2) {
        signal.throwIfAborted()
        const values = await Promise.all(
          dates.slice(i, i + 2).map(async (date) => {
            try {
              const data = await rate(store, config, date, signal)
              return { date: data.date || date, rate: data.rate }
            } catch (e) {
              if (signal.aborted || e instanceof PermissionRequired) throw e
              return null
            }
          }),
        )
        points.push(...values.filter((v): v is { date: string; rate: number } => !!v))
      }
    }
  }
  return { base: config.base, quote: config.quote, ...current, history: points }
}
