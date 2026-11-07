import { describe, expect, it } from 'vitest'
import { dayOfYear, festivalsOn, isoWeek, solarTermDates, toLunar, ymd } from '../src'

describe('农历', () => {
  it('转换普通日期', () => {
    const l = toLunar({ year: 2026, month: 11, day: 6 })!
    expect(l.yearName).toBe('丙午')
    expect(l.zodiac).toBe('马')
    expect(l.monthName).toBe('九月')
    expect(l.dayName).toBe('廿八')
  })
  it('识别闰月', () => {
    const l = toLunar({ year: 2025, month: 8, day: 10 })!
    expect(l.leap).toBe(true)
    expect(l.monthName).toBe('闰六月')
    expect(l.dayName).toBe('十七')
  })
  it('春节与除夕', () => {
    expect(festivalsOn({ year: 2026, month: 2, day: 17 }).map((f) => f.name)).toContain('春节')
    expect(festivalsOn({ year: 2026, month: 2, day: 16 }).map((f) => f.name)).toContain('除夕')
    expect(festivalsOn({ year: 2025, month: 10, day: 6 }).map((f) => f.name)).toContain('中秋节')
  })
})

describe('节气', () => {
  // 参考：中国科学院紫金山天文台发布的节气时刻（北京时间）
  const cases: [number, number, string][] = [
    [2025, 2, '2025-02-03'], // 立春 2025-02-03 22:10
    [2025, 5, '2025-03-20'], // 春分 2025-03-20 17:01
    [2025, 6, '2025-04-04'], // 清明 2025-04-04 15:48
    [2025, 11, '2025-06-21'], // 夏至 2025-06-21 10:42
    [2025, 23, '2025-12-21'], // 冬至 2025-12-21 23:03
    [2026, 2, '2026-02-04'], // 立春 2026-02-04 04:02
    [2026, 6, '2026-04-05'], // 清明 2026-04-05 03:40
    [2026, 23, '2026-12-22'], // 冬至 2026-12-22 04:50
  ]
  for (const [year, i, expected] of cases) {
    it(`${year} 第 ${i} 个节气`, () => {
      expect(ymd(solarTermDates(year)[i]!)).toBe(expected)
    })
  }
})

describe('日期', () => {
  it('第几天与第几周', () => {
    expect(dayOfYear({ year: 2026, month: 11, day: 6 })).toBe(310)
    expect(isoWeek({ year: 2026, month: 11, day: 6 }).week).toBe(45)
    expect(isoWeek({ year: 2027, month: 1, day: 1 })).toEqual({ year: 2026, week: 53 })
  })
  it('浮动节日', () => {
    expect(festivalsOn({ year: 2026, month: 5, day: 10 }).map((f) => f.name)).toContain('母亲节')
  })
})
