<script setup lang="ts">
import { X } from '@lucide/vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import Tile from './Tile.vue'

const store = useStore()
const { m, t } = useI18n()

const folder = computed(() => {
  const it = store.ui.openFolder ? store.data.items[store.ui.openFolder] : undefined
  return it?.type === 'folder' ? it : null
})
const title = ref('')
const panel = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null

watch(
  folder,
  (f, old) => {
    if (f && f.id !== old?.id) {
      title.value = f.title
      returnFocus = document.activeElement as HTMLElement | null
      nextTick(() => panel.value?.focus())
    }
    if (!f && old) returnFocus?.focus?.()
  },
  { immediate: true },
)
// 文件夹被解散（只剩一个或被删除）时自动关闭
watch(
  () => store.ui.openFolder && !store.data.items[store.ui.openFolder],
  (gone) => gone && (store.ui.openFolder = null),
)

function commitTitle() {
  if (folder.value && title.value.trim()) folder.value.title = title.value.trim()
  else if (folder.value) title.value = folder.value.title
}

function close() {
  commitTitle()
  store.ui.openFolder = null
}
</script>

<template>
  <Transition name="m-folder">
    <div v-if="folder" class="m-folder-layer" @pointerdown.self="close" @keydown.esc.stop="close">
      <section
        ref="panel"
        class="m-folder m-glass"
        role="dialog"
        aria-modal="true"
        :aria-label="folder.title"
        tabindex="-1"
        data-folder-panel
      >
        <header class="m-folder__head">
          <input
            v-model="title"
            class="m-folder__title"
            :aria-label="m.items.renameFolder"
            maxlength="32"
            @blur="commitTitle"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
          <span class="m-folder__count">{{
            t('items.folderItems', { n: folder.children.length })
          }}</span>
          <button
            type="button"
            class="m-icon-btn m-icon-btn--small"
            :aria-label="m.common.close"
            @click="close"
          >
            <X :size="18" />
          </button>
        </header>
        <TransitionGroup
          tag="div"
          class="m-folder__grid"
          name="m-tile"
          :data-drop-container="`folder:${folder.id}`"
        >
          <Tile
            v-for="id in folder.children"
            :id="id"
            :key="id"
            :container="{ kind: 'folder', id: folder.id }"
            variant="folder"
          />
        </TransitionGroup>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.m-folder-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(5 6 12 / 32%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
:global(.myriad-dragging .m-folder-layer) {
  background: transparent;
  backdrop-filter: none;
}
.m-folder {
  width: min(calc(var(--cell-w) * 5 + 48px), calc(100vw - 48px));
  max-height: min(560px, calc(100vh - 80px));
  overflow: auto;
  padding: 18px 20px 20px;
  border-radius: 28px;
  outline: none;
}
.m-folder__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.m-folder__title {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--text);
  font-size: 18px;
  font-weight: 650;
}
.m-folder__title:hover {
  border-color: var(--border);
}
.m-folder__title:focus {
  outline: none;
  border-color: var(--blue);
  background: var(--panel);
}
.m-folder__count {
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.m-folder__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--cell-w));
  grid-auto-rows: var(--cell-h);
  justify-content: center;
  min-height: var(--cell-h);
}
.m-folder-enter-active,
.m-folder-leave-active {
  transition: opacity 0.24s ease;
}
.m-folder-enter-active .m-folder,
.m-folder-leave-active .m-folder {
  transition:
    transform 0.34s var(--motion-ease),
    opacity 0.24s ease;
}
.m-folder-enter-from,
.m-folder-leave-to {
  opacity: 0;
}
.m-folder-enter-from .m-folder,
.m-folder-leave-to .m-folder {
  transform: scale(0.9);
  opacity: 0;
}
.m-tile-move {
  transition: transform 0.32s var(--motion-ease);
}
@media (prefers-reduced-motion: reduce) {
  .m-folder-enter-active,
  .m-folder-leave-active,
  .m-folder-enter-active .m-folder,
  .m-folder-leave-active .m-folder,
  .m-tile-move {
    transition: none;
  }
}
</style>
