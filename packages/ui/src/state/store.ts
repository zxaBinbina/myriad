import {
  type ContainerRef,
  defaultLocalState,
  defaultSettings,
  detectLanguage,
  effectiveTimeZone,
  type Id,
  isChinaUser,
  isSafeUrl,
  loadData,
  loadLocalState,
  loadSettings,
  type LocalState,
  type MyriadData,
  type MyriadSettings,
  presetData,
  type ResolvedTheme,
  STORAGE_KEYS,
  type TriState,
} from '@myriad/core'
import { computed, inject, type InjectionKey, reactive, ref, toRaw, watch } from 'vue'
import type { Lang } from '../i18n'
import type { MyriadPlatform } from '../platform'

/** 写入 localStorage 的首帧主题信息，供 theme-init 脚本在样式加载前读取 */
export const BOOT_KEY = 'myriad-boot'

export interface ContextMenuItem {
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  checked?: boolean
  action?: () => void
  children?: ContextMenuItem[]
}

export interface ToastMessage {
  id: number
  text: string
  tone: 'info' | 'success' | 'error'
}

export interface EditorState {
  /** 编辑已有快捷方式时为其 id */
  itemId: Id | null
  /** 新建时的目标容器 */
  target: ContainerRef | null
}

export type MyriadStore = ReturnType<typeof createStore>

export const STORE_KEY: InjectionKey<MyriadStore> = Symbol('myriad-store')

export function useStore(): MyriadStore {
  const store = inject(STORE_KEY)
  if (!store) throw new Error('Myriad store is not provided')
  return store
}

function triOn(value: TriState, auto: boolean) {
  return value === 'on' || (value === 'auto' && auto)
}

/** 去掉 updatedAt 后的序列化结果，用于判断内容是否真的变化 */
function bodyOf(value: { updatedAt: number }) {
  return JSON.stringify({ ...value, updatedAt: 0 })
}

