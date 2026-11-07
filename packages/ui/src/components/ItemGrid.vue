<script setup lang="ts">
import type { Group } from '@myriad/core'
import { Plus } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from '../i18n'
import { useActions } from '../state/actions'
import { useStore } from '../state/store'
import Tile from './Tile.vue'

const props = defineProps<{ group: Group }>()
const store = useStore()
const actions = useActions()
const { m } = useI18n()

const container = computed(() => ({ kind: 'group' as const, id: props.group.id }))
const ids = computed(() =>
  store.settings.layout.mode === 'minimal'
    ? props.group.items.filter((id) => store.data.items[id]?.type !== 'widget')
    : props.group.items,
)

function onContextMenu(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('[data-drop-item]')) return
  actions.openMenu(e, actions.gridMenu(props.group.id))
}
</script>

<template>
  <div class="m-grid-wrap" :data-drop-container="`group:${group.id}`" @contextmenu="onContextMenu">
    <TransitionGroup v-if="ids.length" tag="div" class="m-grid" name="m-tile">
      <Tile v-for="id in ids" :id="id" :key="id" :container="container" />
    </TransitionGroup>
    <div v-else class="m-grid-empty">
      <p class="m-grid-empty__title">{{ m.items.emptyGroup }}</p>
      <p class="m-grid-empty__hint">{{ m.items.emptyGroupHint }}</p>
      <button type="button" class="m-btn" @click="actions.addShortcut(container)">
        <Plus :size="16" />{{ m.items.addShortcut }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.m-grid-wrap {
  min-height: calc(var(--cell-h) * 2);
  padding-bottom: 24px;
}
.m-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--cell-w));
  grid-auto-rows: var(--cell-h);
  grid-auto-flow: row dense;
  justify-content: center;
}
.m-grid-empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 48px 16px;
  color: var(--muted);
  text-align: center;
}
.m-grid-empty__title {
  margin: 0;
  color: var(--text);
  font-size: 16px;
  font-weight: 600;
}
.m-grid-empty__hint {
  margin: 0 0 8px;
  font-size: 13px;
}
:global(.myriad.has-wallpaper .m-grid-empty),
:global(.myriad.has-wallpaper .m-grid-empty__title) {
  color: var(--on-wallpaper);
}
.m-tile-move {
  transition: transform 0.32s var(--motion-ease);
}
.m-tile-enter-active {
  transition:
    opacity 0.28s ease,
    scale 0.28s var(--motion-ease);
}
.m-tile-enter-from {
  opacity: 0;
  scale: 0.85;
}
@media (prefers-reduced-motion: reduce) {
  .m-tile-move,
  .m-tile-enter-active {
    transition: none;
  }
}
</style>
