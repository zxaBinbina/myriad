import type { CustomEngine, EngineSetting, SearchSettings } from './types'

export type SuggestFormat = 'opensearch' | 'bilibili'

export interface BuiltinEngine {
  id: string
  name: string
  nameEn?: string
  /** 带 %s 的搜索地址 */
  url: string
  /** 用于取 favicon 的主页地址 */
  home: string
  /** 默认前缀 */
  prefix: string
  /** 默认启用 */
  enabled: boolean
  /** web：通用网页搜索；site：站内搜索；tool：工具 */
  category: 'web' | 'site' | 'tool'
  suggest?: { url: string; format: SuggestFormat }
}

/** 内置搜索引擎。顺序即默认显示顺序。 */
export const BUILTIN_ENGINES: BuiltinEngine[] = [
  {
    id: 'google',
    name: 'Google',
    url: 'https://www.google.com/search?q=%s',
    home: 'https://www.google.com',
    prefix: 'g',
    enabled: true,
    category: 'web',
    suggest: {
      url: 'https://suggestqueries.google.com/complete/search?client=firefox&q=%s',
      format: 'opensearch',
    },
  },
  {
    id: 'bing',
    name: 'Bing',
    nameEn: 'Bing',
    url: 'https://www.bing.com/search?q=%s',
    home: 'https://www.bing.com',
    prefix: 'b',
    enabled: true,
    category: 'web',
    suggest: { url: 'https://api.bing.com/osjson.aspx?query=%s', format: 'opensearch' },
  },
  {
    id: 'baidu',
    name: '百度',
    nameEn: 'Baidu',
    url: 'https://www.baidu.com/s?wd=%s',
    home: 'https://www.baidu.com',
    prefix: 'bd',
    enabled: true,
    category: 'web',
    suggest: {
      url: 'https://suggestion.baidu.com/su?wd=%s&action=opensearch&ie=utf-8',
      format: 'opensearch',
    },
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    url: 'https://duckduckgo.com/?q=%s',
    home: 'https://duckduckgo.com',
    prefix: 'ddg',
    enabled: true,
    category: 'web',
    suggest: { url: 'https://duckduckgo.com/ac/?q=%s&type=list', format: 'opensearch' },
  },
  {
    id: 'github',
    name: 'GitHub',
    url: 'https://github.com/search?q=%s&type=repositories',
    home: 'https://github.com',
    prefix: 'gh',
    enabled: true,
    category: 'site',
  },
  {
    id: 'bilibili',
    name: '哔哩哔哩',
    nameEn: 'Bilibili',
    url: 'https://search.bilibili.com/all?keyword=%s',
    home: 'https://www.bilibili.com',
    prefix: 'bi',
    enabled: true,
    category: 'site',
    suggest: {
      url: 'https://s.search.bilibili.com/main/suggest?term=%s&main_ver=v1',
      format: 'bilibili',
    },
  },
  {
    id: 'zhihu',
    name: '知乎',
    nameEn: 'Zhihu',
    url: 'https://www.zhihu.com/search?type=content&q=%s',
    home: 'https://www.zhihu.com',
    prefix: 'zh',
    enabled: true,
    category: 'site',
  },
  {
    id: 'mdn',
    name: 'MDN',
    url: 'https://developer.mozilla.org/zh-CN/search?q=%s',
    home: 'https://developer.mozilla.org',
    prefix: 'mdn',
    enabled: true,
    category: 'site',
  },
  {
    id: 'npm',
    name: 'npm',
    url: 'https://www.npmjs.com/search?q=%s',
    home: 'https://www.npmjs.com',
    prefix: 'npm',
    enabled: true,
    category: 'site',
  },
  {
    id: 'mcwiki',
    name: 'Minecraft Wiki',
    url: 'https://zh.minecraft.wiki/?search=%s',
    home: 'https://zh.minecraft.wiki',
    prefix: 'mc',
    enabled: true,
    category: 'site',
  },
  {
    id: 'stackoverflow',
    name: 'Stack Overflow',
    url: 'https://stackoverflow.com/search?q=%s',
    home: 'https://stackoverflow.com',
    prefix: 'so',
    enabled: false,
    category: 'site',
  },
  {
    id: 'wikipedia',
    name: '维基百科',
    nameEn: 'Wikipedia',
    url: 'https://zh.wikipedia.org/w/index.php?search=%s',
    home: 'https://zh.wikipedia.org',
    prefix: 'wiki',
    enabled: false,
    category: 'site',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    url: 'https://www.youtube.com/results?search_query=%s',
    home: 'https://www.youtube.com',
    prefix: 'yt',
    enabled: false,
    category: 'site',
  },
  {
    id: 'google-translate',
    name: 'Google 翻译',
    nameEn: 'Google Translate',
    url: 'https://translate.google.com/?sl=auto&tl=zh-CN&text=%s&op=translate',
    home: 'https://translate.google.com',
    prefix: 'tr',
    enabled: false,
    category: 'tool',
  },
]

