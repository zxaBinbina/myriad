<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import { statusConfig, type WidgetItem } from '@myriad/core'
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import { useStore } from '../../state/store'
import { useVisibleResource } from '../../composables/useVisibleResource'
import { grantSources } from '../../state/widgetRequests'
import { loadServiceStatus } from '../../state/statusRequests'
import WidgetHeader from './WidgetHeader.vue'
import WidgetState from './WidgetState.vue'
import HistoryChart from './HistoryChart.vue'
const props = defineProps<{ item: WidgetItem }>()
const store = useStore(),
  { m, t } = useI18n()
const config = computed(() => statusConfig(props.item.config))
const tiny = computed(() => props.item.size.startsWith('1'))
const wide = computed(() => props.item.size.startsWith('4'))
const tall = computed(() => props.item.size.endsWith('4'))
const withHistory = computed(() => tall.value && config.value.latency && !!config.value.historyUrl)
const key = computed(
  () => `status:${config.value.url}:${withHistory.value ? config.value.historyUrl : ''}`,
)
const { root, data, loading, error, stale, reload } = useVisibleResource(
  key,
  (signal) => loadServiceStatus(store, config.value, withHistory.value, signal),
  (value) => value.snapshot.refreshAfterMs,
  computed(() => props.item.id),
  { autoRefresh: false, retry: false, revalidateOnVisible: false },
)
const availability = computed(() => {
  const points = data.value?.snapshot.availability ?? []
  return points.length
    ? ((100 * points.filter((p) => p.online).length) / points.length).toFixed(1)
    : null
})
const series = computed(
  () =>
    data.value?.snapshot.services.map((s) => ({
      id: s.id,
      name: s.name,
      points: data.value!.history.map((p) => ({
        x: p.time,
        y: p.services.find((v) => v.id === s.id)?.latencyMs ?? null,
      })),
    })) ?? [],
)
async function enable() {
  const grant = grantSources(store, [
    new URL(config.value.url).origin,
    ...(withHistory.value ? [new URL(config.value.historyUrl).origin] : []),
  ])
  if (await grant) void reload()
}
const time = computed(() =>
  data.value?.snapshot.generatedAt
    ? new Date(data.value.snapshot.generatedAt).toLocaleTimeString(store.lang.value, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '',
)
</script>
<template>
  <div
    ref="root"
    class="m-status"
    :class="{ 'is-tiny': tiny, 'is-wide': wide, 'is-tall': tall }"
    data-widget="status"
    :aria-busy="loading"
  >
    <WidgetHeader :item="item">
      <button
        v-if="!tiny"
        type="button"
        class="m-icon-btn m-icon-btn--small"
        :aria-label="m.status.refresh"
        :disabled="loading"
        @click="reload(true)"
      >
        <RefreshCw :size="14" />
      </button>
    </WidgetHeader>
    <template v-if="data">
      <div class="m-status__overall">
        <span
          class="m-status__dot"
          :class="`is-${data.snapshot.overall}`"
          aria-hidden="true"
        /><strong>{{ t(`status.${data.snapshot.overall}`) }}</strong>
      </div>
      <div v-if="!tiny" class="m-status__services">
        <div v-for="s in data.snapshot.services" :key="s.id">
          <span
            class="m-status__dot"
            :class="`is-${s.status}`"
            :title="t(`status.${s.status}`)"
          /><span>{{ s.name }}</span
          ><b>{{ s.latencyMs === null ? '—' : `${Math.round(s.latencyMs)} ms` }}</b>
        </div>
      </div>
      <div
        v-if="!tiny && config.node && (wide || tall) && data.snapshot.node.name"
        class="m-status__node"
      >
        <span>{{ data.snapshot.node.name }}</span
        ><span v-if="data.snapshot.node.cpu !== null"
          >CPU {{ Math.round(data.snapshot.node.cpu) }}%</span
        ><span v-if="data.snapshot.node.memory !== null"
          >{{ m.status.memory }} {{ Math.round(data.snapshot.node.memory) }}%</span
        >
      </div>
      <section
        v-if="!tiny && config.availability && (wide || tall) && availability !== null"
        class="m-status__availability"
      >
        <div>
          <span>{{ m.status.availability }}</span
          ><b>{{ availability }}%</b>
        </div>
        <div class="m-status__bar" :aria-label="`${m.status.availability} ${availability}%`">
          <span
            v-for="p in data.snapshot.availability"
            :key="p.time"
            :class="p.online ? 'is-up' : 'is-down'"
            :title="`${new Date(p.time).toLocaleString()} · ${p.online ? m.status.operational : m.status.outage}`"
          />
        </div>
      </section>
      <div v-if="withHistory && data.history.length" class="m-status__charts">
        <HistoryChart
          v-for="s in series"
          :key="s.id"
          :label="s.name"
          :points="s.points"
          unit=" ms"
        />
      </div>
      <p v-if="data.historyUnavailable" class="m-status__hint">{{ m.status.historyUnavailable }}</p>
      <footer v-if="!tiny">{{ stale || data.snapshot.stale ? m.widget.cached : time }}</footer>
    </template>
    <WidgetState
      :error="error"
      :loading="loading"
      :empty="!data"
      @enable="enable"
      @retry="reload(true)"
    />
  </div>
</template>
<style scoped>
.m-status {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  overflow: auto;
}
.m-status__overall {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
}
.m-status__dot {
  display: inline-block;
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
}
.m-status__dot.is-operational {
  background: var(--status-success);
}
.m-status__dot.is-degraded {
  background: var(--status-warning);
}
.m-status__dot.is-outage {
  background: var(--status-danger);
}
.m-status__services {
  display: grid;
  gap: 8px;
}
.m-status__services > div {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}
.m-status__services > div > span:nth-child(2) {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-status__services b {
  color: var(--muted);
  font-weight: 400;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.is-wide .m-status__services {
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
}
.m-status__node {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  color: var(--muted);
  font-size: 10px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}
.m-status__availability > div:first-child {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--muted);
}
.m-status__bar {
  display: flex;
  height: 10px;
  gap: 1px;
  margin-top: 5px;
  overflow: hidden;
  border-radius: 4px;
}
.m-status__bar span {
  flex: 1;
  min-width: 1px;
}
.is-up {
  background: var(--status-success);
}
.is-down {
  background: var(--status-danger);
}
.m-status__charts {
  display: grid;
  gap: 8px;
  margin-top: 4px;
}
.is-wide .m-status__charts {
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.m-status footer,
.m-status__hint {
  color: var(--muted);
  font-size: 9px;
  margin: 0;
}
.m-status footer {
  margin-top: auto;
}
.is-tiny {
  padding: 10px;
}
.is-tiny .m-status__overall {
  flex: 1;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}
.is-tiny .m-status__dot {
  width: 20px;
  height: 20px;
}
</style>
