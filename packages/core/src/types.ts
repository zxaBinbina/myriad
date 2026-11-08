/**
 * 万象的数据模型。
 *
 * 数据分两份保存：
 * - `MyriadData`：分组、快捷方式、文件夹、小组件与 Dock，属于「内容」，将来参与云同步。
 * - `MyriadSettings`：外观、布局、搜索、快捷键等偏好。
 *
 * 所有条目集中存放在 `items` 表中，由容器（分组 / 文件夹 / Dock）按 id 顺序引用。
 * 每个条目只属于一个容器。扁平的 id 表便于以后接入 CRDT（Yjs）同步。
 */

import type { SyncScopes } from './sync/scopes'

export type Id = string

/* ------------------------------------------------------------------ */
/* 图标                                                                */
/* ------------------------------------------------------------------ */

/** 品牌 / 通用图标库中的一枚图标，保存完整的绘制数据，渲染时不需要再加载图标库。 */
export interface LibraryIcon {
  set: 'simple-icons' | 'lucide'
  /** simple-icons 的 slug 或 lucide 的图标名 */
  name: string
  /** simple-icons：单一 path 的 d 属性 */
  path?: string
  /** lucide：图标节点 [标签, 属性][] */
  nodes?: [string, Record<string, string | number>][]
  /** 图标颜色（十六进制，不含 #）；空值表示用品牌色或当前强调色 */
  color?: string
  /** 图标底色（十六进制，不含 #）；空值表示用面板色 */
  background?: string
}

export interface TextIcon {
  /** 显示的文字，通常是 1–2 个字符 */
  label: string
  /** 底色（十六进制，不含 #）；空值表示按标题自动取色 */
  background?: string
}

export type IconSource = 'auto' | 'favicon' | 'library' | 'image' | 'text'

export interface IconSpec {
  /**
   * `auto` 按优先级回退：图标代理 / 第三方 favicon → 图标库自动匹配 → 文字图标。
   * 其余取值表示用户手动指定的来源，失败时回退到文字图标。
   */
  source: IconSource
  library?: LibraryIcon
  /** 上传后压缩的 data URL，或用户填写的图片链接 */
  image?: string
  text?: TextIcon
}

/* ------------------------------------------------------------------ */
/* 条目                                                                */
/* ------------------------------------------------------------------ */

export interface ShortcutItem {
  id: Id
  type: 'shortcut'
  title: string
  url: string
  icon: IconSpec
}

export interface FolderItem {
  id: Id
  type: 'folder'
  title: string
  /** 只能包含快捷方式 */
  children: Id[]
}

export type WidgetKind = 'calendar' | 'analogClock'

/** 以网格单元为单位的尺寸：`列x行` */
export type WidgetSize = '1x2' | '2x1' | '2x2' | '2x4' | '4x2' | '4x4'

export interface WidgetItem {
  id: Id
  type: 'widget'
  kind: WidgetKind
  size: WidgetSize
  config: Record<string, unknown>
}

export type Item = ShortcutItem | FolderItem | WidgetItem

export interface Group {
  id: Id
  name: string
  /** lucide 图标名，侧栏模式下显示 */
  icon?: string
  items: Id[]
}

export interface MyriadData {
  schema: 1
  groups: Group[]
  items: Record<Id, Item>
  /** Dock：快捷方式与文件夹，所有分组共用 */
  dock: Id[]
  /** 最后修改时间（毫秒） */
  updatedAt: number
}

/** 条目所在的容器 */
export type ContainerRef = { kind: 'group'; id: Id } | { kind: 'folder'; id: Id } | { kind: 'dock' }

/* ------------------------------------------------------------------ */
/* 设置                                                                */
/* ------------------------------------------------------------------ */

export type Palette = 'fufu-blue' | 'hutao-red'
export type ThemeMode = 'dark' | 'light' | 'auto'
export type ResolvedTheme = 'dark' | 'light'
export type Language = 'auto' | 'zh-CN' | 'en'
/** 三态开关：auto 表示按判断条件决定（如「确定是中国用户时显示」） */
export type TriState = 'auto' | 'on' | 'off'

export type ComboKey = `${Palette}:${ResolvedTheme}`

export type WallpaperSpec =
  | { source: 'upload'; blobKey: string; name?: string }
  | { source: 'url'; url: string }
  | { source: 'bing' }
  | { source: 'picsum' }
  /** Unsplash 每日一图，需要同步服务（Key 放在 Worker） */
  | { source: 'unsplash'; query?: string }

export interface BackgroundSettings {
  mode: 'solid' | 'wallpaper'
  /** 按 配色 × 明暗 分别设置；缺失的组合回退到纯色 */
  wallpapers: Partial<Record<ComboKey, WallpaperSpec>>
  /** 模糊半径 px */
  blur: number
  /** 遮罩不透明度 0–0.8 */
  dim: number
  /** 亮度 0.4–1.2 */
  brightness: number
  /** 深色模式自动额外加暗 */
  darkAutoDim: boolean
}

export type FaviconProvider = 'google' | 'duckduckgo' | 'iconhorse' | 'direct'

export interface IconSettings {
  size: 48 | 56 | 64 | 72 | 88
  radius: 'default' | 'large' | 'round'
  showLabels: boolean
  /** 没有可用的图标代理（同步服务）时使用的第三方 favicon 服务 */
  faviconProvider: FaviconProvider
}

