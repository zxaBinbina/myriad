<script setup lang="ts">
import { formatCombo } from '@myriad/core'
import { PanelLeftClose, PanelLeftOpen, Plus } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import { useActions } from '../state/actions'
import { useDrag } from '../state/drag'
import { useStore } from '../state/store'
import GroupIcon from './base/GroupIcon.vue'

const store = useStore()
const actions = useActions()
const drag = useDrag()
const { m, t } = useI18n()

const side = computed(() => store.settings.layout.groupPosition === 'side')
const collapsed = computed(() => side.value && store.settings.layout.sidebarCollapsed)
const root = ref<HTMLElement | null>(null)
const thumb = ref({ x: 0, y: 0, w: 0, h: 0, ready: false })
const animated = ref(false)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement[] | null>(null)

function measure() {
  const el = root.value?.querySelector<HTMLElement>('[aria-selected="true"]')
  if (!el) return
  thumb.value = {
    x: el.offsetLeft,
    y: el.offsetTop,
    w: el.offsetWidth,
    h: el.offsetHeight,
    ready: true,
  }
  // 选中项滚动到列表可见区域（只滚动列表本身，不滚动页面）
  const list = root.value!
  if (side.value) {
    const top = el.offsetTop
    const bottom = top + el.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top - 8
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight + 8
  } else {
    const left = el.offsetLeft
    const right = left + el.offsetWidth
    if (left < list.scrollLeft) list.scrollLeft = left - 8
    else if (right > list.scrollLeft + list.clientWidth)
      list.scrollLeft = right - list.clientWidth + 8
  }
}

let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(measure)
  if (root.value) ro.observe(root.value)
  measure()
  requestAnimationFrame(() => (animated.value = true))
})
onBeforeUnmount(() => ro?.disconnect())
watch(
  () => [
    store.activeGroup.value.id,
    store.data.groups.map((g) => g.name).join('\n'),
    side.value,
    collapsed.value,
  ],
  () => nextTick(measure),
)

watch(
  () => store.ui.renamingGroup,
  (id) => {
    if (!id) return
    renameValue.value = store.data.groups.find((g) => g.id === id)?.name ?? ''
    nextTick(() => {
      const input = renameInput.value?.[0]
      input?.focus()
      input?.select()
    })
  },
)

function commitRename() {
  const id = store.ui.renamingGroup
  const g = store.data.groups.find((x) => x.id === id)
  if (g && renameValue.value.trim()) g.name = renameValue.value.trim()
  store.ui.renamingGroup = null
  nextTick(measure)
}