export interface ResolvedEngine {
  id: string
  name: string
  url: string
  home: string
  prefix: string
  custom: boolean
  suggest?: { url: string; format: SuggestFormat }
}

export function defaultEngineSettings(): EngineSetting[] {
  return BUILTIN_ENGINES.map((e) => ({ id: e.id, enabled: e.enabled, prefix: e.prefix }))
}

function homeOf(url: string): string {
  try {
    const u = new URL(url.replace('%s', 'x'))
    return u.origin
  } catch {
    return url
  }
}

/**
 * 按设置合并内置与自定义引擎，返回全部引擎（含停用）及其当前前缀。
 * 设置里缺少的内置引擎（新版本新增）按默认值补上。
 */
export function resolveEngines(
  settings: SearchSettings,
  language: 'zh-CN' | 'en',
): (ResolvedEngine & { enabled: boolean })[] {
  const byId = new Map(settings.engines.map((e) => [e.id, e]))
  const ordered: (ResolvedEngine & { enabled: boolean })[] = []
  const pushBuiltin = (b: BuiltinEngine, s?: EngineSetting) => {
    ordered.push({
      id: b.id,
      name: language === 'en' && b.nameEn ? b.nameEn : b.name,
      url: b.url,
      home: b.home,
      prefix: s ? s.prefix : b.prefix,
      custom: false,
      suggest: b.suggest,
      enabled: s ? s.enabled : b.enabled,
    })
  }
  const pushCustom = (c: CustomEngine, s?: EngineSetting) => {
    ordered.push({
      id: c.id,
      name: c.name,
      url: c.url,
      home: homeOf(c.url),
      prefix: s?.prefix ?? '',
      custom: true,
      suggest: c.suggestUrl ? { url: c.suggestUrl, format: 'opensearch' } : undefined,
      enabled: s?.enabled ?? true,
    })
  }
  const builtinById = new Map(BUILTIN_ENGINES.map((b) => [b.id, b]))
  const customById = new Map(settings.custom.map((c) => [c.id, c]))
  // 先按设置中的顺序
  for (const s of settings.engines) {
    const b = builtinById.get(s.id)
    if (b) pushBuiltin(b, s)
    else {
      const c = customById.get(s.id)
      if (c) pushCustom(c, s)
    }
  }
  for (const b of BUILTIN_ENGINES) if (!byId.has(b.id)) pushBuiltin(b)
  for (const c of settings.custom) if (!byId.has(c.id)) pushCustom(c)
  return ordered
}

export function buildSearchUrl(engine: { url: string }, query: string): string {
  return engine.url.split('%s').join(encodeURIComponent(query))
}

/**
 * 解析前缀：`gh vue` → { engine: github, query: 'vue' }。
 * 前缀后必须跟空格；只匹配启用的引擎。
 */
export function matchPrefix<T extends { prefix: string; enabled: boolean }>(
  engines: T[],
  input: string,
): { engine: T; query: string } | null {
  const m = /^(\S+)\s(.*)$/s.exec(input)
  if (!m) return null
  const word = m[1]!.toLowerCase()
  const engine = engines.find((e) => e.enabled && e.prefix && e.prefix.toLowerCase() === word)
  return engine ? { engine, query: m[2]! } : null
}

/** 把各种联想接口的返回值统一为字符串数组 */
export function parseSuggestions(format: SuggestFormat, body: unknown): string[] {
  try {
    if (format === 'opensearch') {
      if (Array.isArray(body) && Array.isArray(body[1])) {
        return (body[1] as unknown[]).filter((s): s is string => typeof s === 'string')
      }
      // DuckDuckGo 旧格式：[{ phrase }]
      if (Array.isArray(body)) {
        return body
          .map((x) => (x && typeof x === 'object' ? (x as { phrase?: unknown }).phrase : undefined))
          .filter((s): s is string => typeof s === 'string')
      }
    }
    if (format === 'bilibili') {
      const tags = (body as { result?: { tag?: { value?: unknown }[] } })?.result?.tag
      if (Array.isArray(tags)) {
        return tags.map((t) => t.value).filter((s): s is string => typeof s === 'string')
      }
    }
  } catch {
    /* 解析失败当作没有联想 */
  }
  return []
}
