<script setup lang="ts">
import type { ContainerRef, Id } from '@myriad/core'
import { computed } from 'vue'
import { useActions } from '../state/actions'
import { containerKey, useDrag } from '../state/drag'
import { useStore } from '../state/store'
import ItemIcon from './ItemIcon.vue'
import { WIDGETS, widgetSpan } from './widgets/registry'

const props = withDefaults(
  defineProps<{
    id: Id
    container: ContainerRef
    variant?: 'grid' | 'dock' | 'folder'
    axis?: 'x' | 'y'
  }>(),
  { variant: 'grid', axis: 'x' },
)

const store = useStore()
const drag = useDrag()
const actions = useActions()

const item = computed(() => store.data.items[props.id])
const isDragging = computed(() => drag.state.id === props.id)
const isMerge = computed(() => drag.state.mergeTarget === props.id)
const folderPreview = computed(() => {
  const it = item.value
  if (it?.type !== 'folder') return []
  return it.children
    .slice(0, 9)
    .map((c) => store.data.items[c])
    .filter((c) => c?.type === 'shortcut')
})
const span = computed(() => (item.value?.type === 'widget' ? widgetSpan(item.value.size) : null))
const openNew = computed(() => store.settings.openIn === 'new')

function onClick(e: MouseEvent) {
  if (drag.shouldSuppressClick()) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  if (item.value?.type === 'folder') store.ui.openFolder = props.id
}

function onContextMenu(e: MouseEvent) {
  actions.openMenu(e, actions.itemMenu(props.id))
}

const dragAttrs = computed(() => ({
  'data-drop-item': props.id,
  'data-container': containerKey(props.container),
  'data-axis': props.axis,
  onPointerdown: (e: PointerEvent) => drag.onPointerDown(e, props.id),
  onContextmenu: onContextMenu,
}))
</script>

<template>
  <a
    v-if="item?.type === 'shortcut'"
    v-bind="dragAttrs"
    class="m-tile"
    :class="[`m-tile--${variant}`, { 'is-dragging': isDragging, 'is-merge': isMerge }]"
    :href="item.url"
    :target="openNew ? '_blank' : undefined"
    :rel="openNew ? 'noopener noreferrer' : undefined"
    :title="variant === 'dock' ? item.title : undefined"
    draggable="false"
    @click="onClick"
    @dragstart.prevent
  >
    <span class="m-tile__icon">
      <ItemIcon :title="item.title" :url="item.url" :icon="item.icon" />
    </span>
    <span class="m-tile__label">{{ item.title }}</span>
  </a>

  <button
    v-else-if="item?.type === 'folder'"
    v-bind="dragAttrs"
    type="button"
    class="m-tile"
    :class="[`m-tile--${variant}`, { 'is-dragging': isDragging, 'is-merge': isMerge }]"
    :title="variant === 'dock' ? item.title : undefined"
    :aria-label="item.title"
    @click="onClick"
  >
    <span class="m-tile__icon m-tile__folder">
      <span v-for="child in folderPreview" :key="child!.id" class="m-tile__mini">
        <ItemIcon
          v-if="child?.type === 'shortcut'"
          :title="child.title"
          :url="child.url"
          :icon="child.icon"
        />
      </span>
    </span>
    <span class="m-tile__label">{{ item.title }}</span>
  </button>

  <div
    v-else-if="item?.type === 'widget'"
    v-bind="dragAttrs"
    class="m-tile m-tile--widget"
    :class="{ 'is-dragging': isDragging }"
    :style="{ '--span-w': span?.w, '--span-h': span?.h }"
    @click.capture="onClick"
  >
    <div class="m-widget m-card">
      <component :is="WIDGETS[item.kind]?.component" :item="item" />
    </div>
  </div>
</template>

<style scoped>
.m-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: var(--cell-w);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: center;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
  transition: opacity 0.2s ease;
}
.m-tile__icon {
  position: relative;
  display: block;
  flex: none;
  width: var(--icon-size);
  height: var(--icon-size);
  --tile-icon: var(--icon-size);
  border-radius: var(--icon-radius);
  box-shadow:
    0 6px 16px var(--shadow),
    0 0 0 1px var(--border);
  transition:
    transform 0.28s var(--motion-ease),
    box-shadow 0.28s var(--motion-ease);
}
.m-tile:hover .m-tile__icon,
.m-tile:focus-visible .m-tile__icon {
  transform: translateY(-3px);
  box-shadow:
    0 12px 24px var(--shadow),
    0 0 0 1px var(--project-hover-border);
}
.m-tile:focus-visible {
  outline: none;
}
.m-tile:focus-visible .m-tile__icon {
  outline: 2px solid var(--blue);
  outline-offset: 3px;
}
.m-tile__label {
  display: block;
  max-width: 100%;
  height: var(--label-h);
  padding: 0 4px;
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 500;
  line-height: var(--label-h);
  white-space: nowrap;
  text-overflow: ellipsis;
}
:global(.myriad.has-wallpaper .m-tile--grid .m-tile__label) {
  color: var(--on-wallpaper);
  text-shadow: 0 1px 3px rgb(0 0 0 / 35%);
}
:global(.myriad[data-labels='off'] .m-tile--grid .m-tile__label),
.m-tile--dock .m-tile__label {
  display: none;
}

/* 文件夹：九宫格缩略 */
.m-tile__folder {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: max-content;
  align-content: start;
  gap: calc(var(--icon-size) * 0.06);
  padding: calc(var(--icon-size) * 0.12);
  overflow: hidden;
  background: var(--glass);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
}
.m-tile__mini {
  display: block;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: calc(var(--icon-radius) * 0.32);
  --tile-icon: calc(var(--icon-size) * 0.24);
}

/* 拖动状态 */
.m-tile.is-dragging {
  opacity: 0.25;
}
.m-tile.is-merge .m-tile__icon {
  transform: scale(1.12);
  box-shadow:
    0 0 0 3px var(--blue),
    0 12px 28px var(--accent-glow);
}

/* 小组件 */
.m-tile--widget {
  grid-column: span var(--span-w);
  grid-row: span var(--span-h);
  width: auto;
  align-items: stretch;
  padding: 4px calc(var(--cell-pad-x) * 0.4) calc(var(--label-h) * 0.5);
}
.m-widget {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  text-align: left;
  user-select: text;
}

/* Dock 与文件夹面板里的图标 */
.m-tile--dock {
  width: auto;
}
.m-tile--folder {
  width: var(--cell-w);
}
:global(.myriad-dragging .m-tile) {
  cursor: grabbing;
}
@media (prefers-reduced-motion: reduce) {
  .m-tile__icon {
    transition: none;
  }
}
</style>
