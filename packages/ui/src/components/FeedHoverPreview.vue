<script setup lang="ts">
/// <reference path="../interestfor.d.ts" />
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import {
  feedConfig,
  canHoverRead,
  type FeedEntry,
  type ReaderArticle,
  type WidgetItem,
} from '@myriad/core'
import { useStore } from '../state/store'
import { useI18n } from '../i18n'
import { loadReader, loadSummary } from '../state/feeds'
import { widgetBase } from '../state/widgetRequests'
import ReaderContent from './ReaderContent.vue'
const props = defineProps<{ item: WidgetItem; entry: FeedEntry }>()
const emit = defineEmits<{ open: [] }>()
const store = useStore(),
  { m } = useI18n(),
  id = useId()
const cfg = computed(() => feedConfig(props.item.config))
const eligible = computed(() => cfg.value.hoverPreview && canHoverRead(props.entry))
const trigger = ref<HTMLButtonElement>(),
  bubble = ref<HTMLElement>(),
  reading = ref<HTMLElement>()
const article = ref<ReaderArticle>(),
  summary = ref(''),
  loading = ref(false),
  unavailable = ref(false)
const open = ref(false),
  hovered = ref(false),
  mediaPlaying = ref(false)
const anchor = `--feed-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`
let controller: AbortController | undefined,
  generation = 0,
  raf = 0,
  last = 0
let timer: ReturnType<typeof setTimeout> | undefined
const hasPopover =
  typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover')
function stop() {
  generation++
  controller?.abort()
  cancelAnimationFrame(raf)
  last = 0
  loading.value = false
  article.value = undefined
  summary.value = ''
  hovered.value = false
}
function hide() {
  if (hasPopover && bubble.value?.matches(':popover-open')) bubble.value.hidePopover()
  open.value = false
  stop()
}
function position() {
  if (hasPopover && CSS.supports('position-area: block-end')) return
  if (!trigger.value || !bubble.value) return
  const rect = trigger.value.getBoundingClientRect(),
    card = bubble.value.getBoundingClientRect()
  const left = Math.max(8, Math.min(rect.left, innerWidth - card.width - 8))
  const top =
    rect.bottom + card.height + 8 < innerHeight
      ? rect.bottom + 4
      : Math.max(8, rect.top - card.height - 4)
  Object.assign(bubble.value.style, {
    inset: 'auto',
    margin: '0',
    left: `${left}px`,
    top: `${top}px`,
  })
}
function scroll(time: number) {
  if (
    cfg.value.autoScroll &&
    !hovered.value &&
    !mediaPlaying.value &&
    !store.reducedMotion.value &&
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
  const token = generation
  controller = new AbortController()
  const signal = controller.signal
  loading.value = true
  unavailable.value = false
  await nextTick()
  position()
  if (reading.value) reading.value.scrollTop = 0
  raf = requestAnimationFrame(scroll)
  try {
    const value = await loadReader(store, props.entry.url, signal)
    if (token !== generation) return
    article.value = value
    unavailable.value = !value || !(value.blocks?.length || value.paragraphs.length)
  } catch {
    if (token === generation && !signal.aborted) unavailable.value = true
  } finally {
    if (token === generation) loading.value = false
  }
  if (token !== generation || signal.aborted) return
  if (cfg.value.aiSummary && widgetBase(store, 'auto')) {
    try {
      const result = await loadSummary(store, props.entry.url, signal)
      if (token === generation) summary.value = result.summary
    } catch {
      /* Reading remains available without AI. */
    }
  }
}
function toggle(event: Event) {
  open.value = (event as ToggleEvent).newState === 'open'
  if (open.value) void load()
  else stop()
}
function interest(event: Event) {
  if (!eligible.value || document.visibilityState !== 'visible' || store.ui.feedPreview)
    event.preventDefault()
}
// Old browsers without Popover still receive a delayed, dismissible reading bubble.
function fallback(active: boolean) {
  if (hasPopover || !eligible.value) return
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (active) {
      open.value = true
      void load()
    } else hide()
  }, 500)
}
function enterBubble() {
  hovered.value = true
  fallback(true)
}
function leaveBubble() {
  hovered.value = false
  fallback(false)
}
function clicked() {
  hide()
  emit('open')
}
function onScroll(event: Event) {
  if (event.target instanceof Node && bubble.value?.contains(event.target)) return
  hide()
}
function visibility() {
  if (document.visibilityState !== 'visible') hide()
}
function escape(event: KeyboardEvent) {
  if (event.key === 'Escape') hide()
}
watch(
  [eligible, () => props.entry.url, () => store.ui.feedPreview, () => store.local.activeGroup],
  hide,
)
onMounted(async () => {
  trigger.value?.addEventListener('interest', interest)
  bubble.value?.addEventListener('toggle', toggle)
  document.addEventListener('visibilitychange', visibility)
  document.addEventListener('keydown', escape)
  window.addEventListener('resize', position)
  window.addEventListener('scroll', onScroll, true)
  if (hasPopover && !('interestForElement' in HTMLButtonElement.prototype))
    await import('interestfor')
})
onBeforeUnmount(() => {
  hide()
  clearTimeout(timer)
  trigger.value?.removeEventListener('interest', interest)
  bubble.value?.removeEventListener('toggle', toggle)
  document.removeEventListener('visibilitychange', visibility)
  document.removeEventListener('keydown', escape)
  window.removeEventListener('resize', position)
  window.removeEventListener('scroll', onScroll, true)
})
</script>
<template>
  <button
    ref="trigger"
    type="button"
    class="m-feed__title"
    :interestfor="eligible ? id : undefined"
    :aria-describedby="eligible ? id : undefined"
    :style="{ anchorName: anchor }"
    @click="clicked"
    @mouseenter="fallback(true)"
    @mouseleave="fallback(false)"
    @focus="fallback(true)"
    @blur="fallback(false)"
  >
    <slot />
  </button>
  <div
    ref="bubble"
    :id="id"
    :popover="hasPopover ? 'hint' : undefined"
    :hidden="!hasPopover && !open"
    class="m-feed-hover"
    role="tooltip"
    :style="{ positionAnchor: anchor }"
    @mouseenter="enterBubble"
    @mouseleave="leaveBubble"
  >
    <strong>{{ m.feeds.reader }}</strong>
    <p class="m-feed-hover__title">{{ entry.title }}</p>
    <div ref="reading" class="m-feed-hover__reading">
      <p v-if="summary" class="m-feed-hover__summary">{{ summary }}</p>
      <p v-if="article?.description || entry.description" class="m-feed-hover__lead">
        {{ article?.description || entry.description }}
      </p>
      <p v-if="loading" class="m-feed-hover__hint">{{ m.common.loading }}</p>
      <ReaderContent v-if="open" :article="article" @playing="mediaPlaying = $event" />
      <p v-if="unavailable" class="m-feed-hover__hint">{{ m.feeds.readerUnavailable }}</p>
    </div>
    <small class="m-feed-hover__hint">{{ m.feeds.hoverHint }}</small>
  </div>
