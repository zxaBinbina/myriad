import { HOLIDAY_SOURCES, parseHolidayCn, type HolidayMap } from '@myriad/core'
import type { MyriadStore } from './store'
import { widgetBase, widgetJson } from './widgetRequests'
export async function loadCountdownHolidays(
  store: MyriadStore,
  years: number[],
  signal: AbortSignal,
): Promise<HolidayMap> {
  const base = widgetBase(store, 'auto'),
    result: HolidayMap = {}
  for (const year of years) {
    const sources = base ? [`${base}/holidays/{year}`] : HOLIDAY_SOURCES
    let loaded = false
    for (const source of sources) {
      signal.throwIfAborted()
      try {
        Object.assign(
          result,
          parseHolidayCn(
            await widgetJson(store, new URL(source.replace('{year}', String(year))), signal),
          ),
        )
        loaded = true
        break
      } catch (e) {
        signal.throwIfAborted()
        if (base) throw e
      }
    }
    if (!loaded) throw new Error('holidays-unavailable')
  }
  return result
}
