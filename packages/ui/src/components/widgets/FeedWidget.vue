<script setup lang="ts">
import { computed } from 'vue'
import { Bookmark, RefreshCw } from '@lucide/vue'
import { HOT_SOURCES, feedConfig, feedPeriod, subscriptionUrl, type WidgetItem } from '@myriad/core'
import { useStore } from '../../state/store'
import { useI18n } from '../../i18n'
import { useNow } from '../../composables/useNow'
import { useVisibleResource } from '../../composables/useVisibleResource'
import { feedOrigins, loadFeed, openFeed, toggleFeedFavorite } from '../../state/feeds'
import { grantSources, widgetBase } from '../../state/widgetRequests'
import WidgetHeader from './WidgetHeader.vue'
import WidgetState from './WidgetState.vue'
import FeedHoverPreview from '../FeedHoverPreview.vue'
const props = defineProps<{ item: WidgetItem }>()
const store = useStore(),
  { m, lang } = useI18n(),
  now = useNow()
const cfg = computed(() => feedConfig(props.item.config))
const selected = computed({
  get: () => (cfg.value.mode === 'rss' ? cfg.value.selectedSubscription : cfg.value.selectedSource),
  set: (value: string) => {
    props.item.config[cfg.value.mode === 'rss' ? 'selectedSubscription' : 'selectedSource'] = value
  },
})
const options = computed(() =>
  cfg.value.mode === 'rss'
    ? cfg.value.subscriptions.map((s) => ({
        id: s.id,
        name: s.title,
        url: subscriptionUrl(s, cfg.value.rsshubBase),
      }))
    : HOT_SOURCES.filter((s) => cfg.value.sources.includes(s.id)).map((s) => ({
        id: s.id,
        name: lang.value === 'en' ? s.nameEn : s.name,
        url: '',
      })),
)
const current = computed(
  () => options.value.find((o) => o.id === selected.value) || options.value[0],
)
const period = computed(() => feedPeriod(now.value, cfg.value.refreshTime))
const cacheKey = computed(
  () =>
    `feed:${widgetBase(store, cfg.value.route)}:${cfg.value.route}:${current.value?.id}:${current.value?.url}`,
)
const key = computed(() =>
  cfg.value.mode === 'favorites' || !current.value
    ? null
    : `feed:${widgetBase(store, cfg.value.route)}:${cfg.value.route}:${current.value.id}:${current.value.url}:${period.value}`,
)
const { root, data, loading, error, stale, reload } = useVisibleResource(
  key,
  (signal) =>
    loadFeed(
      store,
      cfg.value.route,
      current.value?.id || '',
      current.value?.url || '',
      period.value,
      signal,
    ),
  (value) => (value.stale ? 60000 : Math.max(1000, period.value + 86400000 - Date.now())),
  computed(() => props.item.id),
  { autoRefresh: false, retry: false, cacheKey },
)
const entries = computed(() =>
  cfg.value.mode === 'favorites' ? cfg.value.favorites : data.value?.items || [],
)
const saved = (id: string) => cfg.value.favorites.some((e) => e.id === id)
async function enable() {
  const permission = grantSources(
    store,
    feedOrigins(store, cfg.value.route, current.value?.id || '', current.value?.url || ''),
  )
  if (await permission) void reload()
}
</script>
<template>
  <div ref="root" class="m-feed" data-widget="feeds" :aria-busy="loading">
    <WidgetHeader :item="item"
      ><button
        v-if="cfg.mode !== 'favorites'"
        type="button"
        class="m-icon-btn m-icon-btn--small"
        :aria-label="m.feeds.refresh"
        :title="m.feeds.refresh"
        :disabled="loading"
        @click="reload()"
      >
        <RefreshCw :size="15" /></button
    ></WidgetHeader>
    <select
      v-if="cfg.mode !== 'favorites' && options.length"
      v-model="selected"
      class="m-select m-feed__source"
      :aria-label="m.feeds.source"
    >
      <option v-for="o in options" :key="o.id" :value="o.id">{{ o.name }}</option>
    </select>
    <WidgetState
      :loading="loading"
      :error="error"
      :empty="!data"
      @enable="enable"
      @retry="reload()"
    />
    <p v-if="stale || data?.stale" class="m-feed__hint" role="status">{{ m.feeds.stale }}</p>
    <ol v-if="entries.length" class="m-feed__list">
      <li
        v-for="(entry, index) in entries"
        :key="entry.id"
        :class="{ 'is-read': cfg.readMarks && cfg.read.includes(entry.id) }"
      >
        <span class="m-feed__rank" aria-hidden="true">{{ index + 1 }}</span>
        <FeedHoverPreview :item="item" :entry="entry" @open="openFeed(store, item, entry)">
          <span>{{ entry.title }}</span
          ><small v-if="entry.heat">{{ entry.heat }}</small>
        </FeedHoverPreview>
        <button
          v-if="cfg.favoritesEnabled"
          type="button"
          class="m-icon-btn m-icon-btn--small"
          :aria-label="saved(entry.id) ? m.feeds.unsave : m.feeds.save"
          :aria-pressed="saved(entry.id)"
          @click="toggleFeedFavorite(item, entry)"
        >
          <Bookmark :size="14" :fill="saved(entry.id) ? 'currentColor' : 'none'" />
        </button>
      </li>
    </ol>
    <p v-else-if="!loading && !error" class="m-feed__hint">
      {{
        cfg.mode === 'rss' && !options.length
          ? m.feeds.noSubscriptions
          : cfg.mode === 'favorites'
            ? m.feeds.noFavorites
            : m.feeds.empty
      }}
    </p>
    <small v-if="data && cfg.mode !== 'favorites'" class="m-feed__updated"
      >{{ m.feeds.updated }}
      {{
        new Date(data.fetchedAt).toLocaleString(lang, {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      }}</small
    >
  </div>
</template>
<style scoped>
.m-feed {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 10px;
  overflow: hidden;
}
.m-feed__source {
  width: 100%;
  flex: none;
}
.m-feed__list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: auto;
  min-height: 0;
  overscroll-behavior: contain;
}
.m-feed__list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.m-feed__rank {
  color: var(--muted);
  font-size: 12px;
  min-width: 18px;
  font-variant-numeric: tabular-nums;
}
.m-feed__list li:nth-child(-n + 3) .m-feed__rank {
  color: var(--blue);
}
.m-feed__hint,
.m-feed__updated {
  color: var(--muted);
  font-size: 11px;
}
.m-feed__updated {
  color: var(--muted);
  font-size: 11px;
}
.is-read .m-feed__title {
  color: var(--muted);
}
.m-feed__updated {
  margin-top: auto;
  padding-top: 4px;
}
.m-feed__hint {
  margin: 0;
}
</style>