function onKey(e: KeyboardEvent) {
  const prev = side.value ? 'ArrowUp' : 'ArrowLeft'
  const next = side.value ? 'ArrowDown' : 'ArrowRight'
  if (e.key !== prev && e.key !== next && e.key !== 'Home' && e.key !== 'End') return
  if ((e.target as HTMLElement).tagName === 'INPUT') return
  e.preventDefault()
  if (e.key === 'Home') store.switchGroup(0)
  else if (e.key === 'End') store.switchGroup(store.data.groups.length - 1)
  else store.stepGroup(e.key === next ? 1 : -1)
  nextTick(() => root.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
}

function hintFor(index: number) {
  if (!store.settings.shortcuts.showHints || !store.settings.shortcuts.digitGroups || index > 8)
    return undefined
  return formatCombo(`Alt+${index + 1}`)
}
</script>

<template>
  <nav
    class="m-groups"
    :class="side ? ['m-groups--side', 'm-glass', { 'is-collapsed': collapsed }] : 'm-groups--top'"
    :aria-label="m.groups.nav"
  >
    <div
      ref="root"
      class="m-groups__list"
      :class="{ 'is-animated': animated && !store.reducedMotion.value }"
      role="tablist"
      :aria-orientation="side ? 'vertical' : 'horizontal'"
      @keydown="onKey"
    >
      <span
        v-show="thumb.ready"
        class="m-groups__thumb"
        aria-hidden="true"
        :style="{
          transform: `translate(${thumb.x}px, ${thumb.y}px)`,
          width: `${thumb.w}px`,
          height: `${thumb.h}px`,
        }"
      />
      <template v-for="(g, i) in store.data.groups" :key="g.id">
        <input
          v-if="store.ui.renamingGroup === g.id"
          ref="renameInput"
          v-model="renameValue"
          class="m-groups__rename"
          :aria-label="m.groups.rename"
          maxlength="24"
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent="store.ui.renamingGroup = null"
          @blur="commitRename"
        />
        <button
          v-else
          type="button"
          class="m-groups__tab"
          role="tab"
          :aria-selected="g.id === store.activeGroup.value.id"
          :tabindex="g.id === store.activeGroup.value.id ? 0 : -1"
          :class="{ 'is-drop': drag.state.hoverGroup === g.id }"
          :data-drop-group="g.id"
          :title="hintFor(i) ? t('hint.pressFor', { key: hintFor(i)!, action: g.name }) : g.name"
          @click="store.switchGroup(g.id)"
          @dblclick="store.ui.renamingGroup = g.id"
          @contextmenu="actions.openMenu($event, actions.groupMenu(g.id))"
        >
          <GroupIcon v-if="side" :name="g.icon" :size="18" />
          <span class="m-groups__name">{{ g.name }}</span>
        </button>
      </template>
    </div>
    <div class="m-groups__tools">
      <button
        type="button"
        class="m-icon-btn m-icon-btn--small"
        :title="m.groups.add"
        :aria-label="m.groups.add"
        @click="actions.createGroup()"
      >
        <Plus :size="16" />
      </button>
      <button
        v-if="side"
        type="button"
        class="m-icon-btn m-icon-btn--small"
        :title="collapsed ? m.groups.expand : m.groups.collapse"
        :aria-label="collapsed ? m.groups.expand : m.groups.collapse"
        @click="store.settings.layout.sidebarCollapsed = !collapsed"
      >
        <PanelLeftOpen v-if="collapsed" :size="16" />
        <PanelLeftClose v-else :size="16" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.m-groups {
  display: flex;
  align-items: center;
  min-width: 0;
}
.m-groups__list {
  position: relative;
  display: flex;
  min-width: 0;
  isolation: isolate;
}
.m-groups__thumb {
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
  border-radius: 999px;
  background: var(--seg-selected-bg);
  box-shadow:
    inset 0 0 0 1px var(--seg-selected-border),
    0 3px 8px rgb(0 0 0 / 12%);
  pointer-events: none;
}
.m-groups__list.is-animated .m-groups__thumb {
  transition:
    transform 0.32s var(--motion-ease),
    width 0.32s var(--motion-ease),
    height 0.32s var(--motion-ease);
}
.m-groups__tab {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex: none;
  min-height: 36px;
  padding: 6px 16px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}
.m-groups__tab:hover {
  background: color-mix(in srgb, var(--text) 5%, transparent);
}
.m-groups__tab[aria-selected='true'] {
  font-weight: 650;
}
.m-groups__tab.is-drop {
  box-shadow: inset 0 0 0 2px var(--blue);
}
.m-groups__rename {
  width: 120px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--blue);
  border-radius: 999px;
  background: var(--panel);
  color: var(--text);
  font-size: 13px;
  outline: none;
}
.m-groups__tools {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* 顶部胶囊 */
.m-groups--top {
  gap: 6px;
  max-width: 100%;
  margin: 0 auto;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: color-mix(in srgb, var(--panel) 72%, transparent);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
}
.m-groups--top .m-groups__list {
  overflow-x: auto;
  scrollbar-width: none;
}
.m-groups--top .m-groups__list::-webkit-scrollbar {
  display: none;
}

/* 左侧竖向侧栏 */
.m-groups--side {
  position: fixed;
  top: 50%;
  left: 18px;
  z-index: 30;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 188px;
  max-height: calc(100vh - 140px);
  padding: 8px;
  border-radius: 24px;
  translate: 0 -50%;
  transition: width 0.32s var(--motion-ease);
}
.m-groups--side .m-groups__list {
  flex-direction: column;
  overflow-y: auto;
  scrollbar-width: none;
}
.m-groups--side .m-groups__tab {
  justify-content: flex-start;
  min-height: 42px;
  padding: 8px 14px;
  border-radius: 16px;
}
.m-groups--side .m-groups__thumb {
  border-radius: 16px;
}
.m-groups--side .m-groups__rename {
  width: 100%;
  border-radius: 16px;
}
.m-groups--side .m-groups__tools {
  justify-content: space-between;
  padding: 4px 2px 0;
  border-top: 1px solid var(--border);
}
.m-groups--side.is-collapsed {
  width: 62px;
}
.m-groups--side.is-collapsed .m-groups__tab {
  justify-content: center;
  padding: 8px;
}
.m-groups--side.is-collapsed .m-groups__name {
  display: none;
}
.m-groups--side.is-collapsed .m-groups__tools {
  flex-direction: column;
}
@media (prefers-reduced-motion: reduce) {
  .m-groups--side {
    transition: none;
  }
}
</style>
