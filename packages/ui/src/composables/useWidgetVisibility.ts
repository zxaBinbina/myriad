import { findContainer } from '@myriad/core'
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { useStore } from '../state/store'

/** Shared visibility gate for automatic resources and explicit translation requests. */
export function useWidgetVisibility(itemId?: Ref<string>) {
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
  let observer: IntersectionObserver | undefined
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
    observer?.disconnect()
    document.removeEventListener('visibilitychange', visibility)
  })
  return { root, active }
}
