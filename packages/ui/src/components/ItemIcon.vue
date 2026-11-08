<script setup lang="ts">
import {
  faviconUrl,
  hostnameOf,
  type IconSpec,
  iconSlugCandidates,
  type LibraryIcon,
  MIN_FAVICON_SIZE,
  readableOn,
  textIconColor,
  textIconLabel,
} from '@myriad/core'
import { computed, ref, watch } from 'vue'
import { brandToIcon, matchBrand } from '../icons/library'
import { useStore } from '../state/store'
import { useSync } from '../state/sync'

const props = defineProps<{ title: string; url?: string; icon: IconSpec }>()
const store = useStore()
const sync = useSync()

/** 图标缓存有效期：网站图标 7 天后重新确认，失败结果 3 天后重试 */
const FAVICON_TTL = 7 * 86400000
const FALLBACK_TTL = 3 * 86400000

type Mode = 'favicon' | 'library' | 'image' | 'text'
const mode = ref<Mode>('text')
const library = ref<LibraryIcon | null>(null)
const faviconReady = ref(false)

const host = computed(() => (props.url ? hostnameOf(props.url) : ''))
const favicon = computed(() =>
  props.url ? faviconUrl(props.url, store.settings.icons, 128, sync.iconProxyBase.value) : null,
)

async function fallback(lowRes = false) {
  // 图标代理 / favicon 失败或分辨率太低 → 图标库自动匹配 → 文字图标
  const brand = props.url
    ? await matchBrand(iconSlugCandidates(props.url, props.title)).catch(() => null)
    : null
  if (props.icon.source !== 'auto') {
    if (lowRes) faviconReady.value = true
    else mode.value = 'text'
    return
  }
  if (brand) {
    library.value = brandToIcon(brand)
    mode.value = 'library'
    if (host.value)
      store.local.iconCache[host.value] = { kind: 'library', icon: library.value, at: Date.now() }
  } else if (lowRes) {
    // 没有更好的选择时，低分辨率的网站图标仍比文字图标好
    faviconReady.value = true
    if (host.value)
      store.local.iconCache[host.value] = { kind: 'favicon', at: Date.now(), lowRes: true }
  } else {
    mode.value = 'text'
    if (host.value) store.local.iconCache[host.value] = { kind: 'text', at: Date.now() }
  }
}

function resolve() {
  faviconReady.value = false
  const spec = props.icon
  switch (spec.source) {
    case 'image':
      mode.value = spec.image ? 'image' : 'text'
      return
    case 'library':
      library.value = spec.library ?? null
      mode.value = spec.library ? 'library' : 'text'
      return
    case 'text':
      mode.value = 'text'
      return
    case 'favicon':
      mode.value = favicon.value ? 'favicon' : 'text'
      return
  }
  // auto
  const cached = host.value ? store.local.iconCache[host.value] : undefined
  const age = cached ? Date.now() - cached.at : Infinity
  if (cached?.kind === 'library' && age < FALLBACK_TTL) {
    library.value = cached.icon
    mode.value = 'library'
  } else if (cached?.kind === 'text' && age < FALLBACK_TTL) {
    mode.value = 'text'
  } else if (favicon.value) {
    mode.value = 'favicon'
  } else {
    void fallback()
  }
}

watch(
  () => [props.icon, props.url, store.settings.icons.faviconProvider, sync.iconProxyBase.value],
  resolve,
  {
    immediate: true,
    deep: true,
  },
)

function onFaviconLoad(e: Event) {
  const img = e.target as HTMLImageElement
  const cached = host.value ? store.local.iconCache[host.value] : undefined
  const knownLowRes =
    cached?.kind === 'favicon' && cached.lowRes && Date.now() - cached.at < FAVICON_TTL
  if (img.naturalWidth < MIN_FAVICON_SIZE && !knownLowRes) {
    void fallback(true)
    return
  }
  faviconReady.value = true
  if (props.icon.source === 'auto' && host.value) {
    if (cached?.kind !== 'favicon' || Date.now() - cached.at > FAVICON_TTL) {
      store.local.iconCache[host.value] = { kind: 'favicon', at: Date.now() }
    }
  }
}

function onImageError() {
  if (mode.value === 'favicon') void fallback()
  else mode.value = 'text'
}

const label = computed(() => props.icon.text?.label || textIconLabel(props.title))
const textBg = computed(
  () => `#${props.icon.text?.background || textIconColor(props.title || props.url || '')}`,
)

const libraryStyle = computed(() => {
  const icon = library.value
  if (!icon) return {}
  if (icon.set === 'simple-icons') {
    const bg = `#${icon.background || icon.color || '4ea4ef'}`
    return {
      background: bg,
      color: icon.background ? `#${icon.color || 'ffffff'}` : readableOn(bg),
    }
  }
  return {
    background: icon.background ? `#${icon.background}` : undefined,
    color: icon.color ? `#${icon.color}` : undefined,
  }
})
</script>

<template>
  <span class="m-item-icon" :class="`is-${mode}`" aria-hidden="true">
    <template v-if="mode === 'favicon' && favicon">
      <span
        v-if="!faviconReady"
        class="m-item-icon__text m-item-icon__placeholder"
        :style="{ background: textBg }"
        >{{ label }}</span
      >
      <img
        :src="favicon"
        alt=""
        draggable="false"
        referrerpolicy="no-referrer"
        :class="{ 'is-ready': faviconReady }"
        @load="onFaviconLoad"
        @error="onImageError"
      />
    </template>
    <img
      v-else-if="mode === 'image'"
      :src="icon.image"
      alt=""
      draggable="false"
      class="is-cover"
      @error="onImageError"
    />
    <span
      v-else-if="mode === 'library' && library"
      class="m-item-icon__lib"
      :class="`is-${library.set}`"
      :style="libraryStyle"
    >
      <svg v-if="library.set === 'simple-icons'" viewBox="0 0 24 24" fill="currentColor">
        <path :d="library.path" />
      </svg>
      <svg
        v-else
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <component
          :is="node[0]"
          v-for="(node, i) in library.nodes ?? []"
          :key="i"
          v-bind="node[1]"
        />
      </svg>
    </span>
    <span
      v-else
      class="m-item-icon__text"
      :style="{ background: textBg, color: readableOn(textBg) }"
      >{{ label }}</span
    >
  </span>
</template>

<style scoped>
.m-item-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
  background: var(--panel);
}
.m-item-icon.is-favicon {
  background: color-mix(in srgb, #fff 94%, var(--panel));
}
.m-item-icon img {
  width: 62%;
  height: 62%;
  object-fit: contain;
  opacity: 0;
  transition: opacity 0.25s ease;
}
.m-item-icon img.is-ready,
.m-item-icon img.is-cover {
  opacity: 1;
}
.m-item-icon img.is-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.m-item-icon__placeholder {
  position: absolute;
  inset: 0;
}
.m-item-icon__text {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #fff;
  font-size: calc(var(--tile-icon, 64px) * 0.42);
  font-weight: 700;
  line-height: 1;
}
.m-item-icon__lib {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--blue);
  background: var(--project-icon-surface);
}
.m-item-icon__lib svg {
  width: 56%;
  height: 56%;
}
.m-item-icon__lib.is-lucide svg {
  width: 52%;
  height: 52%;
}
</style>
