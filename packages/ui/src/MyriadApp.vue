<script setup lang="ts">
import { formatCombo, matchAny } from '@myriad/core'
import { LayoutDashboard, Plus, Settings } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import BookmarkImport from './components/BookmarkImport.vue'
import Background from './components/Background.vue'
import Clock from './components/Clock.vue'
import ContextMenu from './components/ContextMenu.vue'
import Dashboard from './components/Dashboard.vue'
import Dock from './components/Dock.vue'
import FolderPopup from './components/FolderPopup.vue'
import GroupPager from './components/GroupPager.vue'
import GroupTabs from './components/GroupTabs.vue'
import ItemIcon from './components/ItemIcon.vue'
import Onboarding from './components/Onboarding.vue'
import Overlays from './components/Overlays.vue'
import SearchBox from './components/SearchBox.vue'
import SettingsDrawer from './components/settings/SettingsDrawer.vue'
import ShortcutEditor from './components/ShortcutEditor.vue'
import SyncDialogs from './components/SyncDialogs.vue'
import { createI18n, I18N_KEY } from './i18n'
import type { MyriadPlatform } from './platform'
import { ACTIONS_KEY, createActions } from './state/actions'
import { createDragController, DRAG_KEY } from './state/drag'
import { createStore, STORE_KEY } from './state/store'
import { createSyncController, SYNC_KEY } from './state/sync'

const props = defineProps<{ platform: MyriadPlatform }>()
const emit = defineEmits<{ secret: [] }>()

const store = createStore(props.platform)
const i18n = createI18n(store.lang)
const drag = createDragController(store)
const actions = createActions(store, i18n)
const sync = createSyncController(store)
provide(STORE_KEY, store)
provide(I18N_KEY, i18n)
provide(DRAG_KEY, drag)
provide(ACTIONS_KEY, actions)
provide(SYNC_KEY, sync)

const { m } = i18n
const s = store.settings
const search = ref<InstanceType<typeof SearchBox> | null>(null)
const hasWallpaper = ref(false)

/* ---------------- 尺寸变量 ---------------- */
const cssVars = computed(() => {
  const size = s.icons.size
  const radius =
    s.icons.radius === 'round'
      ? '50%'
      : `${Math.round(size * (s.icons.radius === 'large' ? 0.3 : 0.22))}px`
  const compact = s.layout.density === 'compact'
  const padX = compact ? Math.round(size * 0.22) : Math.round(size * 0.4)
  const labelH = s.icons.showLabels ? 22 : 0
  const gapY = compact ? 14 : 26
  return {
    '--icon-size': `${size}px`,
    '--icon-radius': radius,
    '--label-h': `${labelH}px`,
    '--cell-w': `${size + padX * 2}px`,
    '--cell-h': `${size + labelH + 8 + gapY}px`,
    '--dock-radius':
      s.icons.radius === 'round' ? '50%' : `${s.icons.radius === 'large' ? 16 : 12}px`,
  }
})

/* ---------------- 主题切换过渡 ---------------- */
const root = ref<HTMLElement | null>(null)
let transitionTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => [s.palette, store.resolvedTheme.value],
  () => {
    if (!store.loaded.value || store.reducedMotion.value || !root.value) return
    root.value.classList.add('is-theme-transition')
    clearTimeout(transitionTimer)
    transitionTimer = setTimeout(() => root.value?.classList.remove('is-theme-transition'), 700)
  },
)
watch(
  () => [s.palette, store.resolvedTheme.value] as const,
  ([palette, theme]) => {
    document.documentElement.dataset.myriadPalette = palette
    document.documentElement.dataset.myriadTheme = theme
    document.documentElement.style.colorScheme = theme
  },
  { immediate: true },
)
watch(
  store.lang,
  (lang) => {
    document.documentElement.lang = lang
    if (props.platform.kind === 'extension') document.title = m.value.app.newTab
  },
  { immediate: true },
)

