import { addDays, nthWeekday, type PlainDate } from './dates'
import { Solar, Lunar } from 'lunar-typescript'
import { solarTermIndexOn, SOLAR_TERMS, SOLAR_TERMS_EN } from './solarTerms'

export interface LunarDate {
  /** 农历年对应的公历年（春节所在年） */
  year: number
  /** 干支纪年，如「丙午」 */
  yearName: string
  /** 生肖，如「马」 */
  zodiac: string
  month: number
  leap: boolean
  day: number
  /** 如「九月」「闰六月」「腊月」 */
  monthName: string
  /** 如「初一」「廿八」 */
  dayName: string
}

const MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊']
const DAY_TENS = ['初', '十', '廿', '三']
const DIGITS = ['十', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥'
const ZODIAC = '鼠牛虎兔龙蛇马羊猴鸡狗猪'
const STEMS = '甲乙丙丁戊己庚辛壬癸'

export const ZODIAC_EN = [
  'Rat',
  'Ox',
  'Tiger',
  'Rabbit',
  'Dragon',
  'Snake',
  'Horse',
  'Goat',
  'Monkey',
  'Rooster',
  'Dog',
  'Pig',
]

export function lunarDayName(day: number): string {
  if (day === 10) return '初十'
  if (day === 20) return '二十'
  if (day === 30) return '三十'
  return DAY_TENS[Math.floor(day / 10)]! + DIGITS[day % 10]!
}

export function lunarMonthName(month: number, leap: boolean): string {
  return `${leap ? '闰' : ''}${MONTH_NAMES[month - 1]}月`
}

/** 由公历年推算干支（以春节为界由调用方保证） */
export function ganzhiOfYear(year: number): string {
  const i = (((year - 4) % 60) + 60) % 60
  return STEMS[i % 10]! + BRANCHES[i % 12]!
}

/** Bundled calendar also works in browsers without Intl Chinese support. */
export function lunarSupported(): boolean {
  return true
}

const cache = new Map<string, LunarDate>()

/** Date-only conversion. Intl/ICU reports 2027 new year a day late. */
export function toLunar(d: PlainDate): LunarDate | null {
  const key = `${d.year}-${d.month}-${d.day}`
  const hit = cache.get(key)
  if (hit) return hit
  let result: Lunar
  try {
    result = Solar.fromYmd(d.year, d.month, d.day).getLunar()
  } catch {
    return null
  }
  const month = Math.abs(result.getMonth()),
    leap = result.getMonth() < 0,
    day = result.getDay(),
    year = result.getYear()
  const yearName = ganzhiOfYear(year)
  const lunar: LunarDate = {
    year,
    yearName,
    zodiac: ZODIAC[BRANCHES.indexOf(yearName[1]!)]!,
    month,
    leap,
    day,
    monthName: lunarMonthName(month, leap),
    dayName: lunarDayName(day),
  }
  if (cache.size > 2000) cache.clear()
  cache.set(key, lunar)
  return lunar
}

export interface DayFestival {
  name: string
  nameEn?: string
  kind: 'lunar' | 'solar' | 'term'
  /** 主要节日（春节、国庆等），日历中高亮 */
  major?: boolean
}

const LUNAR_FESTIVALS: Record<string, [string, string, boolean?]> = {
  '1-1': ['春节', 'Spring Festival', true],
  '1-15': ['元宵节', 'Lantern Festival', true],
  '2-2': ['龙抬头', 'Dragon Raising Head'],
  '5-5': ['端午节', 'Dragon Boat Festival', true],
  '7-7': ['七夕', 'Qixi Festival'],
  '7-15': ['中元节', 'Ghost Festival'],
  '8-15': ['中秋节', 'Mid-Autumn Festival', true],
  '9-9': ['重阳节', 'Double Ninth Festival'],
  '12-8': ['腊八节', 'Laba Festival'],
  '12-23': ['小年', 'Little New Year'],
}

const SOLAR_FESTIVALS: Record<string, [string, string, boolean?]> = {
  '1-1': ['元旦', "New Year's Day", true],
  '2-14': ['情人节', "Valentine's Day"],
  '3-8': ['妇女节', "Women's Day"],
  '3-12': ['植树节', 'Arbor Day'],
  '4-1': ['愚人节', "April Fools' Day"],
  '5-1': ['劳动节', 'Labour Day', true],
  '5-4': ['青年节', 'Youth Day'],
  '6-1': ['儿童节', "Children's Day"],
  '7-1': ['建党节', 'CPC Founding Day'],
  '8-1': ['建军节', 'Army Day'],
  '9-10': ['教师节', "Teachers' Day"],
  '10-1': ['国庆节', 'National Day', true],
  '12-24': ['平安夜', 'Christmas Eve'],
  '12-25': ['圣诞节', 'Christmas'],
}

/** 当天的节日与节气（顺序：农历节日、公历节日、节气） */
export function festivalsOn(
  d: PlainDate,
  options: { lunar?: boolean; solar?: boolean; terms?: boolean } = {},
): DayFestival[] {
  const { lunar = true, solar = true, terms = true } = options
  const out: DayFestival[] = []
  if (lunar) {
    const l = toLunar(d)
    if (l && !l.leap) {
      const f = LUNAR_FESTIVALS[`${l.month}-${l.day}`]
      if (f) out.push({ name: f[0], nameEn: f[1], kind: 'lunar', major: f[2] })
      if (l.month === 12) {
        const next = toLunar(addDays(d, 1))
        if (next && next.month === 1 && next.day === 1 && !next.leap) {
          out.push({ name: '除夕', nameEn: "Chinese New Year's Eve", kind: 'lunar', major: true })
        }
      }
    }
  }
  if (solar) {
    const f = SOLAR_FESTIVALS[`${d.month}-${d.day}`]
    if (f) out.push({ name: f[0], nameEn: f[1], kind: 'solar', major: f[2] })
    if (d.month === 5 && d.day === nthWeekday(d.year, 5, 0, 2))
      out.push({ name: '母亲节', nameEn: "Mother's Day", kind: 'solar' })
    if (d.month === 6 && d.day === nthWeekday(d.year, 6, 0, 3))
      out.push({ name: '父亲节', nameEn: "Father's Day", kind: 'solar' })
    if (d.month === 11 && d.day === nthWeekday(d.year, 11, 4, 4))
      out.push({ name: '感恩节', nameEn: 'Thanksgiving', kind: 'solar' })
  }
  if (terms) {
    const t = solarTermIndexOn(d)
    if (t !== null)
      out.push({ name: SOLAR_TERMS[t]!, nameEn: SOLAR_TERMS_EN[t], kind: 'term', major: t === 6 })
  }
  return out
}
