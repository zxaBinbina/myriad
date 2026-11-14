<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useStore } from '../state/store'
import ItemGrid from './ItemGrid.vue'

const store = useStore()
const root = ref<HTMLElement | null>(null)

const transitionName = computed(() => {
  if (store.reducedMotion.value) return 'm-page-none'
  if (store.settings.layout.transition === 'fade') return 'm-page-fade'
  const vertical = store.settings.layout.groupPosition === 'side'
  const forward = store.ui.direction === 1
  return vertical
    ? forward
      ? 'm-page-up'
      : 'm-page-down'
    : forward
      ? 'm-page-left'
      : 'm-page-right'
})

/*
 * 滚轮 / 触控板切换分组：作用于整个页面（时钟搜索区、小组件、Dock、弹窗等除外），
 * 横向滑动直接切换；纵向滚动在页面到达尽头后继续滚动才切换
 */
let accum = 0
let lock = 0
let resetTimer: ReturnType<typeof setTimeout> | undefined
const THRESHOLD = 60
const EXCLUDE =
  '.m-hero, .m-widget, .m-dock-zone, .m-drawer, .m-folder, .m-menu, .m-toolbar, dialog, [data-no-wheel], input, textarea, select'

function atEdge(direction: 1 | -1) {
  const el = document.scrollingElement ?? document.documentElement
  if (direction > 0) return el.scrollTop + el.clientHeight >= el.scrollHeight - 2
  return el.scrollTop <= 0
}

function blocked() {
  const ui = store.ui
  return !!(
    ui.dragging ||
    ui.settingsOpen ||
    ui.editor ||
    ui.widgetEditor ||
    ui.confirm ||
    ui.contextMenu ||
    ui.openFolder ||
    ui.dashboardOpen ||
    ui.bookmarkImportOpen
  )
}

function onWheel(e: WheelEvent) {
  if (!store.settings.layout.wheelSwitch || e.ctrlKey || blocked()) return
  const target = e.target as HTMLElement | null
  if (!target?.closest?.('.myriad') || target.closest(EXCLUDE)) return
  const now = Date.now()
  if (now < lock) return
  const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
  const delta = horizontal ? e.deltaX : e.deltaY
  const direction: 1 | -1 = delta > 0 ? 1 : -1
  if (!horizontal && !atEdge(direction)) {
    accum = 0
    return
  }
  // 顶部分组时纵向滚轮也能切换；侧栏时只用纵向
  if (horizontal && store.settings.layout.groupPosition === 'side') return
  accum += delta
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => (accum = 0), 200)
  if (Math.abs(accum) < THRESHOLD) return
  accum = 0
  lock = now + 650
  store.stepGroup(direction, false)
}

onMounted(() => addEventListener('wheel', onWheel, { passive: true }))
onBeforeUnmount(() => {
  removeEventListener('wheel', onWheel)
  clearTimeout(resetTimer)
})
</script>

<template>
  <div ref="root" class="m-pager">
    <Transition :name="transitionName">
      <ItemGrid :key="store.activeGroup.value.id" :group="store.activeGroup.value" class="m-page" />
    </Transition>
  </div>
</template>

<style scoped>
.m-pager {
  position: relative;
  display: grid;
  min-width: 0;
}
.m-page {
  grid-area: 1 / 1;
  min-width: 0;
}
.m-page-left-enter-active,
.m-page-left-leave-active,
.m-page-right-enter-active,
.m-page-right-leave-active,
.m-page-up-enter-active,
.m-page-up-leave-active,
.m-page-down-enter-active,
.m-page-down-leave-active {
  transition:
    transform 0.46s var(--motion-ease),
    opacity 0.36s ease;
}
.m-page-left-enter-from,
.m-page-right-leave-to {
  transform: translateX(14%);
  opacity: 0;
}
.m-page-left-leave-to,
.m-page-right-enter-from {
  transform: translateX(-14%);
  opacity: 0;
}
.m-page-up-enter-from,
.m-page-down-leave-to {
  transform: translateY(18%);
  opacity: 0;
}
.m-page-up-leave-to,
.m-page-down-enter-from {
  transform: translateY(-18%);
  opacity: 0;
}
.m-page-fade-enter-active,
.m-page-fade-leave-active {
  transition: opacity 0.3s ease;
}
.m-page-fade-enter-from,
.m-page-fade-leave-to {
  opacity: 0;
}
[class*='-leave-active'] {
  pointer-events: none;
}
</style>
