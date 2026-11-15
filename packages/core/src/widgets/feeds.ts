import { canonicalUrl, httpUrl, type FeedEntry } from '../content'

export const HOT_SOURCES = [
  { id: 'zhihu', name: '知乎', nameEn: 'Zhihu', home: 'https://www.zhihu.com' },
  { id: 'weibo', name: '微博', nameEn: 'Weibo', home: 'https://weibo.com' },
  { id: 'bilibili', name: 'B 站热门', nameEn: 'Bilibili', home: 'https://www.bilibili.com' },
  { id: 'v2ex', name: 'V2EX', nameEn: 'V2EX', home: 'https://www.v2ex.com' },
  {
    id: 'hackernews',
    name: 'Hacker News',
    nameEn: 'Hacker News',
    home: 'https://news.ycombinator.com',
  },
  { id: 'github', name: 'GitHub Trending', nameEn: 'GitHub Trending', home: 'https://github.com' },
  { id: 'sspai', name: '少数派', nameEn: 'SSPAI', home: 'https://sspai.com' },
  { id: 'ithome', name: 'IT 之家', nameEn: 'IT Home', home: 'https://www.ithome.com' },
  { id: 'juejin', name: '掘金', nameEn: 'Juejin', home: 'https://juejin.cn' },
  { id: '36kr', name: '36 氪', nameEn: '36Kr', home: 'https://36kr.com' },
  { id: 'baidu', name: '百度热搜', nameEn: 'Baidu', home: 'https://www.baidu.com' },
  { id: 'douyin', name: '抖音', nameEn: 'Douyin', home: 'https://www.douyin.com' },
] as const
export type HotSource = (typeof HOT_SOURCES)[number]['id']
export interface RssSubscription {
  id: string
  title: string
  url: string
  rsshub: boolean
}
export interface FeedConfig {
  mode: 'hot' | 'rss' | 'favorites'
  route: 'auto' | 'direct' | 'worker'
  sources: HotSource[]
  subscriptions: RssSubscription[]
  selectedSource: string
  selectedSubscription: string
  rsshubBase: string
  refreshTime: string
  preview: boolean
  hoverPreview: boolean
  readMarks: boolean
  favoritesEnabled: boolean
  aiSummary: boolean
  autoScroll: boolean
  favorites: FeedEntry[]
  read: string[]
}
export function feedConfig(raw: Record<string, unknown> = {}): FeedConfig {
  const subscriptions = (Array.isArray(raw.subscriptions) ? raw.subscriptions : [])
    .slice(0, 30)
    .flatMap((s): RssSubscription[] => {
      if (!s || typeof s !== 'object' || typeof s.url !== 'string') return []
      const rsshub = s.rsshub === true
      if (!(rsshub ? /^\/(?!\/)[^\s]+$/.test(s.url) : httpUrl(s.url))) return []
      return [
        {
          id: String(s.id || s.url).slice(0, 200),
          title: String(s.title || s.url).slice(0, 120),
          url: s.url.slice(0, 2000),
          rsshub,
        },
      ]
    })
  const sources = Array.isArray(raw.sources)
    ? HOT_SOURCES.filter((s) => (raw.sources as unknown[]).includes(s.id)).map((s) => s.id)
    : HOT_SOURCES.map((s) => s.id)
  return {
    mode: raw.mode === 'rss' || raw.mode === 'favorites' ? raw.mode : 'hot',
    route: raw.route === 'direct' || raw.route === 'worker' ? raw.route : 'auto',
    sources,
    subscriptions,
    selectedSource: sources.find((s) => s === raw.selectedSource) || sources[0] || '',
    selectedSubscription:
      subscriptions.find((s) => s.id === raw.selectedSubscription)?.id ||
      subscriptions[0]?.id ||
      '',
    rsshubBase: httpUrl(raw.rsshubBase) || 'https://rsshub.app',
    refreshTime:
      typeof raw.refreshTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.refreshTime)
        ? raw.refreshTime
        : '08:00',
    preview: raw.preview !== false,
    hoverPreview: raw.hoverPreview !== false,
    readMarks: raw.readMarks === true,
    favoritesEnabled: raw.favoritesEnabled !== false,
    aiSummary: raw.aiSummary !== false,
    autoScroll: raw.autoScroll !== false,
    favorites: (Array.isArray(raw.favorites) ? raw.favorites : [])
      .filter((e): e is FeedEntry => !!e && typeof e.title === 'string' && !!httpUrl(e.url))
      .slice(0, 300),
    read: (Array.isArray(raw.read) ? raw.read : [])
      .filter((s): s is string => typeof s === 'string')
      .slice(-1000),
  }
}
/** Hover reading is only useful for article pages, including articles linked by RSS/HN. */
export function canHoverRead(entry: Pick<FeedEntry, 'url'>) {
  const safe = httpUrl(entry.url)
  if (!safe) return false
  const u = new URL(safe),
    host = u.hostname.toLowerCase()
  if (
    [
      'bilibili.com',
      'b23.tv',
      'douyin.com',
      'iesdouyin.com',
      'youtube.com',
      'youtu.be',
      'tiktok.com',
      'vimeo.com',
      'twitch.tv',
      'kuaishou.com',
      'youku.com',
      'iqiyi.com',
      'qq.com',
    ].some((d) => host === d || host.endsWith('.' + d))
  ) {
    // qq.com also hosts regular news articles.
    if (!(host.endsWith('qq.com') && host !== 'v.qq.com')) return false
  }
  if (host === 'github.com' || /(^|\.)(baidu|weibo)\.com$/.test(host)) return false
  if (/\.(mp4|webm|mov|m3u8|mp3|ogg)(?:$)/i.test(u.pathname)) return false
  return !/^\/(search|results)(\/|$)/.test(u.pathname)
}
/** Local time determines the daily bucket; changing the schedule never fetches eagerly. */
export function feedPeriod(now: Date, time: string) {
  const [h, m] = time.split(':').map(Number)
  const boundary = new Date(now)
  boundary.setHours(h!, m!, 0, 0)
  if (now < boundary) boundary.setDate(boundary.getDate() - 1)
  return boundary.getTime()
}
export function subscriptionUrl(s: RssSubscription, base: string): string {
  if (!s.rsshub) return httpUrl(s.url)
  if (!/^\/(?!\/)[^\s]+$/.test(s.url)) return ''
  const url = httpUrl(s.url, base.replace(/\/$/, '') + '/')
  return url && httpUrl(base) && new URL(url).origin === new URL(base).origin ? url : ''
}
export function mergeFeedEntries(entries: FeedEntry[]) {
  const seen = new Set<string>()
  return entries.filter((e) => {
    const key = canonicalUrl(e.url)
    return key && !seen.has(key) && !!seen.add(key)
  })
}
