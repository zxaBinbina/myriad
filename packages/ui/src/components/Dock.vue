<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '../i18n'
import { useActions } from '../state/actions'
import { useStore } from '../state/store'
import Tile from './Tile.vue'

const store = useStore()
const actions = useActions()
const { m } = useI18n()

const visibility = computed(() => store.settings.dock.visibility)
const dragging = computed(() => !!store.ui.dragging)
const items = computed(() => store.data.dock)
/** 拖动时即使设置为隐藏也显示，方便把图标拖进或拖出 */
const enabled = computed(() => visibility.value !== 'hidden' || dragging.value)
const nearBottom = ref(false)
const hovering = ref(false)
const shown = computed(() => {
  if (!enabled.value) return false
  if (dragging.value) return true
  if (!items.value.length) return false
  if (visibility.value === 'always') return true
  return nearBottom.value || hovering.value || (store.ui.openFolder !== null && isDockFolder.value)
})
const isDockFolder = computed(
  () => !!store.ui.openFolder && store.data.dock.includes(store.ui.openFolder),
)

/* 自动隐藏：鼠标移到页面底端附近时滑出 */
let leaveTimer: ReturnType<typeof setTimeout> | undefined
function onPointerMove(e: PointerEvent) {
  if (visibility.value !== 'auto-hide') return
  const near = e.clientY >= innerHeight - 14
  if (near) {
    clearTimeout(leaveTimer)
    nearBottom.value = true
  } else if (nearBottom.value && !hovering.value) {
    clearTimeout(leaveTimer)
    leaveTimer = setTimeout(() => (nearBottom.value = false), 450)
  }
}
onMounted(() => addEventListener('pointermove', onPointerMove, { passive: true }))
onBeforeUnmount(() => {
  removeEventListener('pointermove', onPointerMove)
  clearTimeout(leaveTimer)
})

/*
 * 放大效果：格子宽度固定，图标用 transform 放大，背景跟随实际图标边界扩展。
 * 相邻图标向两侧让开；指针下方的图标保持原位，所以放大中心始终跟着指针。
 */
const bar = ref<HTMLElement | null>(null)
const fx = ref<{ s: number; x: number }[]>([])
const growth = ref({ left: 0, right: 0, top: 0 })
const magnify = computed(
  () => store.settings.dock.hover === 'magnify' && !store.reducedMotion.value && !dragging.value,
)
const RANGE = 150
const MAX_EXTRA = 0.5
let frame = 0
let pointerX = 0

function layout() {
  frame = 0
  if (!magnify.value || !bar.value) return
  const slots = Array.from(bar.value.querySelectorAll<HTMLElement>('.m-dock__slot'))
  // 格子不随放大改变尺寸，读到的位置是稳定的
  const rects = slots.map((el) => el.getBoundingClientRect())
  const scales = rects.map((r) => {
    const d = Math.abs(pointerX - (r.left + r.width / 2))
    const k = Math.max(0, 1 - d / RANGE)
    return 1 + MAX_EXTRA * Math.sin((k * Math.PI) / 2) ** 2
  })
  const extra = rects.map((r, i) => r.width * (scales[i]! - 1))
  // 指针左侧累计的额外宽度：以指针位置为锚点向两侧展开
  let anchor = 0
  rects.forEach((r, i) => {
    anchor += extra[i]! * Math.min(1, Math.max(0, (pointerX - r.left) / r.width))
  })
  let acc = 0
  fx.value = rects.map((_, i) => {
    const x = acc + extra[i]! / 2 - anchor
    acc += extra[i]!
    return { s: scales[i]!, x }
  })
  // 只扩展独立背景，不改变格子坐标，避免指针锚点随背景尺寸来回移动。
  const base = bar.value.getBoundingClientRect()
  const padding = getComputedStyle(bar.value)
  const bounds = rects.map((r, i) => {
    const { s, x } = fx.value[i]!
    return {
      left: r.left + x - (r.width * (s - 1)) / 2,
      right: r.right + x + (r.width * (s - 1)) / 2,
      top: r.bottom - r.height * s,
    }
  })
  growth.value = {
    left: Math.max(
      0,
      base.left + parseFloat(padding.paddingLeft) - Math.min(...bounds.map((b) => b.left)),
    ),
    right: Math.max(
      0,
      Math.max(...bounds.map((b) => b.right)) + parseFloat(padding.paddingRight) - base.right,
    ),
    top: Math.max(
      0,
      base.top + parseFloat(padding.paddingTop) - Math.min(...bounds.map((b) => b.top)),
    ),
  }
}

