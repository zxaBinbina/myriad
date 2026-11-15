<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ArrowLeft, ExternalLink, Search } from '@lucide/vue'
import { resolveEngines, buildSearchUrl, mergeSearchResults, type SearchResult } from '@zxabinbina/myriad-core'
import { useStore } from '../state/store'
import { useI18n } from '../i18n'
import { aggregateEngines, closeAggregate, loadSearch, searchOrigins } from '../state/search'
import { grantSources } from '../state/widgetRequests'
import { PermissionRequired } from '../composables/useVisibleResource'
const store = useStore(),
  { m, lang } = useI18n()
interface SourceState {
  items: SearchResult[]
  next: number | null
  loading: boolean
  error: string
  provider: string
  retryAt: number
}
const states = reactive<Record<string, SourceState>>({}),
  filter = ref(''),
  sentinel = ref<HTMLElement | null>(null)
const ids = computed(() => aggregateEngines(store)),
  engines = computed(() => resolveEngines(store.settings.search, lang.value))
const q = computed(() => store.ui.search?.q || '')
const results = computed(() =>
  mergeSearchResults(
    (filter.value ? [filter.value] : ids.value).flatMap((id) => states[id]?.items || []),
  ),
)
const busy = computed(() => ids.value.some((id) => states[id]?.loading))
const hasMore = computed(() =>
  ids.value.some(
    (id) =>
      (!filter.value || filter.value === id) && states[id]?.next !== null && !states[id]?.error,
  ),
)
const status = computed(() => `${results.value.length} ${m.value.aggregate.results}`)
const name = (id: string) => engines.value.find((e) => e.id === id)?.name || id
const host = (url: string) => new URL(url).hostname
const engineUrl = (id: string) => {
  const e = engines.value.find((e) => e.id === id)
  return e ? buildSearchUrl(e, q.value) : `https://hn.algolia.com/?q=${encodeURIComponent(q.value)}`
}
let generation = 0,
  controller = new AbortController(),
  observer: IntersectionObserver | undefined