export function createStore(platform: MyriadPlatform) {
  const data = reactive<MyriadData>(presetData(detectLanguage()))
  const settings = reactive<MyriadSettings>(defaultSettings())
  const local = reactive<LocalState>(defaultLocalState())
  const loaded = ref(false)
  /** 是否首次使用（存储里没有任何数据） */
  const firstRun = ref(false)

  /* ---------------- 界面状态（不保存） ---------------- */
  const ui = reactive({
    settingsOpen: false,
    settingsSection: '' as string,
    dashboardOpen: false,
    openFolder: null as Id | null,
    editor: null as EditorState | null,
    widgetEditor: null as Id | null,
    bookmarkImportOpen: false,
    contextMenu: null as { x: number; y: number; items: ContextMenuItem[] } | null,
    toasts: [] as ToastMessage[],
    /** 正在拖动的条目 */
    dragging: null as Id | null,
    /** 拖动时允许 Dock 显示 */
    dockReveal: false,
    /** 分组切换方向：1 向后，-1 向前 */
    direction: 1 as 1 | -1,
    confirm: null as {
      text: string
      title?: string
      okText?: string
      danger?: boolean
      resolve: (ok: boolean) => void
    } | null,
    renamingGroup: null as Id | null,
  })

  /* ---------------- 派生状态 ---------------- */
  const systemDark = ref(matchMedia('(prefers-color-scheme: dark)').matches)
  matchMedia('(prefers-color-scheme: dark)').addEventListener(
    'change',
    (e) => (systemDark.value = e.matches),
  )
  const systemReduced = ref(matchMedia('(prefers-reduced-motion: reduce)').matches)
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener(
    'change',
    (e) => (systemReduced.value = e.matches),
  )

  const lang = computed<Lang>(() =>
    settings.language === 'auto' ? detectLanguage() : settings.language,
  )
  const resolvedTheme = computed<ResolvedTheme>(() =>
    settings.theme === 'auto' ? (systemDark.value ? 'dark' : 'light') : settings.theme,
  )
  const reducedMotion = computed(() => triOn(settings.reducedMotion, systemReduced.value))
  const timeZone = computed(() => effectiveTimeZone(settings.clock.timeZone))
  // 浏览器时区在中国，或同步服务按 IP 判断为中国
  const chinaUser = computed(() => isChinaUser() || local.geo?.country === 'CN')
  const showLunar = computed(() => triOn(settings.clock.lunar, chinaUser.value))
  const showHolidays = computed(() => triOn(settings.clock.holidays, chinaUser.value))

  const activeGroup = computed(
    () => data.groups.find((g) => g.id === local.activeGroup) ?? data.groups[0]!,
  )
  const activeIndex = computed(() => data.groups.indexOf(activeGroup.value))

  function switchGroup(target: Id | number) {
    const index =
      typeof target === 'number' ? target : data.groups.findIndex((g) => g.id === target)
    if (index < 0 || index >= data.groups.length) return
    const id = data.groups[index]!.id
    if (id === activeGroup.value.id) return
    ui.direction = index > activeIndex.value ? 1 : -1
    ui.openFolder = null
    local.activeGroup = id
  }

  function stepGroup(delta: 1 | -1, wrap = true) {
    const n = data.groups.length
    let next = activeIndex.value + delta
    if (wrap) next = (next + n) % n
    if (next < 0 || next >= n) return
    switchGroup(next)
  }

  /* ---------------- 提示与确认 ---------------- */
  let toastSeq = 0
  function toast(text: string, tone: ToastMessage['tone'] = 'info') {
    const id = ++toastSeq
    ui.toasts.push({ id, text, tone })
    setTimeout(() => {
      const i = ui.toasts.findIndex((x) => x.id === id)
      if (i >= 0) ui.toasts.splice(i, 1)
    }, 3200)
  }

  function confirm(
    text: string,
    options: { title?: string; okText?: string; danger?: boolean } = {},
  ): Promise<boolean> {
    ui.confirm?.resolve(false)
    return new Promise((resolve) => {
      ui.confirm = {
        text,
        ...options,
        resolve: (ok) => {
          ui.confirm = null
          resolve(ok)
        },
      }
    })
  }

  /* ---------------- 打开链接 ---------------- */
  function openUrl(url: string, newTab = settings.openIn === 'new') {
    if (!isSafeUrl(url)) {
      toast(url, 'error')
      return
    }
    if (newTab) window.open(url, '_blank', 'noopener')
    else location.href = url
  }

  /* ---------------- 持久化 ---------------- */
  const storage = platform.storage
  const lastBody: Record<string, string> = {}
  const timers: Record<string, ReturnType<typeof setTimeout>> = {}
  /** 写入存储前的回调（同步模块在这里把修改写进 Yjs 文档并广播给其他标签页） */
  const persistHooks: ((key: string) => void)[] = []
  function onPersist(fn: (key: string) => void) {
    persistHooks.push(fn)
  }

  function persist(key: string, target: { updatedAt: number } | LocalState) {
    clearTimeout(timers[key])
    timers[key] = setTimeout(() => {
      const raw = toRaw(target) as { updatedAt?: number }
      const body = 'updatedAt' in raw ? bodyOf(raw as { updatedAt: number }) : JSON.stringify(raw)
      if (body === lastBody[key]) return
      lastBody[key] = body
      // 直接改原始对象，不触发响应式更新
      if ('updatedAt' in raw) raw.updatedAt = Date.now()
      for (const fn of persistHooks) {
        try {
          fn(key)
        } catch (e) {
          // 同步出错不能影响本机保存
          console.error(e)
        }
      }
      void storage.set(key, JSON.parse(JSON.stringify(raw)))
    }, 250)
  }

  function replace<T extends object>(target: T, value: T) {
    for (const k of Object.keys(target))
      if (!(k in value)) delete (target as Record<string, unknown>)[k]
    Object.assign(target, value)
  }

  /** 用新内容整体替换数据（导入、恢复预设等），并立即保存 */
  function replaceData(value: MyriadData) {
    replace(data, value)
    data.updatedAt = Date.now()
    if (!data.groups.some((g) => g.id === local.activeGroup)) local.activeGroup = data.groups[0]!.id
  }

  function replaceSettings(value: MyriadSettings) {
    replace(settings, value)
  }

  async function load() {
    const [savedData, savedSettings, savedLocal] = await Promise.all([
      storage.get(STORAGE_KEYS.data),
      storage.get(STORAGE_KEYS.settings),
      storage.get(STORAGE_KEYS.local),
    ])
    const d = loadData(savedData)
    firstRun.value = !d
    if (d) replace(data, d)
    replace(settings, loadSettings(savedSettings))
    replace(local, loadLocalState(savedLocal))
    lastBody[STORAGE_KEYS.data] = d ? bodyOf(d) : ''
    lastBody[STORAGE_KEYS.settings] = savedSettings ? bodyOf(settings) : ''
    loaded.value = true
    try {
      localStorage.setItem(
        BOOT_KEY,
        JSON.stringify({
          palette: settings.palette,
          theme: settings.theme,
          grabFocus: settings.search.grabFocus,
        }),
      )
    } catch {
      /* 忽略 */
    }

    watch(data, () => persist(STORAGE_KEYS.data, data), { deep: true })
    watch(settings, () => persist(STORAGE_KEYS.settings, settings), { deep: true })
    watch(local, () => persist(STORAGE_KEYS.local, local), { deep: true })
    if (firstRun.value) persist(STORAGE_KEYS.data, data)

    // 其他标签页的修改
    storage.subscribe?.((key, value) => {
      if (key === STORAGE_KEYS.data) {
        const d = loadData(value)
        if (!d || d.updatedAt <= toRaw(data).updatedAt) return
        lastBody[key] = bodyOf(d)
        replace(data, d)
      } else if (key === STORAGE_KEYS.settings) {
        const s = loadSettings(value)
        if (s.updatedAt <= toRaw(settings).updatedAt) return
        lastBody[key] = bodyOf(s)
        replace(settings, s)
      } else if (key === STORAGE_KEYS.local) {
        // 当前分组按标签页独立，其余合并
        const l = loadLocalState(value)
        lastBody[key] = JSON.stringify({ ...l, activeGroup: local.activeGroup })
        local.searchHistory = l.searchHistory
        local.iconCache = l.iconCache
        local.onboarded = l.onboarded
        local.sync = l.sync
        local.geo = l.geo
      }
    })
  }

  /* ---------------- 首帧主题 ---------------- */
  watch(
    () => [settings.palette, settings.theme, settings.search.grabFocus] as const,
    ([palette, theme, grabFocus]) => {
      if (!loaded.value) return
      try {
        localStorage.setItem(BOOT_KEY, JSON.stringify({ palette, theme, grabFocus }))
      } catch {
        /* 无法写入时下次首帧按系统主题 */
      }
    },
    { immediate: true },
  )

  return {
    platform,
    data,
    settings,
    local,
    ui,
    loaded,
    firstRun,
    lang,
    resolvedTheme,
    reducedMotion,
    timeZone,
    chinaUser,
    showLunar,
    showHolidays,
    activeGroup,
    activeIndex,
    load,
    switchGroup,
    stepGroup,
    toast,
    confirm,
    openUrl,
    replaceData,
    replaceSettings,
    onPersist,
  }
}