function onBarMove(e: PointerEvent) {
  if (!magnify.value) return
  pointerX = e.clientX
  if (!frame) frame = requestAnimationFrame(layout)
}
function onBarLeave() {
  hovering.value = false
  cancelAnimationFrame(frame)
  frame = 0
  fx.value = []
  growth.value = { left: 0, right: 0, top: 0 }
  if (visibility.value === 'auto-hide') {
    clearTimeout(leaveTimer)
    leaveTimer = setTimeout(() => (nearBottom.value = false), 450)
  }
}
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <div
    class="m-dock-zone"
    :class="{ 'is-shown': shown, 'is-always': visibility === 'always' && items.length > 0 }"
  >
    <div
      ref="bar"
      class="m-dock"
      :class="[
        `m-dock--${store.settings.dock.hover}`,
        { 'is-magnify': magnify, 'is-empty': !items.length },
      ]"
      role="toolbar"
      :aria-label="m.dock.label"
      :aria-hidden="!shown"
      :inert="!shown"
      data-drop-container="dock"
      @pointerenter="hovering = true"
      @pointermove="onBarMove"
      @pointerleave="onBarLeave"
      @contextmenu.self="actions.openMenu($event, actions.dockMenu())"
    >
      <div
        class="m-dock__surface m-glass"
        aria-hidden="true"
        :style="{
          left: `${magnify ? -growth.left : 0}px`,
          right: `${magnify ? -growth.right : 0}px`,
          top: `${magnify ? -growth.top : 0}px`,
        }"
        @contextmenu="actions.openMenu($event, actions.dockMenu())"
      />
      <TransitionGroup name="m-dock-item">
        <div
          v-for="(id, i) in items"
          :key="id"
          class="m-dock__slot"
          :style="fx[i] ? { '--scale': fx[i].s, '--shift': `${fx[i].x.toFixed(2)}px` } : undefined"
        >
          <Tile :id="id" :container="{ kind: 'dock' }" variant="dock" />
        </div>
      </TransitionGroup>
      <p v-if="!items.length" class="m-dock__empty">{{ m.items.dockEmpty }}</p>
    </div>
  </div>
</template>

<style scoped>
.m-dock-zone {
  position: fixed;
  left: 50%;
  bottom: 14px;
  z-index: 40;
  max-width: calc(100vw - 32px);
  translate: -50% calc(100% + 24px);
  opacity: 0;
  pointer-events: none;
  transition:
    translate 0.42s var(--motion-ease),
    opacity 0.3s ease;
}
.m-dock-zone.is-shown {
  translate: -50% 0;
  opacity: 1;
  pointer-events: auto;
}
.m-dock {
  position: relative;
  isolation: isolate;
  --icon-size: min(var(--dock-icon, 52px), 52px);
  --icon-radius: var(--dock-radius, 13px);
  display: flex;
  align-items: flex-end;
  gap: 10px;
  min-height: calc(var(--icon-size) + 20px);
  max-width: 100%;
  padding: 10px 14px;
  overflow-x: auto;
  overflow-y: visible;
  border-radius: 26px;
  scrollbar-width: none;
}
.m-dock__surface {
  position: absolute;
  bottom: 0;
  z-index: -1;
  border-radius: inherit;
  transition:
    left 0.09s linear,
    right 0.09s linear,
    top 0.09s linear;
}
.m-dock:not(:hover) .m-dock__surface {
  transition:
    left 0.28s var(--motion-ease),
    right 0.28s var(--motion-ease),
    top 0.28s var(--motion-ease);
}
.m-dock.is-magnify {
  overflow: visible;
}
.m-dock__slot {
  flex: none;
  width: var(--icon-size);
}
.m-dock__slot :deep(.m-tile) {
  width: 100%;
}
.m-dock__slot :deep(.m-tile__icon) {
  transform-origin: bottom center;
  transition: transform 0.28s var(--motion-ease);
}
.m-dock.is-magnify .m-dock__slot :deep(.m-tile__icon) {
  transform: translateX(var(--shift, 0px)) scale(var(--scale, 1));
  /* 跟随指针时只做很短的平滑，离开时缓慢复原 */
  transition: transform 0.09s linear;
}
.m-dock.is-magnify:not(:hover) .m-dock__slot :deep(.m-tile__icon) {
  transition: transform 0.28s var(--motion-ease);
}
.m-dock__slot:has(.m-tile:hover) {
  position: relative;
  z-index: 1;
}
.m-dock--magnify:not(.is-magnify) .m-dock__slot :deep(.m-tile:hover .m-tile__icon) {
  transform: none;
}
.m-dock--lift .m-dock__slot :deep(.m-tile:hover .m-tile__icon) {
  transform: translateY(-8px);
}
.m-dock__empty {
  margin: 0;
  padding: 0 12px;
  align-self: center;
  color: var(--muted);
  font-size: 12.5px;
  white-space: nowrap;
}
.m-dock-item-move {
  transition: transform 0.3s var(--motion-ease);
}
@media (prefers-reduced-motion: reduce) {
  .m-dock-zone,
  .m-dock__slot,
  .m-dock__surface,
  .m-dock__slot :deep(.m-tile__icon),
  .m-dock-item-move {
    transition: none;
  }
}
</style>
