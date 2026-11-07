<script setup lang="ts">
import { Check, ChevronRight } from '@lucide/vue'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { UI_ICONS } from '../icons/uiIcons'
import type { ContextMenuItem } from '../state/store'
import { useStore } from '../state/store'

const store = useStore()
const menu = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
const sub = ref<{
  index: number
  items: ContextMenuItem[]
  x: number
  y: number
  flip: boolean
} | null>(null)
let returnFocus: HTMLElement | null = null

function close() {
  store.ui.contextMenu = null
}

watch(
  () => store.ui.contextMenu,
  (cm) => {
    sub.value = null
    if (!cm) {
      returnFocus?.focus?.()
      return
    }
    returnFocus = document.activeElement as HTMLElement | null
    pos.value = { x: cm.x, y: cm.y }
    nextTick(() => {
      const el = menu.value
      if (!el) return
      const r = el.getBoundingClientRect()
      pos.value = {
        x: Math.max(8, Math.min(cm.x, innerWidth - r.width - 8)),
        y: Math.max(8, Math.min(cm.y, innerHeight - r.height - 8)),
      }
      el.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    })
  },
)

function run(item: ContextMenuItem, index: number, e: Event) {
  if (item.disabled) return
  if (item.children) {
    openSub(item, index, e.currentTarget as HTMLElement)
    return
  }
  close()
  item.action?.()
}

function openSub(item: ContextMenuItem, index: number, el: HTMLElement) {
  if (!item.children || item.disabled) return
  const r = el.getBoundingClientRect()
  const flip = r.right + 220 > innerWidth
  sub.value = {
    index,
    items: item.children,
    x: flip ? r.left - 4 : r.right + 4,
    y: r.top - 6,
    flip,
  }
}

function onKey(e: KeyboardEvent) {
  if (!store.ui.contextMenu) return
  if (e.key === 'Escape') {
    e.preventDefault()
    if (sub.value) sub.value = null
    else close()
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const scope = (document.activeElement?.closest('.m-menu') as HTMLElement | null) ?? menu.value
    const buttons = Array.from(scope?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])
    const i = buttons.indexOf(document.activeElement as HTMLElement)
    buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
  }
  if (e.key === 'ArrowLeft' && sub.value) {
    sub.value = null
    menu.value?.querySelector<HTMLElement>('[aria-expanded="true"]')?.focus()
  }
}

function onPointerDown(e: PointerEvent) {
  if (!(e.target as HTMLElement).closest('.m-menu')) close()
}

addEventListener('keydown', onKey, true)
addEventListener('pointerdown', onPointerDown, true)
addEventListener('blur', close)
addEventListener('resize', close)
onBeforeUnmount(() => {
  removeEventListener('keydown', onKey, true)
  removeEventListener('pointerdown', onPointerDown, true)
  removeEventListener('blur', close)
  removeEventListener('resize', close)
})

function onSubKey(e: KeyboardEvent, item: ContextMenuItem, index: number) {
  if (e.key === 'ArrowRight' && item.children) {
    e.preventDefault()
    openSub(item, index, e.currentTarget as HTMLElement)
    nextTick(() =>
      document.querySelector<HTMLElement>('.m-menu--sub button:not(:disabled)')?.focus(),
    )
  }
}
</script>

<template>
  <div class="m-menu-host">
    <Transition name="m-menu">
      <div
        v-if="store.ui.contextMenu"
        ref="menu"
        class="m-menu m-glass"
        role="menu"
        :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
        @contextmenu.prevent
      >
        <button
          v-for="(item, i) in store.ui.contextMenu.items"
          :key="i"
          type="button"
          role="menuitem"
          class="m-menu__item"
          :class="{ 'is-danger': item.danger, 'is-open': sub?.index === i }"
          :disabled="item.disabled"
          :aria-haspopup="item.children ? 'menu' : undefined"
          :aria-expanded="item.children ? sub?.index === i : undefined"
          @click="run(item, i, $event)"
          @pointerenter="
            item.children ? openSub(item, i, $event.currentTarget as HTMLElement) : (sub = null)
          "
          @keydown="onSubKey($event, item, i)"
        >
          <component
            :is="UI_ICONS[item.icon ?? '']"
            v-if="item.icon && UI_ICONS[item.icon]"
            :size="16"
          />
          <span v-else class="m-menu__spacer" />
          <span class="m-menu__label">{{ item.label }}</span>
          <ChevronRight v-if="item.children" :size="14" class="m-menu__chev" />
        </button>
      </div>
    </Transition>
    <div
      v-if="store.ui.contextMenu && sub"
      class="m-menu m-menu--sub m-glass"
      role="menu"
      :style="{
        left: `${sub.x}px`,
        top: `${sub.y}px`,
        translate: sub.flip ? '-100% 0' : undefined,
      }"
      @contextmenu.prevent
    >
      <button
        v-for="(item, i) in sub.items"
        :key="i"
        type="button"
        role="menuitemradio"
        class="m-menu__item"
        :aria-checked="!!item.checked"
        :disabled="item.disabled && !item.checked"
        :class="{ 'is-checked': item.checked }"
        @click="!item.disabled && (close(), item.action?.())"
      >
        <Check v-if="item.checked" :size="16" />
        <component
          :is="UI_ICONS[item.icon ?? '']"
          v-else-if="item.icon && UI_ICONS[item.icon]"
          :size="16"
        />
        <span v-else class="m-menu__spacer" />
        <span class="m-menu__label">{{ item.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.m-menu {
  position: fixed;
  z-index: 200;
  display: grid;
  min-width: 200px;
  max-width: 280px;
  max-height: calc(100vh - 16px);
  padding: 6px;
  overflow: auto;
  border-radius: 16px;
  background: color-mix(in srgb, var(--panel) 90%, transparent);
}
.m-menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
}
.m-menu__item:hover:not(:disabled),
.m-menu__item:focus-visible,
.m-menu__item.is-open {
  outline: none;
  background: var(--interactive-hover);
}
.m-menu__item:disabled {
  opacity: 0.45;
  cursor: default;
}
.m-menu__item.is-checked {
  color: var(--blue);
  font-weight: 600;
  opacity: 1;
}
.m-menu__item.is-danger {
  color: var(--status-danger);
}
.m-menu__item svg {
  flex: none;
  color: var(--muted);
}
.m-menu__item.is-danger svg,
.m-menu__item.is-checked svg {
  color: inherit;
}
.m-menu__spacer {
  width: 16px;
  flex: none;
}
.m-menu__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-menu-enter-active {
  transition:
    opacity 0.16s ease,
    scale 0.2s var(--motion-ease);
  transform-origin: top left;
}
.m-menu-enter-from {
  opacity: 0;
  scale: 0.96;
}
@media (prefers-reduced-motion: reduce) {
  .m-menu-enter-active {
    transition: none;
  }
}
</style>
