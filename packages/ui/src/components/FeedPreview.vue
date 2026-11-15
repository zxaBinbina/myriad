<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ExternalLink, Pause, Play, Bookmark } from '@lucide/vue'
import { feedConfig, type ReaderArticle } from '@zxabinbina/myriad-core'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import { loadReader, loadSummary, toggleFeedFavorite } from '../state/feeds'
import { widgetBase } from '../state/widgetRequests'
import type { PreviewSession } from '../platform'
import MDialog from './base/MDialog.vue'
import ReaderContent from './ReaderContent.vue'
const store = useStore(),
  { m } = useI18n()
const preview = computed(() => store.ui.feedPreview),
  entry = computed(() => preview.value?.entry)
const item = computed(() => {
  const it = preview.value && store.data.items[preview.value.itemId]
  return it?.type === 'widget' ? it : null
})
const cfg = computed(() => feedConfig(item.value?.config))
const article = ref<ReaderArticle>(),
  summary = ref(''),
  summaryError = ref(''),
  loading = ref(false),
  frameUrl = ref(''),
  readerMode = ref(true),
  frame = ref<HTMLIFrameElement | null>(null),
  reading = ref<HTMLElement | null>(null),
  paused = ref(false),
  unavailable = ref(false)
const saved = computed(() => cfg.value.favorites.some((e) => e.id === entry.value?.id)),
  hovered = ref(false),
  mediaPlaying = ref(false)
let ctrl = new AbortController(),
  generation = 0,
  session: PreviewSession | null = null,
  raf = 0,
  last = 0
