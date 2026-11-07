/**
 * 中国法定节假日与调休，数据来自 NateScarlet/holiday-cn（按国务院通知整理）。
 * 格式：{ year, days: [{ name, date: 'YYYY-MM-DD', isOffDay }] }
 */

export interface HolidayDay {
  name: string
  /** true：放假（休）；false：调休上班（班） */
  off: boolean
}

export type HolidayMap = Record<string, HolidayDay>

export interface HolidayYear {
  year: number
  days: HolidayMap
  fetchedAt: number
}

export const HOLIDAY_SOURCES = [
  'https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/{year}.json',
  'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/{year}.json',
]

export function parseHolidayCn(body: unknown): HolidayMap {
  const days = (body as { days?: unknown })?.days
  const out: HolidayMap = {}
  if (!Array.isArray(days)) return out
  for (const d of days) {
    if (!d || typeof d !== 'object') continue
    const { name, date, isOffDay } = d as { name?: unknown; date?: unknown; isOffDay?: unknown }
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && typeof name === 'string') {
      out[date] = { name, off: isOffDay === true }
    }
  }
  return out
}

/** 依次尝试数据源，返回某年的节假日；全部失败时抛出最后一个错误 */
export async function fetchHolidayYear(
  year: number,
  fetcher: typeof fetch = fetch,
  sources: string[] = HOLIDAY_SOURCES,
): Promise<HolidayYear> {
  let lastError: unknown = new Error('no holiday source')
  for (const tpl of sources) {
    try {
      const res = await fetcher(tpl.replace('{year}', String(year)), { cache: 'no-cache' })
      if (res.status === 404) return { year, days: {}, fetchedAt: Date.now() }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { year, days: parseHolidayCn(await res.json()), fetchedAt: Date.now() }
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}
