import { describe, expect, it } from 'vitest'
import {
  countdownConfig,
  countdownOccurrence,
  parsePlainDate,
  dateDistance,
  parseQuote,
  parseWeather,
  quoteConfig,
  weatherConfig,
  temperatureIn,
  zonedParts,
} from '../src/index'

describe('倒数日按日历计算', () => {
  it('纪念日当天、下一年与开服天数', () => {
    const cfg = countdownConfig({})
    expect(countdownOccurrence(cfg, { year: 2026, month: 6, day: 20 })).toEqual({
      date: '2026-06-20',
      remaining: 0,
      elapsed: 365,
    })
    expect(countdownOccurrence(cfg, { year: 2026, month: 6, day: 21 })).toEqual({
      date: '2027-06-20',
      remaining: 364,
      elapsed: 366,
    })
    expect(countdownOccurrence(cfg, { year: 2025, month: 6, day: 19 }).remaining).toBe(1)
  })
  it('夏令时切换仍只相差一天', () => {
    const a = zonedParts(new Date('2026-03-08T05:00:00Z'), 'America/New_York')
    const b = zonedParts(new Date('2026-03-09T04:00:00Z'), 'America/New_York')
    expect(dateDistance(a, b)).toBe(1)
  })
  it('闰日按年循环在非闰年使用月末，闰年恢复 29 日', () => {
    const cfg = countdownConfig({ date: '2024-02-29' })
    expect(countdownOccurrence(cfg, { year: 2025, month: 2, day: 28 }).remaining).toBe(0)
    expect(countdownOccurrence(cfg, { year: 2028, month: 1, day: 1 }).date).toBe('2028-02-29')
  })
  it('31 日按月循环不漂移；每周循环跨年；不循环显示负数', () => {
    const cfg = countdownConfig({ date: '2026-01-31', repeat: 'month' })
    expect(countdownOccurrence(cfg, { year: 2026, month: 2, day: 15 }).date).toBe('2026-02-28')
    expect(countdownOccurrence(cfg, { year: 2026, month: 3, day: 1 }).date).toBe('2026-03-31')
    expect(
      countdownOccurrence(countdownConfig({ date: '2025-12-30', repeat: 'week' }), {
        year: 2026,
        month: 1,
        day: 1,
      }).date,
    ).toBe('2026-01-06')
    expect(
      countdownOccurrence(countdownConfig({ date: '2026-01-01', repeat: 'none' }), {
        year: 2026,
        month: 1,
        day: 2,
      }).remaining,
    ).toBe(-1)
  })
  it('拒绝无效的日期而不让 Date 自动滚到下个月', () => {
    expect(parsePlainDate('2025-02-29')).toBeNull()
    expect(parsePlainDate('2026-13-01')).toBeNull()
    expect(parsePlainDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 })
  })
})

describe('组件数据兼容', () => {
  it('忽略损坏的位置、分类、收藏；保留有效配置', () => {
    expect(
      weatherConfig({
        cities: [
          { name: 'zero', latitude: 0, longitude: 0 },
          { name: 'bad', latitude: 91, longitude: 0 },
        ],
      }).cities,
    ).toHaveLength(1)
    const q = quoteConfig({
      categories: ['b', 'a', 'b', 'invalid'],
      favorites: [{}, { id: '1', text: 'hello' }, { id: '1', text: 'hello' }],
    })
    expect(q.categories).toEqual(['a', 'b'])
    expect(q.favorites).toHaveLength(1)
    expect(parseQuote({ id: 12, hitokoto: 'hello', from_who: null, from: 'Book' })).toEqual({
      id: '12',
      text: 'hello',
      author: '',
      source: 'Book',
    })
  })
  it('缺失温度与 AQI 不会变成 0，小时预报从当前小时之后开始', () => {
    const data = parseWeather({
      current: { temperature_2m: 0, time: '2026-11-14T12:15' },
      hourly: { time: ['2026-11-14T12:00', '2026-11-14T13:00'], temperature_2m: [1, null] },
      daily: { time: ['2026-11-14'], temperature_2m_min: [null], temperature_2m_max: [8] },
    })
    expect(data.apparent).toBeNull()
    expect(data.aqi).toBeNull()
    expect(data.hourly).toEqual([{ time: '2026-11-14T13:00', temperature: null, code: null }])
    expect(temperatureIn(data.daily[0]!.low, 'celsius')).toBe('—')
    expect(temperatureIn(0, 'fahrenheit')).toBe('32')
    expect(() => parseWeather({ current: { temperature_2m: null } })).toThrow()
  })
})
