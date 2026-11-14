import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { useStore } from '../state/store'
import { findContainer } from '@myriad/core'

export class PermissionRequired extends Error {}
interface Entry<T> {
  value: T
  expires: number
}

/** 可见时才读取资源；隐藏即取消请求和刷新计时。Web Locks 同时防止多标签页重复取一言。 */
export function useVisibleResource<T>(
  key: Ref<string | null>,
  load: (signal: AbortSignal) => Promise<T>,
  maxAge: number | ((value: T) => number),
  itemId?: Ref<string>,
  options: { autoRefresh?: boolean; retry?: boolean; revalidateOnVisible?: boolean } = {},
) {
  const store = useStore()
  const root = ref<HTMLElement | null>(null)
  const intersecting = ref(false)
  const foreground = ref(document.visibilityState === 'visible')
  const active = computed(() => {
    const container = itemId ? findContainer(store.data, itemId.value) : null
    return (
      intersecting.value &&
      foreground.value &&
      (!itemId ||
        (container?.kind === 'group' &&
          container.id === store.activeGroup.value.id &&
          (store.settings.layout.mode === 'grid' || store.ui.dashboardOpen)))
    )
  })
  const data = ref<T>() as Ref<T | undefined>
  const loading = ref(false)
  const error = ref<'permission' | 'network' | ''>('')
  const stale = ref(false)
  let observer: IntersectionObserver | undefined
  let controller: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let version = 0
  let loadedKey: string | null = null

  function stop() {
    version++
    controller?.abort()
    clearTimeout(timer)
    loading.value = false
  }

  async function reload(force = false) {
    stop()
    if (!active.value || !key.value) return
    const token = version
    const cacheKey = `myriad.cache.widget.${key.value}`
    const ctrl = new AbortController()
    controller = ctrl
    error.value = ''
    loading.value = true
    try {
      const read = () => store.platform.storage.get<Entry<T>>(cacheKey)
      const hit = await read()
      if (token !== version) return
      if (hit) {
        data.value = hit.value
        stale.value = hit.expires <= Date.now()
      }
      const fetchEntry = async () => {
        ctrl.signal.throwIfAborted()
        const current = await read()
        ctrl.signal.throwIfAborted()
        if (!force && current && current.expires > Date.now()) return current
        const value = await load(ctrl.signal)
        ctrl.signal.throwIfAborted()
        const next = {
          value,
          expires: Date.now() + (typeof maxAge === 'function' ? maxAge(value) : maxAge),
        }
        await store.platform.storage.set(cacheKey, next)
        return next
      }
      const entry =
        !force && hit && hit.expires > Date.now()
          ? hit
          : navigator.locks
            ? await navigator.locks.request(cacheKey, { signal: ctrl.signal }, fetchEntry)
            : await fetchEntry()
      if (token !== version) return
      data.value = entry.value
      loadedKey = key.value
      stale.value = false
      // 日键由组件的日期响应式更新；普通资源在缓存过期后刷新。
      if (options.autoRefresh !== false)
        timer = setTimeout(() => void reload(), Math.max(1000, entry.expires - Date.now() + 20))
    } catch (e) {
      if (token !== version || ctrl.signal.aborted) return
      error.value = e instanceof PermissionRequired ? 'permission' : 'network'
      stale.value = !!data.value
      if (error.value === 'network' && options.retry !== false)
        timer = setTimeout(() => void reload(), 60000)
    } finally {
      if (token === version) loading.value = false
    }
  }

  watch([active, key], ([, current], [, previous]) => {
    if (current !== previous) {
      data.value = undefined
      stale.value = false
    }
    if (
      active.value &&
      current === previous &&
      options.revalidateOnVisible === false &&
      loadedKey === current
    )
      return
    void reload()
  })
  function visibility() {
    foreground.value = document.visibilityState === 'visible'
  }
  onMounted(() => {
    document.addEventListener('visibilitychange', visibility)
    observer = new IntersectionObserver(([entry]) => {
      intersecting.value = !!entry?.isIntersecting
    })
    if (root.value) observer.observe(root.value)
  })
  onBeforeUnmount(() => {
    stop()
    observer?.disconnect()
    document.removeEventListener('visibilitychange', visibility)
  })
  return { root, data, active, loading, error, stale, reload }
}