export interface LayoutSettings {
  /** grid：小组件与快捷方式混排；minimal：小组件收进仪表盘抽屉 */
  mode: 'grid' | 'minimal'
  groupPosition: 'top' | 'side'
  sidebarCollapsed: boolean
  transition: 'slide' | 'fade'
  /** 滚轮 / 触控板切换分组 */
  wheelSwitch: boolean
  density: 'comfortable' | 'compact'
}

export interface DockSettings {
  visibility: 'always' | 'auto-hide' | 'hidden'
  hover: 'magnify' | 'lift'
}

export type OpenTarget = 'current' | 'new'

export interface EngineSetting {
  id: string
  enabled: boolean
  /** 前缀，如 `gh`；空字符串表示不使用前缀 */
  prefix: string
}

export interface CustomEngine {
  id: string
  name: string
  /** 带 %s 的搜索地址 */
  url: string
  /** 可选：返回 OpenSearch 格式 `[q, [s1, s2]]` 的联想接口，带 %s */
  suggestUrl?: string
}

export interface SearchSettings {
  defaultEngine: string
  engines: EngineSetting[]
  custom: CustomEngine[]
  /** 切换方式：点图标 / 前缀 / Tab 循环 */
  switchByClick: boolean
  switchByPrefix: boolean
  switchByTab: boolean
  suggestions: {
    enabled: boolean
    engine: boolean
    history: boolean
    shortcuts: boolean
  }
  /** 保存搜索历史 */
  keepHistory: boolean
  openIn: OpenTarget
  /** 扩展：打开新标签页时把焦点从地址栏抢到页面（地址栏会显示扩展地址） */
  grabFocus: boolean
}

export type ShortcutAction =
  'focusSearch' | 'cycleEngine' | 'clearSearch' | 'nextGroup' | 'prevGroup' | 'openSettings'

export interface ShortcutSettings {
  /** 每个动作可绑定多个按键组合，如 `\\`、`/`、`Alt+ArrowRight` */
  bindings: Record<ShortcutAction, string[]>
  /** 页面上直接打字时进入搜索框 */
  typeToSearch: boolean
  /** 按 Alt+1…9 切换到对应分组 */
  digitGroups: boolean
  /** 在对应位置显示快捷键提示 */
  showHints: boolean
}

export interface ClockSettings {
  /** 在搜索框上方显示数字时钟（指针时钟作为小组件提供） */
  showTime: boolean
  showSeconds: boolean
  hour12: boolean
  /** 主时区；空字符串表示使用浏览器时区（取不到时用 Asia/Shanghai） */
  timeZone: string
  /** 附加时区（IANA 名称） */
  extraZones: { zone: string; label: string }[]
  showDate: boolean
  showWeekday: boolean
  lunar: TriState
  /** 干支纪年与生肖 */
  ganzhi: boolean
  solarTerms: boolean
  festivals: boolean
  /** 法定节假日与调休 */
  holidays: TriState
  dayOfYear: boolean
  weekNumber: boolean
  weekStart: 0 | 1
}

export interface MyriadSettings {
  schema: 1
  language: Language
  palette: Palette
  theme: ThemeMode
  background: BackgroundSettings
  icons: IconSettings
  layout: LayoutSettings
  dock: DockSettings
  /** 快捷方式的打开方式 */
  openIn: OpenTarget
  search: SearchSettings
  shortcuts: ShortcutSettings
  clock: ClockSettings
  /** 减少动态效果：auto 跟随系统 */
  reducedMotion: TriState
  updatedAt: number
}

/** 同步服务的连接配置（只保存在本机，不导出、不同步） */
export interface SyncConfig {
  enabled: boolean
  /** myriad_api 地址 */
  apiBase: string
  /** Cloudflare Access Service Token（扩展使用） */
  clientId: string
  clientSecret: string
  /** 各范围是否同步；关闭的范围只在本机生效 */
  scopes: SyncScopes
  /**
   * 单独设为「仅本机」的设置项路径（相对 MyriadSettings，`/` 分隔，数组元素用 `#id`），
   * 如 `theme`、`clock/hour12`。这些项不上传，也不接收其他设备的修改。
   */
  localOnly: string[]
  /** 已连接时用同步服务的图标代理抓取高清图标 */
  iconProxy: boolean
  /** 上次成功同步的时间 */
  lastSync: number
}

/** 只保存在本机、不参与同步的状态 */
export interface LocalState {
  schema: 1
  /** 当前分组 */
  activeGroup: Id | null
  searchHistory: { q: string; engine: string; at: number }[]
  /** 首次运行引导是否完成 */
  onboarded: boolean
  /** 按主机名缓存的图标解析结果 */
  iconCache: Record<string, ResolvedIconCache>
  sync: SyncConfig
  /** 同步服务按 IP 判断的国家（用于判断是否为中国用户），每天刷新 */
  geo: { country: string | null; at: number } | null
}

export type ResolvedIconCache =
  | { kind: 'favicon'; at: number; lowRes?: boolean }
  | { kind: 'library'; icon: LibraryIcon; at: number }
  | { kind: 'text'; at: number }
