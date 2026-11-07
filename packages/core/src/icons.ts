import type { FaviconProvider, IconSettings } from './types'

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** 规范化用户输入的网址：缺少协议时补 https:// */
export function normalizeUrl(input: string): string {
  const s = input.trim()
  if (!s) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s
  return `https://${s.replace(/^\/+/, '')}`
}

/** 网址是否可以安全打开（拒绝 javascript: 等协议） */
export function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return ['http:', 'https:', 'ftp:', 'file:', 'chrome:', 'edge:', 'about:', 'mailto:'].includes(
      u.protocol,
    )
  } catch {
    return false
  }
}

/**
 * favicon 地址。设置了图标代理（自建服务）时优先使用代理。
 * 代理接口约定：`{base}/v1/icon?url=<网址>&size=<px>`。
 */
export function faviconUrl(
  url: string,
  settings: Pick<IconSettings, 'faviconProvider' | 'proxyBase'>,
  size = 128,
): string | null {
  const host = hostnameOf(url)
  if (!host) return null
  if (settings.proxyBase) {
    return `${settings.proxyBase.replace(/\/+$/, '')}/v1/icon?url=${encodeURIComponent(url)}&size=${size}`
  }
  return providerUrl(settings.faviconProvider, url, host, size)
}

export function providerUrl(
  provider: FaviconProvider,
  url: string,
  host: string,
  size: number,
): string {
  switch (provider) {
    case 'duckduckgo':
      return `https://icons.duckduckgo.com/ip3/${host}.ico`
    case 'iconhorse':
      return `https://icon.horse/icon/${host}`
    case 'direct': {
      try {
        return `${new URL(url).origin}/favicon.ico`
      } catch {
        return `https://${host}/favicon.ico`
      }
    }
    default:
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`
  }
}

/** 第三方服务找不到图标时常返回 16px 的占位图，小于该尺寸视为无效 */
export const MIN_FAVICON_SIZE = 24

const SEGMENT_STOP = new Set([
  'www',
  'm',
  'mobile',
  'app',
  'web',
  'open',
  'store',
  'mail',
  'dash',
  'developer',
  'zh',
  'en',
  'cn',
  'chat',
])
const TLD = new Set([
  'com',
  'cn',
  'net',
  'org',
  'io',
  'dev',
  'app',
  'co',
  'tv',
  'me',
  'top',
  'cc',
  'cd',
  'ai',
  'gg',
  'so',
  'xyz',
  'jp',
  'uk',
  'de',
])

/**
 * 由网址推测 simple-icons 的 slug 候选，如 `www.bilibili.com` → ['bilibili']，
 * `music.163.com` → ['163music', 'music163', '163', 'music']。
 */
export function iconSlugCandidates(url: string, title = ''): string[] {
  const host = hostnameOf(url)
  const out: string[] = []
  const push = (s: string) => {
    const slug = s.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (slug && !out.includes(slug)) out.push(slug)
  }
  const parts = host.split('.').filter((p) => p && !TLD.has(p))
  const meaningful = parts.filter((p) => !SEGMENT_STOP.has(p))
  const main = meaningful[meaningful.length - 1]
  if (main) push(main)
  if (meaningful.length >= 2) {
    push(meaningful.slice(-2).reverse().join(''))
    push(meaningful.slice(-2).join(''))
  }
  for (const p of meaningful) push(p)
  if (/^[\x20-\x7e]+$/.test(title)) push(title)
  return out
}

/** 文字图标显示的字符：中文取第一个字，其他取首字母（大写） */
export function textIconLabel(title: string): string {
  const s = title.trim()
  if (!s) return '?'
  const first = Array.from(s)[0]!
  return /[a-z]/i.test(first) ? first.toUpperCase() : first
}

/** 与主题协调的文字图标底色（十六进制，不含 #） */
export const TEXT_ICON_COLORS = [
  '4ea4ef',
  '2d3c81',
  '6a72c9',
  '3279bd',
  '24765c',
  '75c7ac',
  'c94737',
  'a83d33',
  '937562',
  'c7a085',
  '7b595e',
  'bb9beb',
]

export function textIconColor(seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return TEXT_ICON_COLORS[h % TEXT_ICON_COLORS.length]!
}

/** 浅色底配深字，深色底配白字 */
export function readableOn(hex: string): '#ffffff' | '#141521' {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.4 ? '#141521' : '#ffffff'
}
