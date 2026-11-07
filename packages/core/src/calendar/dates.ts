/** 某时区下的年月日时分秒 */
export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** 0 = 星期日 */
  weekday: number
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string) {
  let f = partsFormatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    })
    partsFormatters.set(timeZone, f)
  }
  return f
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const out: Record<string, string> = {}
  for (const p of partsFormatter(timeZone).formatToParts(date)) out[p.type] = p.value
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS[out.weekday ?? 'Sun'] ?? 0,
  }
}

/** 纯日历日期（不含时区），月份 1–12 */
export interface PlainDate {
  year: number
  month: number
  day: number
}

export function ymd(d: PlainDate): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

/** 以 UTC 正午表示纯日期，避免夏令时干扰 */
export function plainToUtc(d: PlainDate): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day, 12))
}

export function utcToPlain(date: Date): PlainDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

export function addDays(d: PlainDate, n: number): PlainDate {
  const t = plainToUtc(d)
  t.setUTCDate(t.getUTCDate() + n)
  return utcToPlain(t)
}

export function weekdayOf(d: PlainDate): number {
  return plainToUtc(d).getUTCDay()
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** 今年的第几天（1 起） */
export function dayOfYear(d: PlainDate): number {
  return Math.round((plainToUtc(d).getTime() - Date.UTC(d.year, 0, 1, 12)) / 86400000) + 1
}

/** ISO 8601 周数（周一为一周开始，含当年第一个星期四的周为第 1 周） */
export function isoWeek(d: PlainDate): { year: number; week: number } {
  const t = plainToUtc(d)
  const dow = (t.getUTCDay() + 6) % 7 // 周一 = 0
  t.setUTCDate(t.getUTCDate() - dow + 3) // 本周星期四
  const weekYear = t.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4, 12))
  const firstDow = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDow + 3)
  const week = 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86400000))
  return { year: weekYear, week }
}

/** 某月第 n 个星期几（weekday 0 = 星期日） */
export function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = weekdayOf({ year, month, day: 1 })
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7
}
