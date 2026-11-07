/** 中国大陆常用的 IANA 时区 */
const CHINA_ZONES = new Set([
  'Asia/Shanghai',
  'Asia/Chongqing',
  'Asia/Chungking',
  'Asia/Urumqi',
  'Asia/Harbin',
  'PRC',
])

export const FALLBACK_TIME_ZONE = 'Asia/Shanghai'

/** 浏览器时区；取不到时返回 null */
export function browserTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone || null
  } catch {
    return null
  }
}

/** 浏览器时区，取不到时用北京时间 */
export function effectiveTimeZone(configured = ''): string {
  if (configured && isValidTimeZone(configured)) return configured
  return browserTimeZone() ?? FALLBACK_TIME_ZONE
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * 判断是否为中国用户：浏览器时区属于中国大陆，或服务端（Cloudflare）判断国家为 CN。
 * 浏览器语言只作参考，不单独决定。
 */
export function isChinaUser(
  options: { timeZone?: string | null; country?: string | null } = {},
): boolean {
  if (options.country) return options.country.toUpperCase() === 'CN'
  const zone = options.timeZone === undefined ? browserTimeZone() : options.timeZone
  return zone ? CHINA_ZONES.has(zone) : false
}

/** 界面语言：中文（任意 zh-*）显示中文，其余显示英文 */
export function detectLanguage(
  languages: readonly string[] = globalThis.navigator?.languages ?? [],
): 'zh-CN' | 'en' {
  const first = languages[0] ?? globalThis.navigator?.language ?? 'zh-CN'
  return first.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}
