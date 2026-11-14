import { defaultEngineSettings } from './engines'
import { createId } from './id'
import { defaultSyncScopes } from './sync/scopes'
import type {
  Group,
  Id,
  Item,
  LocalState,
  MyriadData,
  MyriadSettings,
  ShortcutItem,
  SyncConfig,
  WidgetItem,
} from './types'

export function defaultSettings(): MyriadSettings {
  return {
    schema: 1,
    language: 'auto',
    palette: 'fufu-blue',
    theme: 'auto',
    background: {
      mode: 'solid',
      wallpapers: {},
      blur: 0,
      dim: 0.25,
      brightness: 1,
      darkAutoDim: true,
    },
    icons: {
      size: 64,
      radius: 'default',
      showLabels: true,
      faviconProvider: 'google',
    },
    layout: {
      mode: 'grid',
      groupPosition: 'top',
      sidebarCollapsed: false,
      transition: 'slide',
      wheelSwitch: true,
      density: 'comfortable',
    },
    dock: { visibility: 'always', hover: 'magnify' },
    openIn: 'current',
    search: {
      defaultEngine: 'google',
      engines: defaultEngineSettings(),
      custom: [],
      switchByClick: true,
      switchByPrefix: true,
      switchByTab: true,
      suggestions: { enabled: true, engine: true, history: true, shortcuts: true },
      keepHistory: true,
      openIn: 'current',
      grabFocus: false,
    },
    shortcuts: {
      bindings: {
        focusSearch: ['\\', '/'],
        cycleEngine: ['Tab'],
        clearSearch: ['Escape'],
        // 不使用 Alt+←/→：在 Windows / Linux 上是浏览器的前进后退
        nextGroup: ['Alt+ArrowDown'],
        prevGroup: ['Alt+ArrowUp'],
        openSettings: ['Alt+,'],
      },
      typeToSearch: true,
      digitGroups: true,
      showHints: true,
    },
    clock: {
      showTime: true,
      showSeconds: true,
      hour12: true,
      timeZone: '',
      extraZones: [],
      showDate: true,
      showWeekday: true,
      lunar: 'auto',
      ganzhi: false,
      solarTerms: true,
      festivals: true,
      holidays: 'auto',
      dayOfYear: true,
      weekNumber: true,
      weekStart: 1,
    },
    reducedMotion: 'auto',
    updatedAt: 0,
  }
}

export function defaultLocalState(): LocalState {
  return {
    schema: 2,
    activeGroup: null,
    searchHistory: [],
    onboarded: false,
    iconCache: {},
    sync: defaultSyncConfig(),
    geo: null,
  }
}

/** 默认的同步服务地址；自部署时在设置里改成自己的地址 */
export const DEFAULT_API_BASE = 'https://myriad.zxabinbina.cc.cd'

export function defaultSyncConfig(): SyncConfig {
  return {
    enabled: false,
    apiBase: DEFAULT_API_BASE,
    authMode: 'token',
    token: '',
    clientId: '',
    clientSecret: '',
    scopes: defaultSyncScopes(),
    localOnly: [],
    iconProxy: true,
    lastSync: 0,
  }
}

export function emptyData(): MyriadData {
  const group: Group = { id: createId('g'), name: '常用', icon: 'star', items: [] }
  return { schema: 2, groups: [group], items: {}, dock: [], lists: {}, updatedAt: Date.now() }
}

type PresetEntry = [title: string, url: string]

interface PresetGroup {
  name: string
  nameEn: string
  icon: string
  widgets?: Omit<WidgetItem, 'id'>[]
  sites: (PresetEntry | { folder: string; folderEn: string; sites: PresetEntry[] })[]
}

