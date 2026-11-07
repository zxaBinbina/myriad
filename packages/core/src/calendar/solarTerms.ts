import { type PlainDate, plainToUtc, utcToPlain } from './dates'

/** 二十四节气，从小寒开始（对应太阳黄经 285°、300°、…） */
export const SOLAR_TERMS = [
  '小寒',
  '大寒',
  '立春',
  '雨水',
  '惊蛰',
  '春分',
  '清明',
  '谷雨',
  '立夏',
  '小满',
  '芒种',
  '夏至',
  '小暑',
  '大暑',
  '立秋',
  '处暑',
  '白露',
  '秋分',
  '寒露',
  '霜降',
  '立冬',
  '小雪',
  '大雪',
  '冬至',
] as const

export const SOLAR_TERMS_EN = [
  'Minor Cold',
  'Major Cold',
  'Start of Spring',
  'Rain Water',
  'Awakening of Insects',
  'Spring Equinox',
  'Pure Brightness',
  'Grain Rain',
  'Start of Summer',
  'Grain Full',
  'Grain in Ear',
  'Summer Solstice',
  'Minor Heat',
  'Major Heat',
  'Start of Autumn',
  'End of Heat',
  'White Dew',
  'Autumn Equinox',
  'Cold Dew',
  'Frost Descent',
  'Start of Winter',
  'Minor Snow',
  'Major Snow',
  'Winter Solstice',
] as const

const RAD = Math.PI / 180

/** 太阳视黄经（度），Meeus《天文算法》第 25 章低精度公式，误差约 0.01°（约 15 分钟） */
export function solarLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * RAD
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M)
  const omega = (125.04 - 1934.136 * T) * RAD
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega)
  return ((lambda % 360) + 360) % 360
}

const toJd = (ms: number) => ms / 86400000 + 2440587.5
const fromJd = (jd: number) => (jd - 2440587.5) * 86400000
/** ΔT（TT − UT），本世纪约 69–75 秒 */
const DELTA_T_DAYS = 70 / 86400

/** 某年第 index 个节气（0 = 小寒）的时刻（UTC 毫秒） */
export function solarTermTime(year: number, index: number): number {
  const target = (285 + index * 15) % 360
  // 初值：小寒约在 1 月 6 日，之后每个节气约相隔 15.22 天
  let jd = toJd(Date.UTC(year, 0, 6)) + index * 15.218
  for (let i = 0; i < 6; i++) {
    let diff = target - solarLongitude(jd)
    diff = ((diff + 540) % 360) - 180
    jd += diff / (360 / 365.2422)
    if (Math.abs(diff) < 1e-6) break
  }
  return fromJd(jd - DELTA_T_DAYS)
}

const termCache = new Map<number, PlainDate[]>()

/** 某年 24 个节气的北京时间日期 */
export function solarTermDates(year: number): PlainDate[] {
  let dates = termCache.get(year)
  if (!dates) {
    dates = SOLAR_TERMS.map((_, i) => utcToPlain(new Date(solarTermTime(year, i) + 8 * 3600000)))
    termCache.set(year, dates)
  }
  return dates
}

/** 当天是节气时返回节气序号（0 = 小寒），否则 null */
export function solarTermIndexOn(d: PlainDate): number | null {
  const dates = solarTermDates(d.year)
  const t = plainToUtc(d).getTime()
  const i = dates.findIndex((x) => plainToUtc(x).getTime() === t)
  return i >= 0 ? i : null
}
