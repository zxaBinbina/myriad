<script setup lang="ts">
import { Heart } from '@lucide/vue'
import { quoteConfig, ymd, type WidgetItem } from '@myriad/core'
import { computed, watch } from 'vue'
import { useI18n } from '../../i18n'
import { useNow } from '../../composables/useNow'
import { useVisibleResource } from '../../composables/useVisibleResource'
import { grantWidgetOrigins, loadQuote, QUOTE_ORIGIN, widgetBase } from '../../state/widgetRequests'
import { useStore } from '../../state/store'
import WidgetHeader from './WidgetHeader.vue'

const props = defineProps<{ item: WidgetItem }>()
const store = useStore()
const { m } = useI18n()
const now = useNow()
// 每日一言按设备本地日期更新，时钟的附加时区不会额外产生请求。
const day = computed(() =>
  ymd({ year: now.value.getFullYear(), month: now.value.getMonth() + 1, day: now.value.getDate() }),
)
const config = computed(() => quoteConfig(props.item.config))
const key = computed(() =>
  config.value.fromFavorites ? null : `quote:${day.value}:${config.value.categories.join('')}`,
)
const { root, data, loading, error, stale, reload } = useVisibleResource(
  key,
  (signal) => loadQuote(store, config.value.route, day.value, config.value.categories, signal),
  86400000,
  computed(() => props.item.id),
)
const selected = computed(() => {
  if (!config.value.fromFavorites) return data.value
  const favorites = config.value.favorites
  let seed = 2166136261
  for (const char of day.value) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619)
  return favorites.length ? favorites[(seed >>> 0) % favorites.length] : undefined
})
const saved = computed(() => config.value.favorites.some((q) => q.id === selected.value?.id))
async function copy() {
  if (!selected.value) return
  try {
    await navigator.clipboard.writeText(selected.value.text)
    store.toast(m.value.widget.copied, 'success')
  } catch {
    store.toast(m.value.widget.copyFailed, 'error')
  }
}
function favorite() {
  if (!selected.value) return
  props.item.config.favorites = saved.value
    ? config.value.favorites.filter((q) => q.id !== selected.value!.id)
    : [...config.value.favorites, selected.value]
}
async function enable() {
  const permission = grantWidgetOrigins(store, config.value.route, [QUOTE_ORIGIN])
  if (await permission) void reload()
}
// 路由改变后允许重新检查权限，但仍沿用同一天的句子缓存。
const source = computed(() => widgetBase(store, config.value.route))
watch(source, () => void reload())
</script>

<template>
  <div ref="root" class="m-quote" data-widget="quote" :data-source="source" :aria-busy="loading">
    <WidgetHeader :item="item">
      <button
        v-if="selected"
        type="button"
        class="m-icon-btn m-icon-btn--small"
        :class="{ 'is-saved': saved }"
        :aria-label="saved ? m.widget.unfavorite : m.widget.favorite"
        :aria-pressed="saved"
        @click="favorite"
      >
        <Heart :size="15" :fill="saved ? 'currentColor' : 'none'" />
      </button>
    </WidgetHeader>
    <button
      v-if="selected"
      type="button"
      class="m-quote__body"
      :title="m.widget.quoteHint"
      @click="copy"
    >
      <span class="m-quote__mark" aria-hidden="true">“</span>
      <span class="m-quote__text">{{ selected.text }}</span>
      <span class="m-quote__from">{{
        [selected.author, selected.source].filter(Boolean).join(' · ')
      }}</span>
    </button>
    <div v-else class="m-quote__empty" aria-live="polite">
      <p>
        {{
          config.fromFavorites
            ? m.widget.emptyFavorites
            : error === 'permission'
              ? m.widget.enable
              : error
                ? m.widget.failed
                : m.widget.loading
        }}
      </p>
      <button
        v-if="error && !config.fromFavorites"
        type="button"
        class="m-btn m-btn--small"
        @click="error === 'permission' ? enable() : reload()"
      >
        {{ error === 'permission' ? m.widget.enable : m.widget.retry }}
      </button>
    </div>
    <footer class="m-quote__footer">
      <span>{{ stale ? m.widget.cached : day }}</span>
      <a
        v-if="!config.fromFavorites"
        href="https://hitokoto.cn"
        target="_blank"
        rel="noopener noreferrer"
        >Hitokoto</a
      >
    </footer>
  </div>
</template>

<style scoped>
.m-quote {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px 10px;
  overflow: auto;
}
.m-quote__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  user-select: text;
}
.m-quote__mark {
  color: var(--blue);
  font-family: Georgia, serif;
  font-size: 40px;
  height: 27px;
  line-height: 1;
}
.m-quote__text {
  font-size: 15px;
  line-height: 1.75;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.m-quote__from {
  align-self: flex-end;
  color: var(--muted);
  font-size: 10px;
}
.m-quote__footer {
  display: flex;
  justify-content: space-between;
  color: var(--muted);
  font-size: 9px;
  margin-top: auto;
}
.m-quote__empty {
  color: var(--muted);
  font-size: 12px;
}
.is-saved {
  color: var(--blue);
}
</style>