/* ---------------- 全局快捷键 ---------------- */
const modalOpen = computed(
  () =>
    !!(
      store.ui.editor ||
      store.ui.confirm ||
      store.ui.bookmarkImportOpen ||
      store.ui.contextMenu ||
      store.ui.openFolder ||
      store.ui.dashboardOpen ||
      (store.firstRun.value && !store.local.onboarded)
    ),
)

function onKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented || e.isComposing || store.ui.dragging) return
  const b = s.shortcuts.bindings
  const target = e.target as HTMLElement
  const typing = !!target.closest?.(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"]',
  )
  if (matchAny(b.openSettings, e) && !modalOpen.value) {
    e.preventDefault()
    store.ui.settingsOpen = !store.ui.settingsOpen
    return
  }
  if (modalOpen.value || store.ui.settingsOpen || typing) return
  if (matchAny(b.focusSearch, e)) {
    e.preventDefault()
    search.value?.focus(true)
    return
  }
  if (matchAny(b.nextGroup, e)) {
    e.preventDefault()
    store.stepGroup(1)
    return
  }
  if (matchAny(b.prevGroup, e)) {
    e.preventDefault()
    store.stepGroup(-1)
    return
  }
  if (
    s.shortcuts.digitGroups &&
    e.altKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    /^Digit[1-9]$/.test(e.code)
  ) {
    e.preventDefault()
    store.switchGroup(Number(e.code.slice(5)) - 1)
    return
  }
  // 直接打字：把焦点交给搜索框，这次按键会输入到搜索框中
  if (
    s.shortcuts.typeToSearch &&
    e.key.length === 1 &&
    e.key !== ' ' &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey
  ) {
    search.value?.focus()
  }
}

onMounted(async () => {
  addEventListener('keydown', onKeydown)
  await store.load()
  if (props.platform.focusRequested) search.value?.focus()
  void sync.init()
})
onBeforeUnmount(() => {
  removeEventListener('keydown', onKeydown)
  clearTimeout(transitionTimer)
})

const settingsHint = computed(() => {
  const k = s.shortcuts.bindings.openSettings[0]
  return k && s.shortcuts.showHints
    ? `${m.value.settings.open} (${formatCombo(k)})`
    : m.value.settings.open
})

/* 拖动时跟随指针的图标 */
const dragItem = computed(() => (drag.state.id ? store.data.items[drag.state.id] : undefined))
const side = computed(() => s.layout.groupPosition === 'side')

function onRootContextMenu(e: MouseEvent) {
  // 页面空白处（网格之外）同样提供菜单
  const el = e.target as HTMLElement
  if (el.closest('input, textarea, a, button, [data-drop-item], .m-menu, .m-drawer, dialog')) return
  actions.openMenu(e, actions.gridMenu(store.activeGroup.value.id))
}
</script>