function stop() {
  generation++
  ctrl.abort()
  ctrl = new AbortController()
  cancelAnimationFrame(raf)
  last = 0
  const current = session
  session = null
  void current?.close().catch(() => {})
}
function scroll(time: number) {
  if (
    !paused.value &&
    !hovered.value &&
    !mediaPlaying.value &&
    !store.reducedMotion.value &&
    document.visibilityState === 'visible' &&
    readerMode.value &&
    reading.value
  ) {
    if (!last) last = time
    if (time - last >= 50) {
      reading.value.scrollTop += Math.min(4, (time - last) * 0.02)
      last = time
    }
  } else last = 0
  raf = requestAnimationFrame(scroll)
}
async function load() {
  stop()
  article.value = undefined
  summary.value = ''
  summaryError.value = ''
  frameUrl.value = ''
  readerMode.value = true
  unavailable.value = false
  paused.value = !cfg.value.autoScroll
  const target = preview.value
  if (!target) return
  const token = generation,
    signal = ctrl.signal
  loading.value = true
  if (target.ready) {
    const ready = await target.ready
    if (token !== generation) {
      void ready?.close().catch(() => {})
      return
    }
    session = ready
    if (ready) {
      frameUrl.value = target.entry.url
      readerMode.value = false
    }
  }
  const base = widgetBase(store, 'auto')
  try {
    const value = await loadReader(store, target.entry.url, signal)
    if (token === generation) {
      article.value = value
      unavailable.value = !value
    }
  } catch {
    if (token === generation && !signal.aborted) unavailable.value = true
  } finally {
    if (token === generation) loading.value = false
  }
  if (token !== generation) return
  raf = requestAnimationFrame(scroll)
  if (cfg.value.aiSummary && base && !store.platform.guest) {
    try {
      const result = await loadSummary(store, target.entry.url, signal)
      if (token === generation) summary.value = result.summary
    } catch {
      if (token === generation && !signal.aborted)
        summaryError.value = m.value.feeds.summaryUnavailable
    }
  }
}
function close() {
  store.ui.feedPreview = null
}
function original() {
  if (entry.value) store.openUrl(entry.value.url)
  close()
}
async function frameLoaded() {
  try {
    await session?.scroll(!paused.value && !store.reducedMotion.value)
  } catch {
    readerMode.value = true
    unavailable.value = !(article.value?.blocks?.length || article.value?.paragraphs.length)
  }
}
function onMessage(e: MessageEvent) {
  if (
    e.source === frame.value?.contentWindow &&
    entry.value &&
    e.origin === new URL(entry.value.url).origin &&
    e.data?.type === 'myriad-preview-open' &&
    e.data.url === entry.value.url
  )
    original()
}
function visibility() {
  if (document.visibilityState !== 'visible') {
    stop()
    frameUrl.value = ''
  } else if (preview.value) void load()
}
watch(preview, () => void load())
watch(
  [paused, store.reducedMotion],
  () => void session?.scroll(!paused.value && !store.reducedMotion.value).catch(() => {}),
)
window.addEventListener('message', onMessage)
document.addEventListener('visibilitychange', visibility)
onBeforeUnmount(() => {
  stop()
  window.removeEventListener('message', onMessage)
  document.removeEventListener('visibilitychange', visibility)
})
</script>
<template>
  <MDialog :open="!!entry" :title="entry?.title || m.feeds.preview" width="900px" @close="close">
    <template #title>
      <button type="button" class="m-preview__title" @click="original">
        {{ entry?.title || m.feeds.preview }}
      </button>
    </template>
    <template v-if="entry">
      <div class="m-preview__bar">
        <a
          :href="entry.url"
          :target="store.settings.openIn === 'new' ? '_blank' : undefined"
          rel="noopener noreferrer"
          >{{ m.feeds.original }} <ExternalLink :size="14" /></a
        ><button
          v-if="item && cfg.favoritesEnabled"
          type="button"
          class="m-icon-btn"
          :aria-label="saved ? m.feeds.unsave : m.feeds.save"
          :aria-pressed="saved"
          @click="toggleFeedFavorite(item, entry)"
        >
          <Bookmark :size="16" :fill="saved ? 'currentColor' : 'none'" /></button
        ><button
          type="button"
          class="m-icon-btn"
          :aria-label="paused ? m.feeds.play : m.feeds.pause"
          :aria-pressed="paused"
          @click="paused = !paused"
        >
          <Play v-if="paused" :size="16" /><Pause v-else :size="16" /></button
        ><button
          v-if="frameUrl"
          type="button"
          class="m-btn m-btn--small"
          @click="readerMode = !readerMode"
        >
          {{ readerMode ? m.feeds.webPreview : m.feeds.reader }}
        </button>
      </div>
      <aside v-if="summary || summaryError" class="m-preview__summary" aria-live="polite">
        <strong>{{ m.feeds.summary }}</strong>
        <p>{{ summary || summaryError }}</p>
      </aside>
      <p v-if="loading" role="status" class="m-preview__hint">{{ m.common.loading }}</p>
      <iframe
        v-if="frameUrl && !readerMode"
        ref="frame"
        class="m-preview__frame"
        :src="frameUrl"
        :title="entry.title"
        sandbox="allow-scripts allow-same-origin"
        referrerpolicy="no-referrer"
        @load="frameLoaded"
      />
      <div
        v-else
        ref="reading"
        class="m-preview__reader"
        @mouseenter="hovered = true"
        @mouseleave="hovered = false"
        @click="original"
      >
        <p v-if="article?.description || entry.description" class="m-preview__lead">
          {{ article?.description || entry.description }}
        </p>
        <ReaderContent :article="article" @playing="mediaPlaying = $event" />
        <p
          v-if="
            unavailable || (!loading && !(article?.blocks?.length || article?.paragraphs.length))
          "
          class="m-preview__hint"
        >
          {{ m.feeds.readerUnavailable }}
        </p>
      </div>
      <p class="m-preview__hint">{{ m.feeds.previewHint }}</p>
    </template>
  </MDialog>
</template>
<style scoped>
.m-preview__title {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}
.m-preview__title:hover {
  color: var(--blue);
}
.m-preview__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}
.m-preview__bar a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--blue);
  font-size: 13px;
  margin-right: auto;
}
.m-preview__frame {
  width: 100%;
  height: 52vh;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg);
}
.m-preview__reader {
  max-height: 52vh;
  overflow: auto;
  overscroll-behavior: contain;
  font-size: 15px;
  line-height: 1.9;
  padding: 8px 10px;
  cursor: pointer;
}
.m-preview__reader p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.m-preview__lead {
  color: var(--muted);
}
.m-preview__summary {
  background: color-mix(in srgb, var(--blue) 8%, var(--panel));
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px;
  font-size: 13px;
  line-height: 1.7;
  margin-bottom: 12px;
}
.m-preview__summary strong {
  color: var(--blue);
}
.m-preview__summary p {
  margin: 5px 0 0;
  white-space: pre-wrap;
}
.m-preview__hint {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
}
</style>
