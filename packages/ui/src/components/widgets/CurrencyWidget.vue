<script setup lang="ts">
import { ArrowLeftRight, RefreshCw } from '@lucide/vue'
import {
  browserTimeZone,
  convertCurrency,
  currencyConfig,
  ymd,
  type WidgetItem,
} from '@myriad/core'
import { computed, ref } from 'vue'
import { useNow } from '../../composables/useNow'
import { useVisibleResource } from '../../composables/useVisibleResource'
import { useI18n } from '../../i18n'
import { useStore } from '../../state/store'
import { grantWidgetOrigins, widgetBase } from '../../state/widgetRequests'
import { CURRENCY_ORIGINS, loadCurrency } from '../../state/currencyRequests'
import WidgetHeader from './WidgetHeader.vue'
import WidgetState from './WidgetState.vue'
import HistoryChart from './HistoryChart.vue'
const props = defineProps<{ item: WidgetItem }>()
const store = useStore(),
  { m, t } = useI18n(),
  now = useNow(),
  zone = browserTimeZone() ?? ''
const config = computed(() => currencyConfig(props.item.config, zone))
const today = computed(() => ({
  year: now.value.getFullYear(),
  month: now.value.getMonth() + 1,
  day: now.value.getDate(),
}))
const withHistory = computed(
  () => config.value.history && (props.item.size.startsWith('4') || props.item.size.endsWith('4')),
)
const key = computed(
  () =>
    `currency:${widgetBase(store, config.value.route)}:${config.value.base}:${config.value.quote}:${ymd(today.value)}:${withHistory.value}`,
)
const { root, data, error, loading, stale, reload } = useVisibleResource(
  key,
  (signal) => loadCurrency(store, config.value, today.value, withHistory.value, signal),
  43200000,
  computed(() => props.item.id),
)
const amount = ref<string | number>('1')
const result = computed(() =>
  String(amount.value).trim() && data.value
    ? convertCurrency(Number(amount.value), data.value.rate)
    : null,
)
const format = (value: number) =>
  new Intl.NumberFormat(store.lang.value, { maximumFractionDigits: 8 }).format(value)
const points = computed(
  () => data.value?.history.map((p) => ({ x: Date.parse(`${p.date}T12:00:00Z`), y: p.rate })) ?? [],
)
function swap() {
  props.item.config = { ...props.item.config, base: config.value.quote, quote: config.value.base }
}
async function enable() {
  const grant = grantWidgetOrigins(store, config.value.route, CURRENCY_ORIGINS)
  if (await grant) void reload()
}
</script>
<template>
  <div
    ref="root"
    class="m-currency"
    :class="{ 'is-tall': item.size.endsWith('4') }"
    data-widget="currency"
    :aria-busy="loading"
  >
    <WidgetHeader :item="item"
      ><button
        type="button"
        class="m-icon-btn m-icon-btn--small"
        :aria-label="m.currency.refresh"
        :disabled="loading"
        @click="reload()"
      >
        <RefreshCw :size="14" /></button
    ></WidgetHeader>
    <div class="m-currency__pair">
      <strong>{{ config.base }}</strong
      ><button
        type="button"
        class="m-icon-btn m-icon-btn--small"
        :aria-label="m.currency.swap"
        @click="swap"
      >
        <ArrowLeftRight :size="16" /></button
      ><strong>{{ config.quote }}</strong>
    </div>
    <template v-if="data">
      <label class="m-currency__convert"
        ><span>{{ config.base }}</span
        ><input
          v-model="amount"
          type="number"
          step="any"
          class="m-input"
          :aria-label="t('currency.amount', { code: config.base })"
        /><span class="m-currency__result"
          >{{ result === null ? '—' : format(result) }} <b>{{ config.quote }}</b></span
        ></label
      >
      <HistoryChart
        v-if="withHistory && points.length"
        :label="m.currency.history"
        :points="points"
      />
      <p v-else-if="withHistory" class="m-currency__hint">{{ m.currency.noHistory }}</p>
      <footer>
        <span>{{ stale ? m.widget.cached : data.date }}</span
        ><span>{{ data.provider }}</span>
      </footer>
    </template>
    <WidgetState
      :error="error"
      :loading="loading"
      :empty="!data"
      @enable="enable"
      @retry="reload()"
    />
  </div>
</template>
<style scoped>
.m-currency {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  overflow: auto;
  container-type: inline-size;
}
.m-currency__pair {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  font-size: 14px;
  letter-spacing: 1px;
}
.m-currency__convert {
  display: grid;
  grid-template-columns: auto minmax(50px, 1fr) minmax(70px, 1.4fr);
  align-items: center;
  gap: 10px;
  font-size: 11px;
}
.m-currency__convert input {
  min-height: 32px;
  padding: 4px 8px;
  font-size: 14px;
}
.m-currency__result {
  color: var(--blue);
  font-size: 17px;
  font-weight: 500;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.m-currency__result b {
  color: var(--muted);
  font-size: 10px;
  font-weight: 400;
}
.m-currency footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  color: var(--muted);
  font-size: 9px;
}
.m-currency :deep(.m-history-chart svg) {
  height: 48px;
}
.m-currency.is-tall :deep(.m-history-chart svg) {
  height: 72px;
}
.m-currency__hint {
  color: var(--muted);
  font-size: 10px;
  margin: 0;
}
@container (max-width:210px) {
  .m-currency__convert {
    grid-template-columns: auto 1fr;
  }
  .m-currency__result {
    grid-column: 1/-1;
    text-align: center;
    padding-top: 8px;
    font-size: 24px;
  }
}
</style>
