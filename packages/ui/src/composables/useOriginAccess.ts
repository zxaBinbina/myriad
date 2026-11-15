import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useStore } from '../state/store'

/** Permission checks never prompt; requests are called directly from a user action. */
export function useOriginAccess(origin: () => string) {
  const platform = useStore().platform
  const source = computed(origin)
  const granted = ref(!platform.origins)
  const pending = ref(false)
  let revision = 0
  let disposed = false

  async function refresh() {
    if (pending.value || disposed) return
    const current = source.value
    const request = ++revision
    granted.value = !current || !platform.origins
    if (granted.value) return
    try {
      const allowed = await platform.origins!.has(current)
      if (request === revision) granted.value = allowed
    } catch {
      // Keep the explicit retry action available.
    }
  }

  async function request() {
    const current = source.value
    if (!current || !platform.origins) return true
    if (pending.value) return false
    const request = ++revision
    pending.value = true
    try {
      // No awaited checks before request(): Chrome requires the original gesture.
      const permission = platform.origins.request(current)
      const allowed = await permission
      if (request === revision && source.value === current) granted.value = allowed
      return allowed
    } catch {
      return false
    } finally {
      pending.value = false
      if (request !== revision) void refresh()
    }
  }

  const onFocus = () => void refresh()
  watch(
    source,
    () => {
      ++revision
      granted.value = !source.value || !platform.origins
      void refresh()
    },
    { immediate: true, flush: 'sync' },
  )
  window.addEventListener('focus', onFocus)
  onBeforeUnmount(() => {
    ++revision
    disposed = true
    window.removeEventListener('focus', onFocus)
  })
  return { granted, pending, request }
}
