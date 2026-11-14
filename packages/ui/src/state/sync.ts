import {
  ApiError,
  type ApiErrorCode,
  type ApiFeatures,
  createApi,
  dataToJson,
  decodeSnapshot,
  deepEqual,
  HOLIDAY_SOURCES,
  historyFromJson,
  historyToJson,
  LOCAL_PATH_SEP,
  pinPaths,
  loadData,
  mergeSyncedSettings,
  type MyriadApi,
  normalizeBase,
  originOf,
  type ResolvedConflict,
  setAtPath,
  settingsToJson,
  stableStringify,
  STORAGE_KEYS,
  SYNC_ROOTS,
  SyncEngine,
  syncedSettingKeys,
} from '@myriad/core'
import { computed, inject, type InjectionKey, reactive, shallowRef, toRaw, watch } from 'vue'
import type { MyriadStore } from './store'

/**
 * 界面与同步引擎之间的胶水：
 * - store 每次写存储前，把修改写进 Yjs 文档（并广播给其他标签页），随后防抖推送；
 * - 收到远端修改时，把文档内容写回 store；
 * - 打开页面、切回标签页、恢复网络、每 5 分钟（页面可见时）拉取一次。
 */

export type ConflictChoice = 'local' | 'remote' | 'pin'
export type SyncStatus = 'off' | 'connecting' | 'idle' | 'syncing' | 'offline' | 'error'
export type ConnectChoice = 'cloud' | 'local'

export const SYNC_KEY: InjectionKey<SyncController> = Symbol('myriad-sync')
export type SyncController = ReturnType<typeof createSyncController>

export function useSync(): SyncController {
  const s = inject(SYNC_KEY)
  if (!s) throw new Error('Myriad sync is not provided')
  return s
}

const PUSH_DELAY = 3000
const PULL_INTERVAL = 5 * 60_000
const VISIBLE_THROTTLE = 15_000
const SYNC_STATE_KEY = 'myriad.sync.state'