</template>
<style scoped>
.m-feed__title {
  flex: 1;
  min-width: 0;
  text-align: left;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  line-height: 1.55;
  display: grid;
  gap: 2px;
  interest-delay: 0.5s;
  --interest-delay-start: 0.5s;
  --interest-delay-end: 0.5s;
}
.m-feed__title :deep(span) {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.m-feed__title :deep(small) {
  color: var(--muted);
  font-size: 11px;
}
.m-feed__title:hover {
  color: var(--blue);
}
:global(.is-read .m-feed__title) {
  color: var(--muted);
}
.m-feed-hover {
  position: fixed;
  box-sizing: border-box;
  width: min(380px, calc(100vw - 16px));
  max-height: min(460px, calc(100vh - 16px));
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--panel);
  color: var(--text);
  box-shadow: 0 12px 38px #0003;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.7;
}
@supports (position-area: block-end) {
  .m-feed-hover {
    inset: auto;
    margin: 4px 0;
    position-area: block-end span-inline-end;
    position-try-fallbacks:
      flip-block,
      flip-inline,
      flip-block flip-inline;
  }
}
.m-feed-hover strong {
  font-size: 11px;
  color: var(--blue);
}
.m-feed-hover__title {
  font-weight: 600;
  margin: 4px 0 10px;
}
.m-feed-hover__reading {
  max-height: min(290px, 45vh);
  overflow: auto;
  overscroll-behavior: contain;
}
.m-feed-hover__summary {
  border-left: 2px solid var(--blue);
  padding-left: 10px;
}
.m-feed-hover__lead,
.m-feed-hover__hint {
  color: var(--muted);
}
.m-feed-hover__hint {
  font-size: 11px;
}
</style>