<template>
  <div
    ref="root"
    class="myriad"
    :class="{
      'has-wallpaper': hasWallpaper,
      'is-side': side,
      'is-side-collapsed': side && s.layout.sidebarCollapsed,
      'is-loading': !store.loaded.value,
    }"
    :data-palette="s.palette"
    :data-theme="store.resolvedTheme.value"
    :data-density="s.layout.density"
    :data-labels="s.icons.showLabels ? 'on' : 'off'"
    :data-reduced-motion="store.reducedMotion.value ? 'on' : 'off'"
    :style="cssVars"
    @contextmenu="onRootContextMenu"
  >
    <Background @wallpaper="hasWallpaper = $event" />

    <div class="m-toolbar">
      <button
        v-if="s.layout.mode === 'minimal'"
        type="button"
        class="m-icon-btn m-toolbar__btn"
        :title="m.widgets.openDashboard"
        :aria-label="m.widgets.openDashboard"
        @click="store.ui.dashboardOpen = true"
      >
        <LayoutDashboard :size="20" />
      </button>
      <button
        type="button"
        class="m-icon-btn m-toolbar__btn"
        :title="m.items.addShortcut"
        :aria-label="m.items.addShortcut"
        @click="actions.addShortcut({ kind: 'group', id: store.activeGroup.value.id })"
      >
        <Plus :size="20" />
      </button>
      <button
        type="button"
        class="m-icon-btn m-toolbar__btn"
        :title="settingsHint"
        :aria-label="m.settings.open"
        @click="store.ui.settingsOpen = true"
      >
        <Settings :size="20" />
      </button>
    </div>

    <GroupTabs v-if="side && store.loaded.value" />

    <div class="m-shell">
      <header class="m-hero">
        <Clock @secret="emit('secret')" />
        <SearchBox ref="search" />
      </header>
      <GroupTabs v-if="!side && store.loaded.value" class="m-shell__tabs" />
      <main class="m-main" :aria-label="store.activeGroup.value.name">
        <GroupPager v-if="store.loaded.value" />
      </main>
    </div>

    <Dock v-if="store.loaded.value" />
    <FolderPopup />
    <ShortcutEditor />
    <BookmarkImport v-if="store.platform.bookmarks" />
    <Onboarding />
    <Dashboard />
    <SettingsDrawer />
    <ContextMenu />
    <SyncDialogs />
    <Overlays />

    <div
      v-if="dragItem && dragItem.type !== 'widget'"
      class="m-ghost"
      :style="{
        left: `${drag.state.x - drag.state.offsetX}px`,
        top: `${drag.state.y - drag.state.offsetY}px`,
      }"
      aria-hidden="true"
    >
      <span class="m-ghost__icon">
        <ItemIcon
          v-if="dragItem.type === 'shortcut'"
          :title="dragItem.title"
          :url="dragItem.url"
          :icon="dragItem.icon"
        />
        <span v-else class="m-ghost__folder" />
      </span>
    </div>
    <div
      v-else-if="dragItem"
      class="m-ghost m-ghost--widget m-card"
      :style="{
        left: `${drag.state.x - drag.state.offsetX}px`,
        top: `${drag.state.y - drag.state.offsetY}px`,
        width: `${drag.state.width}px`,
        height: `${drag.state.height}px`,
      }"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.myriad {
  isolation: isolate;
}
.myriad.is-loading .m-shell {
  opacity: 0;
}
.m-toolbar {
  position: fixed;
  top: 16px;
  right: 18px;
  z-index: 35;
  display: flex;
  gap: 4px;
}
.m-toolbar__btn {
  color: var(--muted);
  background: color-mix(in srgb, var(--panel) 40%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.myriad.has-wallpaper .m-toolbar__btn {
  color: var(--on-wallpaper);
}
.m-shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 26px;
  width: min(1160px, calc(100% - 80px));
  margin: 0 auto;
  padding: clamp(48px, 11vh, 120px) 0 140px;
  transition: opacity 0.3s ease;
}
.myriad[data-density='compact'] .m-shell {
  gap: 18px;
  padding-top: clamp(32px, 7vh, 80px);
}
.myriad.is-side .m-shell {
  width: min(1160px, calc(100% - 260px));
  margin-left: max(230px, calc((100% - 1160px) / 2));
}
.myriad.is-side-collapsed .m-shell {
  width: min(1160px, calc(100% - 140px));
  margin-left: max(100px, calc((100% - 1160px) / 2));
}
.m-hero {
  display: grid;
  gap: 26px;
}
.m-shell__tabs {
  align-self: center;
  max-width: 100%;
}
.m-main {
  min-width: 0;
}
.m-ghost {
  position: fixed;
  z-index: 500;
  pointer-events: none;
  will-change: left, top;
}
.m-ghost__icon {
  display: block;
  width: var(--icon-size);
  height: var(--icon-size);
  margin-left: calc((var(--cell-w) - var(--icon-size)) / 2);
  overflow: hidden;
  border-radius: var(--icon-radius);
  box-shadow: 0 18px 40px var(--shadow);
  scale: 1.08;
  --tile-icon: var(--icon-size);
}
.m-ghost__folder {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--glass);
  border: 1px solid var(--border);
  border-radius: inherit;
}
.m-ghost--widget {
  opacity: 0.85;
  box-shadow: 0 24px 48px var(--shadow);
}
</style>
