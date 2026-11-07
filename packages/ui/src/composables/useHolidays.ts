import { fetchHolidayYear, type HolidayMap, type HolidayYear } from '@myriad/core'
import { ref, watch, type Ref } from 'vue'
import { createCache } from '../state/cache'
import { useStore } from '../state/store'

const MAX_AGE = 3 * 86400000
const memory = new Map<number, HolidayMap>()
const inflight = new Map<number, Promise<void>>()

/** 中国法定节假日（含调休），按年加载并缓存；years 变化时自动补齐 */
export function useHolidays(years: Ref<number[]>, enabled: Ref<boolean>) {
  const store = useStore()
  const cache = createCache(store.platform.storage)
  const days = ref<HolidayMap>({})

  function rebuild() {
    const merged: HolidayMap = {}
    for (const y of years.value) Object.assign(merged, memory.get(y) ?? {})
    days.value = merged
  }

  async function loadYear(year: number) {
    if (memory.has(year)) return
    let p = inflight.get(year)
    if (!p) {
      p = (async () => {
        const fresh = await cache.get<HolidayYear>(`holidays.${year}`, MAX_AGE)
        if (fresh) {
          memory.set(year, fresh.days)
          return
        }
        try {
          const y = await fetchHolidayYear(year)
          memory.set(year, y.days)
          await cache.set(`holidays.${year}`, y)
        } catch {
          // 离线：退回过期缓存
          const stale = await cache.peek<HolidayYear>(`holidays.${year}`)
          if (stale) memory.set(year, stale.days)
        }
      })().finally(() => inflight.delete(year))
      inflight.set(year, p)
    }
    await p
  }

  watch(
    [years, enabled],
    async () => {
      if (!enabled.value) {
        days.value = {}
        return
      }
      await Promise.all(years.value.map(loadYear))
      rebuild()
    },
    { immediate: true },
  )

  return days
}