export function createSyncController(store: MyriadStore) {
  const cfg = () => store.local.sync
  const state = reactive({
    status: 'off' as SyncStatus,
    error: '' as ApiErrorCode | '',
    identity: '',
    features: null as ApiFeatures | null,
    /** 有尚未上传的修改 */
    pending: false,
    /** 首次连接时云端已有数据，等待用户选择 */
    choice: null as { resolve: (c: ConnectChoice | null) => void } | null,
  })

  /** 待用户处理的冲突（Json 是递归类型，用 shallowRef 避免深层响应式） */
  const conflicts = shallowRef<ResolvedConflict[]>([])

  let engine: SyncEngine | null = null
  let api: MyriadApi | null = null
  /** 首次连接、决定用哪边数据之前，不在 store 与文档之间互相写入 */
  let holding = false
  let pushTimer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryDelay = 30_000
  let lastPull = 0
  let running: Promise<void> | null = null

  const channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('myriad-sync')

  const active = computed(() => state.status !== 'off' && state.status !== 'connecting')
  const apiBase = computed(() => normalizeBase(cfg().apiBase))
  /** 图标代理地址：已连接且开启时为同步服务地址 */
  const iconProxyBase = computed(() =>
    cfg().enabled && cfg().iconProxy && state.features?.icons !== false ? apiBase.value : '',
  )
  const canBlobs = computed(() => active.value && !!state.features?.blobs)
  const canBackups = computed(() => active.value && !!state.features?.backups)
  const canUnsplash = computed(() => active.value && !!state.features?.unsplash)

  function makeApi() {
    return createApi({
      base: cfg().apiBase,
      token: cfg().authMode === 'token' ? cfg().token.trim() : undefined,
      clientId: cfg().authMode === 'access' ? cfg().clientId.trim() : undefined,
      clientSecret: cfg().authMode === 'access' ? cfg().clientSecret.trim() : undefined,
    })
  }

  const keys = () => syncedSettingKeys(cfg().scopes)

  /* ---------------- store → 文档 ---------------- */

  function flushLocal(only?: string) {
    if (!engine || holding) return
    let changed = false
    if (!only || only === STORAGE_KEYS.data)
      changed = engine.applyLocal('data', dataToJson(toRaw(store.data))) || changed
    if (!only || only === STORAGE_KEYS.settings) {
      const k = keys()
      const json = settingsToJson(toRaw(store.settings), k)
      // 「仅本机」的项保持文档里原来的值，不上传
      pinPaths(json, engine.read('settings') ?? {}, cfg().localOnly)
      changed = engine.applyLocal('settings', json, k) || changed
    }
    if ((!only || only === STORAGE_KEYS.local) && cfg().scopes.history)
      changed =
        engine.applyLocal('history', historyToJson(toRaw(store.local.searchHistory))) || changed
    if (changed) {
      state.pending = true
      schedulePush()
    }
  }

  store.onPersist((key) => flushLocal(key))

  /* ---------------- 文档 → store ---------------- */

  function applyRemote() {
    if (!engine || holding) return
    const d = engine.read('data')
    if (d) {
      const next = loadData({ ...d, updatedAt: Date.now() })
      if (
        next &&
        stableStringify(dataToJson(next)) !== stableStringify(dataToJson(toRaw(store.data)))
      )
        store.replaceData(next)
    }
    const s = engine.read('settings')
    if (s) {
      // 「仅本机」的项保留本机的值
      pinPaths(s, plainSettings(), cfg().localOnly)
      const next = mergeSyncedSettings(toRaw(store.settings), s, keys())
      if (!deepEqual({ ...next, updatedAt: 0 }, { ...toRaw(store.settings), updatedAt: 0 }))
        store.replaceSettings(next)
    }
    if (cfg().scopes.history) {
      const h = engine.read('history')
      if (h) {
        const list = historyFromJson(h)
        if (!deepEqual(list, toRaw(store.local.searchHistory))) store.local.searchHistory = list
      }
    }
  }

  const plainSettings = () => JSON.parse(JSON.stringify(store.settings)) as unknown

  function createEngine() {
    return new SyncEngine({
      storage: store.platform.storage,
      storageKey: SYNC_STATE_KEY,
      roots: SYNC_ROOTS,
      channel,
      flushLocal: () => flushLocal(),
      onRemote: () => applyRemote(),
    })
  }

  /* ---------------- 同步 ---------------- */

  function schedulePush() {
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => void syncNow(), PUSH_DELAY)
  }

  function fail(e: unknown) {
    const code: ApiErrorCode = e instanceof ApiError ? e.code : 'network'
    state.error = code
    clearTimeout(retryTimer)
    if (code === 'network') {
      state.status = 'offline'
      retryTimer = setTimeout(() => void syncNow(), retryDelay)
      retryDelay = Math.min(retryDelay * 2, 5 * 60_000)
    } else {
      state.status = 'error'
      // 鉴权 / 未启用等问题需要用户处理，不自动重试；服务器错误稍后再试
      if (code === 'server') retryTimer = setTimeout(() => void syncNow(), 60_000)
    }
  }

  function addConflicts(list: ResolvedConflict[]) {
    // 搜索历史按并集合并，时间戳不同不算冲突
    const incoming = list.filter((c) => c.path[0] !== 'history')
    if (!incoming.length) return
    const key = (c: ResolvedConflict) => c.path.join('\u0001')
    const keys = new Set(incoming.map(key))
    conflicts.value = [...conflicts.value.filter((c) => !keys.has(key(c))), ...incoming]
  }

  /** 立即同步一次（同时只跑一个） */
  function syncNow(): Promise<void> {
    if (!engine || !api || holding) return Promise.resolve()
    if (running) return running
    clearTimeout(pushTimer)
    const e = engine
    const a = api
    running = (async () => {
      state.status = 'syncing'
      try {
        const r = await e.sync(a.transport)
        if (e !== engine) return
        addConflicts(r.conflicts)
        state.status = 'idle'
        state.error = ''
        state.pending = e.dirty
        retryDelay = 30_000
        lastPull = Date.now()
        cfg().lastSync = lastPull
        if (e.dirty) schedulePush()
      } catch (err) {
        if (e === engine) fail(err)
      } finally {
        running = null
      }
    })()
    return running
  }

  /** 连接后取一次服务信息与地理位置 */
  async function refreshInfo(a: MyriadApi) {
    const me = await a.me()
    state.identity = me.identity
    state.features = me.features
    const geo = store.local.geo
    if (!geo || Date.now() - geo.at > 86400_000) {
      a.geo()
        .then((g) => (store.local.geo = { country: g.country, at: Date.now() }))
        .catch(() => undefined)
    }
    return me
  }

  /** 页面打开时：已启用同步则恢复 */
  async function init() {
    if (!cfg().enabled || engine) return
    api = makeApi()
    engine = createEngine()
    state.status = 'syncing'
    await engine.load()
    state.pending = engine.dirty
    try {
      await refreshInfo(api)
    } catch (err) {
      fail(err)
      return
    }
    await syncNow()
  }

  function teardown() {
    clearTimeout(pushTimer)
    clearTimeout(retryTimer)
    engine?.dispose()
    engine = null
    api = null
    holding = false
    state.status = 'off'
    state.error = ''
    state.pending = false
    conflicts.value = []
  }

  function askChoice(): Promise<ConnectChoice | null> {
    return new Promise((resolve) => {
      state.choice = {
        resolve: (c) => {
          state.choice = null
          resolve(c)
        },
      }
    })
  }

  /**
   * 首次连接。扩展需要先在点击事件里调用 requestPermission()。
   * 云端已有数据且本机不是全新状态时，询问用哪一边。
   */
  async function connect(): Promise<boolean> {
    teardown()
    state.status = 'connecting'
    const a = makeApi()
    const e = createEngine()
    try {
      await refreshInfo(a)
      if (!state.features?.sync) throw new ApiError('disabled', 501)
      await e.reset()
      holding = true
      engine = e
      api = a
      await e.sync(a.transport)
      let choice: ConnectChoice | null = 'local'
      // 本机还是全新状态（没完成首次引导）时直接用云端，否则询问
      const untouched = store.firstRun.value && !store.local.onboarded
      if (!e.isEmpty()) choice = untouched ? 'cloud' : await askChoice()
      if (!choice) {
        await e.reset()
        teardown()
        return false
      }
      if (choice === 'local' && !e.isEmpty() && state.features.backups) {
        // 用本机数据覆盖云端前，先在服务器上备份一份
        await a.createBackup('manual').catch(() => undefined)
      }
      holding = false
      if (choice === 'cloud') {
        applyRemote()
        store.local.onboarded = true
      } else flushLocal()
      cfg().enabled = true
      state.status = 'idle'
      await syncNow()
      return true
    } catch (err) {
      holding = false
      engine = null
      api = null
      e.dispose()
      state.status = 'off'
      state.error = err instanceof ApiError ? err.code : 'network'
      return false
    }
  }

  async function disconnect() {
    const e = engine
    teardown()
    cfg().enabled = false
    if (e) await e.reset().catch(() => undefined)
    else await store.platform.storage.remove(SYNC_STATE_KEY)
  }

  /** 扩展：申请访问同步服务的主机权限（必须在点击事件中、await 之前调用） */
  function requestPermission(): Promise<boolean> {
    const origin = originOf(cfg().apiBase)
    if (!origin) return Promise.resolve(false)
    if (!store.platform.origins) return Promise.resolve(true)
    return store.platform.origins.request(origin)
  }

  /* ---------------- 冲突 ---------------- */

  /**
   * 按用户选择处理冲突：
   * - local：写回本机值（成为一次新的修改，同步给其他设备）
   * - remote：保留其他设备的值
   * - pin：保留本机值，并把这一项设为「仅本机」，以后不再同步（只用于设置）
   */
  function resolveConflicts(choices: Record<number, ConflictChoice>) {
    const pinned: string[] = []
    conflicts.value.forEach((c, i) => {
      const pick = choices[i] ?? 'remote'
      if (pick === 'pin' && c.path[0] === 'settings')
        pinned.push(c.path.slice(1).join(LOCAL_PATH_SEP))
      // 先登记「仅本机」，写回的本机值稍后写入文档时就不会被上传
      for (const p of pinned) if (!cfg().localOnly.includes(p)) cfg().localOnly.push(p)
      const value = pick === 'remote' ? c.remote : c.local
      if (deepEqual(value, c.current)) return
      const [root, ...path] = c.path
      const target = root === 'data' ? store.data : root === 'settings' ? store.settings : null
      if (target) setAtPath(target, path, structuredClone(value))
    })
    conflicts.value = []
  }

  /* ---------------- 备份 ---------------- */

  /** 导入数据、回滚前在服务器上多备份一份；失败不阻止操作 */
  async function backupBefore(reason: 'import' | 'rollback') {
    if (!canBackups.value || !api) return
    try {
      await syncNow()
      await api.createBackup(reason)
    } catch {
      /* 忽略 */
    }
  }

  async function rollback(id: string) {
    if (!api) throw new ApiError('disabled')
    await backupBefore('rollback')
    const snap = decodeSnapshot(await api.downloadBackup(id), SYNC_ROOTS)
    const d = snap.data ? loadData({ ...snap.data, updatedAt: Date.now() }) : null
    if (d) store.replaceData(d)
    if (snap.settings) {
      pinPaths(snap.settings, plainSettings(), cfg().localOnly)
      store.replaceSettings(mergeSyncedSettings(toRaw(store.settings), snap.settings, keys()))
    }
    if (snap.history && cfg().scopes.history)
      store.local.searchHistory = historyFromJson(snap.history)
  }

  /* ---------------- 文件与数据源 ---------------- */

  async function uploadBlob(key: string, blob: Blob) {
    if (canBlobs.value && api) {
      if (state.features?.blobMaxBytes && blob.size > state.features.blobMaxBytes)
        throw new ApiError('too-large', 413)
      await api.putBlob(key, blob)
    }
  }

  async function fetchBlob(key: string): Promise<Blob | null> {
    if (!canBlobs.value || !api) return null
    try {
      return await api.getBlob(key)
    } catch {
      return null
    }
  }

  async function deleteBlob(key: string) {
    if (canBlobs.value && api) await api.deleteBlob(key).catch(() => undefined)
  }

  /** 节假日数据源：已连接时优先走 Worker（KV 缓存），失败再直连 */
  const holidaySources = computed(() =>
    cfg().enabled ? [`${apiBase.value}/v1/holidays/{year}`, ...HOLIDAY_SOURCES] : HOLIDAY_SOURCES,
  )

  /* ---------------- 触发时机 ---------------- */

  function onVisible() {
    if (document.visibilityState !== 'visible' || !engine) return
    if (Date.now() - lastPull > VISIBLE_THROTTLE) void syncNow()
  }
  const onOnline = () => {
    retryDelay = 30_000
    void syncNow()
  }
  document.addEventListener('visibilitychange', onVisible)
  addEventListener('online', onOnline)
  setInterval(() => {
    if (document.visibilityState === 'visible' && engine && Date.now() - lastPull >= PULL_INTERVAL)
      void syncNow()
  }, 60_000)

  // 其他标签页连接 / 断开同步
  watch(
    () => cfg().enabled,
    (on) => {
      if (on && !engine && state.status === 'off') void init()
      else if (!on && engine && !holding) teardown()
    },
  )
  // 调整同步范围：新纳入同步的设置以本机为准写入
  watch(
    () => ({ ...cfg().scopes }),
    () => {
      if (engine) flushLocal()
    },
    { deep: true },
  )

  return {
    state,
    conflicts,
    active,
    apiBase,
    iconProxyBase,
    canBlobs,
    canBackups,
    canUnsplash,
    holidaySources,
    get api() {
      return api
    },
    init,
    connect,
    disconnect,
    requestPermission,
    syncNow,
    resolveConflicts,
    /** 让「仅本机」的设置项恢复同步（以本机的值为准上传） */
    unpin(path: string) {
      cfg().localOnly = cfg().localOnly.filter((p) => p !== path)
      flushLocal(STORAGE_KEYS.settings)
    },
    backupBefore,
    rollback,
    uploadBlob,
    fetchBlob,
    deleteBlob,
    /** 测试连接（不保存），返回身份 */
    async test() {
      const me = await makeApi().me()
      return me.identity
    },
  }
}

/** 冲突路径对应的条目 / 字段，供界面显示 */
export function conflictTarget(store: MyriadStore, c: ResolvedConflict) {
  const [root, ...path] = c.path
  if (root === 'data' && path[0] === 'items') {
    const item = store.data.items[path[1]!]
    return {
      kind: 'item' as const,
      name: item && 'title' in item ? item.title : (path[1] ?? ''),
      field: path.slice(2).join('.'),
    }
  }
  if (root === 'data' && path[0] === 'groups') {
    const id = path[1]?.slice(1)
    const g = store.data.groups.find((x) => x.id === id)
    return { kind: 'group' as const, name: g?.name ?? id ?? '', field: path.slice(2).join('.') }
  }
  return { kind: 'setting' as const, name: path[0] ?? '', field: path.slice(1).join('.') }
}