/** 默认预设：国内外兼顾，供其他开发者和网站访客使用 */
const PRESET: PresetGroup[] = [
  {
    name: '常用',
    nameEn: 'Home',
    icon: 'star',
    widgets: [{ type: 'widget', kind: 'calendar', size: '2x2', config: {} }],
    sites: [
      ['Google', 'https://www.google.com'],
      ['百度', 'https://www.baidu.com'],
      ['Gmail', 'https://mail.google.com'],
      ['QQ 邮箱', 'https://mail.qq.com'],
      ['知乎', 'https://www.zhihu.com'],
      ['微博', 'https://weibo.com'],
      ['维基百科', 'https://zh.wikipedia.org'],
      ['淘宝', 'https://www.taobao.com'],
      ['京东', 'https://www.jd.com'],
      ['Amazon', 'https://www.amazon.com'],
    ],
  },
  {
    name: '开发',
    nameEn: 'Dev',
    icon: 'code-xml',
    sites: [
      ['GitHub', 'https://github.com'],
      ['Stack Overflow', 'https://stackoverflow.com'],
      ['MDN', 'https://developer.mozilla.org'],
      ['npm', 'https://www.npmjs.com'],
      ['Cloudflare', 'https://dash.cloudflare.com'],
      ['V2EX', 'https://www.v2ex.com'],
      ['掘金', 'https://juejin.cn'],
      ['Hacker News', 'https://news.ycombinator.com'],
      {
        folder: '前端',
        folderEn: 'Frontend',
        sites: [
          ['Vue', 'https://vuejs.org'],
          ['Vite', 'https://vite.dev'],
          ['TypeScript', 'https://www.typescriptlang.org'],
          ['Can I use', 'https://caniuse.com'],
        ],
      },
    ],
  },
  {
    name: '工具',
    nameEn: 'Tools',
    icon: 'wrench',
    sites: [
      ['ChatGPT', 'https://chatgpt.com'],
      ['Claude', 'https://claude.ai'],
      ['DeepSeek', 'https://chat.deepseek.com'],
      ['Google 翻译', 'https://translate.google.com'],
      ['DeepL', 'https://www.deepl.com/translator'],
      ['Excalidraw', 'https://excalidraw.com'],
      ['Squoosh', 'https://squoosh.app'],
      ['Regex101', 'https://regex101.com'],
    ],
  },
  {
    name: '娱乐',
    nameEn: 'Fun',
    icon: 'gamepad-2',
    sites: [
      ['哔哩哔哩', 'https://www.bilibili.com'],
      ['YouTube', 'https://www.youtube.com'],
      ['网易云音乐', 'https://music.163.com'],
      ['Spotify', 'https://open.spotify.com'],
      ['Steam', 'https://store.steampowered.com'],
      ['Twitch', 'https://www.twitch.tv'],
      ['Minecraft Wiki', 'https://zh.minecraft.wiki'],
      ['Netflix', 'https://www.netflix.com'],
    ],
  },
]

const PRESET_DOCK: PresetEntry[] = [
  ['GitHub', 'https://github.com'],
  ['哔哩哔哩', 'https://www.bilibili.com'],
  ['YouTube', 'https://www.youtube.com'],
  ['ChatGPT', 'https://chatgpt.com'],
  ['Gmail', 'https://mail.google.com'],
]

export function createShortcut(title: string, url: string): ShortcutItem {
  return { id: createId('s'), type: 'shortcut', title, url, icon: { source: 'auto' } }
}

/** 生成一份新的默认预设（每次调用都使用新的 id） */
export function presetData(language: 'zh-CN' | 'en' = 'zh-CN'): MyriadData {
  const items: Record<Id, Item> = {}
  const add = <T extends Item>(item: T): Id => {
    items[item.id] = item
    return item.id
  }
  const groups: Group[] = PRESET.map((g) => {
    const ids: Id[] = []
    for (const w of g.widgets ?? [])
      ids.push(add({ ...w, id: createId('w'), config: { ...w.config } }))
    for (const s of g.sites) {
      if (Array.isArray(s)) ids.push(add(createShortcut(s[0], s[1])))
      else {
        const children = s.sites.map((c) => add(createShortcut(c[0], c[1])))
        ids.push(
          add({
            id: createId('f'),
            type: 'folder',
            title: language === 'en' ? s.folderEn : s.folder,
            children,
          }),
        )
      }
    }
    return {
      id: createId('g'),
      name: language === 'en' ? g.nameEn : g.name,
      icon: g.icon,
      items: ids,
    }
  })
  const dock = PRESET_DOCK.map((s) => add(createShortcut(s[0], s[1])))
  return { schema: 2, groups, items, dock, lists: {}, updatedAt: Date.now() }
}