function stop() {
  generation++
  controller.abort()
  controller = new AbortController()
  for (const s of Object.values(states)) s.loading = false
}
async function load(id: string) {
  const s = states[id],
    token = generation,
    query = q.value,
    signal = controller.signal
  if (
    !s ||
    s.loading ||
    s.next === null ||
    !query ||
    document.visibilityState !== 'visible' ||
    Date.now() < s.retryAt
  )
    return
  const page = s.next
  s.loading = true
  s.error = ''
  try {
    const data = await loadSearch(store, id, query, page, signal)
    if (token !== generation) return
    s.items = mergeSearchResults([...s.items, ...data.items])
    s.next = data.next
    s.provider = data.provider || ''
    if (data.backoff) s.retryAt = Date.now() + data.backoff * 1000
  } catch (e) {
    if (token === generation && !signal.aborted)
      s.error =
        e instanceof PermissionRequired
          ? 'permission'
          : e instanceof Error && e.message === 'link-only'
            ? 'link'
            : 'failed'
  } finally {
    if (token === generation) s.loading = false
  }
}
function more() {
  for (const id of ids.value)
    if ((!filter.value || filter.value === id) && !states[id]?.error) void load(id)
}
function reset() {
  stop()
  filter.value = ''
  for (const id of Object.keys(states)) delete states[id]
  for (const id of ids.value)
    states[id] = { items: [], next: 0, loading: false, error: '', provider: '', retryAt: 0 }
  more()
}
async function retry(id: string) {
  const permission = grantSources(store, searchOrigins(store, [id]))
  if (await permission) void load(id)
}
function visibility() {
  if (document.visibilityState !== 'visible') stop()
  else more()
}
watch(
  () => [store.ui.search?.nonce, JSON.stringify(store.settings.search.aggregate), lang.value],
  reset,
  { immediate: true },
)
onMounted(() => {
  document.addEventListener('visibilitychange', visibility)
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) more()
    },
    { rootMargin: '200px' },
  )
  if (sentinel.value) observer.observe(sentinel.value)
})
onBeforeUnmount(() => {
  stop()
  observer?.disconnect()
  document.removeEventListener('visibilitychange', visibility)
})
</script>
<template>
  <section class="m-results" :aria-label="m.aggregate.title" :aria-busy="busy">
    <header class="m-results__head">
      <button type="button" class="m-btn m-btn--small" @click="closeAggregate(store)">
        <ArrowLeft :size="16" />{{ m.common.back }}
      </button>
      <div>
        <h1>{{ q }}</h1>
        <p role="status" aria-live="polite">{{ status }}</p>
      </div>
    </header>
    <nav class="m-results__tabs" :aria-label="m.aggregate.engines">
      <button type="button" :aria-pressed="filter === ''" @click="filter = ''">
        {{ m.aggregate.all }}</button
      ><button
        v-for="id in ids"
        :key="id"
        type="button"
        :aria-pressed="filter === id"
        @click="filter = id"
      >
        {{ name(id) }} <small>{{ states[id]?.items.length || 0 }}</small>
      </button>
    </nav>
    <div class="m-results__sources">
      <div
        v-for="id in ids.filter((id) => !filter || id === filter)"
        :key="id"
        class="m-results__source"
      >
        <span
          >{{ name(id)
          }}<small v-if="states[id]?.provider"> · {{ states[id]?.provider }}</small></span
        ><span v-if="states[id]?.loading">{{ m.common.loading }}</span
        ><span v-else-if="states[id]?.error">{{
          states[id]?.error === 'permission'
            ? m.aggregate.permission
            : states[id]?.error === 'link'
              ? m.aggregate.linkOnly
              : m.aggregate.failed
        }}</span
        ><button
          v-if="states[id]?.error && states[id]?.error !== 'link'"
          type="button"
          class="m-btn m-btn--small"
          @click="retry(id)"
        >
          {{ m.common.retry }}</button
        ><a :href="engineUrl(id)" target="_blank" rel="noopener noreferrer"
          >{{ m.aggregate.visit }} <ExternalLink :size="12"
        /></a>
      </div>
    </div>
    <div v-if="results.length" class="m-results__masonry">
      <article v-for="result in results" :key="result.url" class="m-results__card m-card">
        <div class="m-results__title">
          <a
            :href="result.url"
            :target="store.settings.search.openIn === 'new' ? '_blank' : undefined"
            rel="noopener noreferrer"
            >{{ result.title }}</a
          ><a
            v-if="store.settings.search.openIn === 'current'"
            class="m-results__new"
            :href="result.url"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="m.aggregate.newTab"
            :title="m.aggregate.newTab"
            ><ExternalLink :size="16"
          /></a>
        </div>
        <p v-if="result.description">{{ result.description }}</p>
        <footer>
          <span>{{ host(result.url) }}</span
          ><small>{{ result.engines.map(name).join(' · ') }}</small>
        </footer>
      </article>
    </div>
    <p v-else-if="!busy" class="m-results__empty">{{ m.aggregate.empty }}</p>
    <div ref="sentinel" class="m-results__more">
      <button v-if="hasMore" type="button" class="m-btn" :disabled="busy" @click="more">
        {{ busy ? m.common.loading : m.aggregate.more }}</button
      ><span v-else-if="results.length && !busy">{{ m.aggregate.end }}</span>
    </div>
  </section>
</template>
<style scoped>
.m-results {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 0 96px;
}
.m-results__head {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
}
.m-results__head h1 {
  margin: 0;
  font-size: 26px;
  overflow-wrap: anywhere;
}
.m-results__head p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.m-results__tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.m-results__tabs button {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 8px 15px;
  background: var(--panel);
  color: var(--muted);
}
.m-results__tabs button[aria-pressed='true'] {
  background: var(--primary-action);
  color: var(--primary-action-text);
}
.m-results__sources {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}
.m-results__source {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--muted);
}
.m-results__source a {
  color: var(--blue);
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.m-results__masonry {
  columns: 3;
  column-gap: 16px;
}
.m-results__card {
  break-inside: avoid;
  margin: 0 0 16px;
  padding: 20px;
  border-radius: 20px;
}
.m-results__title {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.m-results__title > a:first-child {
  flex: 1;
  min-width: 0;
  color: var(--text);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.m-results__title a:hover {
  color: var(--blue);
}
.m-results__new {
  flex: none;
  margin-left: auto;
  padding: 3px;
  color: var(--muted);
}
.m-results__card p {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.75;
  overflow-wrap: anywhere;
}
.m-results__card footer {
  display: grid;
  gap: 6px;
  color: var(--blue);
  font-size: 11px;
}
.m-results__card footer span {
  overflow-wrap: anywhere;
}
.m-results__card footer small {
  color: var(--muted);
}
.m-results__more {
  min-height: 60px;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 12px;
}
.m-results__empty {
  color: var(--muted);
  padding: 32px 0;
}
@media (max-width: 1000px) {
  .m-results__masonry {
    columns: 2;
  }
}
@media (max-width: 640px) {
  .m-results__masonry {
    columns: 1;
  }
}
</style>
