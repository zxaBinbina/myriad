<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import { temperatureIn, weatherCondition, weatherConfig, type WidgetItem } from '@myriad/core'
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import { useStore } from '../../state/store'
import { useVisibleResource } from '../../composables/useVisibleResource'
import {
  AIR_ORIGIN,
  grantWidgetOrigins,
  loadWeather,
  WEATHER_ORIGIN,
  widgetBase,
} from '../../state/widgetRequests'
import WeatherIcon from './WeatherIcon.vue'
import WidgetHeader from './WidgetHeader.vue'

const props = defineProps<{ item: WidgetItem }>()
const store = useStore()
const { m, t } = useI18n()
const config = computed(() => weatherConfig(props.item.config))
const cityIndex = computed(() =>
  Math.max(0, Math.min(config.value.cities.length - 1, Number(props.item.config.cityIndex) || 0)),
)
const city = computed(() => config.value.cities[cityIndex.value])
const key = computed(() =>
  city.value
    ? `weather:v2:${widgetBase(store, config.value.route)}:${city.value.latitude}:${city.value.longitude}:${config.value.airQuality}:${config.value.provider}:${config.value.warnings}:${store.lang.value}`
    : null,
)
const { root, data, loading, error, stale, reload } = useVisibleResource(
  key,
  (signal) =>
    loadWeather(
      store,
      config.value.route,
      city.value!,
      config.value.airQuality,
      signal,
      config.value.provider,
      config.value.warnings,
    ),
  1800000,
  computed(() => props.item.id),
)
const temp = (n: number | null) => temperatureIn(n, config.value.unit)
const wide = computed(() => props.item.size.startsWith('4'))
const tall = computed(() => props.item.size.endsWith('4'))
function changeCity(e: Event) {
  props.item.config.cityIndex = Number((e.target as HTMLSelectElement).value)
}
async function enable() {
  const granted = grantWidgetOrigins(
    store,
    config.value.route,
    config.value.airQuality ? [WEATHER_ORIGIN, AIR_ORIGIN] : [WEATHER_ORIGIN],
  )
  if (await granted) void reload()
}
const dayLabel = (date: string, index: number) =>
  index === 0
    ? m.value.widget.today
    : new Intl.DateTimeFormat(store.lang.value, { weekday: 'short', timeZone: 'UTC' }).format(
        new Date(`${date}T12:00:00Z`),
      )
</script>

<template>
  <div
    ref="root"
    class="m-weather"
    :class="{ 'is-wide': wide, 'is-tall': tall }"
    data-widget="weather"
    :aria-busy="loading"
  >
    <WidgetHeader :item="item">
      <button
        v-if="data"
        type="button"
        class="m-icon-btn m-icon-btn--small"
        :aria-label="m.widget.refresh"
        :disabled="loading"
        @click="reload(true)"
      >
        <RefreshCw :size="14" />
      </button>
    </WidgetHeader>
    <select
      v-if="config.cities.length > 1"
      class="m-weather__cities"
      :aria-label="m.widget.city"
      :value="cityIndex"
      @change="changeCity"
    >
      <option v-for="(c, i) in config.cities" :key="i" :value="i">{{ c.name }}</option>
    </select>
    <p v-else-if="city" class="m-weather__city">{{ city.name }}</p>
    <div v-if="data" class="m-weather__content">
      <div class="m-weather__current">
        <WeatherIcon :code="data.code" :is-day="data.isDay" :size="wide ? 42 : 32" />
        <strong
          >{{ temp(data.temperature)
          }}<small>°{{ config.unit === 'celsius' ? 'C' : 'F' }}</small></strong
        >
        <div class="m-weather__summary">
          <span>{{ data.condition || t(`widget.${weatherCondition(data.code)}`) }}</span>
          <small v-if="config.apparent && data.apparent !== null">{{
            t('widget.apparent', { n: temp(data.apparent) })
          }}</small>
        </div>
      </div>
      <div class="m-weather__meta">
        <span v-if="config.airQuality && data.aqi !== null">{{
          t('widget.aqi', { n: Math.round(data.aqi) })
        }}</span>
        <span v-if="config.sun && data.daily[0]?.sunrise"
          >{{ m.widget.sunrise }} {{ data.daily[0].sunrise.slice(11, 16) }} · {{ m.widget.sunset }}
          {{ data.daily[0].sunset.slice(11, 16) }}</span
        >
      </div>
      <section v-if="config.warnings && data.warnings?.length" class="m-weather__warnings">
        <h4>{{ m.widget.warnings }}</h4>
        <details v-for="warning in data.warnings" :key="warning.id">
          <summary>{{ warning.title }}</summary>
          <p>{{ warning.text }}</p>
        </details>
        <small>{{ m.widget.warningDisclaimer }}</small>
      </section>
      <small
        v-else-if="config.warnings && data.warningsUnavailable"
        class="m-weather__warning-hint"
        >{{ m.widget.warningsUnavailable }}</small
      >
      <div v-if="config.hourly && tall" class="m-weather__hourly" :aria-label="m.widget.hourly">
        <div v-for="h in data.hourly.slice(0, 8)" :key="h.time">
          <span>{{ h.time.slice(11, 16) }}</span
          ><WeatherIcon :code="h.code" :size="19" /><b>{{ temp(h.temperature) }}°</b>
        </div>
      </div>
      <div
        v-if="config.forecast && (wide || tall)"
        class="m-weather__forecast"
        :aria-label="m.widget.forecast"
      >
        <div v-for="(d, i) in data.daily" :key="d.date">
          <span>{{ dayLabel(d.date, i) }}</span
          ><WeatherIcon :code="d.code" :size="20" />
          <span
            >{{ temp(d.low) }}° <b>{{ temp(d.high) }}°</b></span
          >
        </div>
      </div>
    </div>
    <div v-if="!city || !data || error" class="m-weather__status" aria-live="polite">
      <p>
        {{
          !city
            ? m.widget.noWeather
            : error === 'permission'
              ? m.widget.enable
              : error
                ? m.widget.failed
                : m.widget.loading
        }}
      </p>
      <button
        v-if="!city"
        type="button"
        class="m-btn m-btn--small"
        @click="store.ui.widgetEditor = item.id"
      >
        {{ m.widget.configure }}
      </button>
      <button
        v-else-if="error"
        type="button"
        class="m-btn m-btn--small"
        @click="error === 'permission' ? enable() : reload(true)"
      >
        {{ error === 'permission' ? m.widget.enable : m.widget.retry }}
      </button>
    </div>
    <footer v-if="data" class="m-weather__credit">
      <span>{{ stale ? m.widget.cached : data.time.slice(11, 16) }}</span>
      <a
        :href="
          data.provider === 'qweather' ? 'https://www.qweather.com/' : 'https://open-meteo.com/'
        "
        target="_blank"
        rel="noopener noreferrer"
        >{{ data.provider === 'qweather' ? 'QWeather' : 'Open-Meteo · CAMS' }}</a
      >
    </footer>
  </div>
</template>

<style scoped>
.m-weather {
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  padding: 14px 16px 10px;
  container-type: inline-size;
  overflow: auto;
}
.m-weather__warnings {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px;
  font-size: 11px;
  background: color-mix(in srgb, var(--blue) 7%, transparent);
}
.m-weather__warnings h4 {
  margin: 0 0 6px;
  font-size: 12px;
}
.m-weather__warnings p {
  white-space: pre-wrap;
  margin: 6px 0;
  overflow-wrap: anywhere;
}
.m-weather__warnings small,
.m-weather__warning-hint {
  font-size: 10px;
  color: var(--muted);
}
.m-weather__city {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-weather__cities {
  width: 100%;
  border: 0;
  background: var(--secondary-surface);
  border-radius: 8px;
  padding: 3px 5px;
  font-size: 11px;
}
.m-weather__content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.m-weather__current {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--blue);
}
.m-weather__current strong {
  color: var(--text);
  font-size: 36px;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: -1.5px;
  font-variant-numeric: tabular-nums;
}
.m-weather__current strong small {
  font-size: 15px;
  font-weight: 400;
  letter-spacing: 0;
}
.m-weather__summary {
  display: flex;
  flex-direction: column;
  color: var(--text);
  font-size: 12px;
}
.m-weather__summary small {
  color: var(--muted);
  font-size: 10px;
}
.m-weather__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 12px;
  font-size: 10px;
  color: var(--muted);
}
.m-weather__hourly {
  display: flex;
  gap: 16px;
  overflow: auto;
  padding: 10px 0;
  border-block: 1px solid var(--border);
}
.m-weather__hourly > div {
  display: grid;
  justify-items: center;
  flex: none;
  gap: 6px;
  font-size: 11px;
}
.m-weather__hourly svg {
  color: var(--blue);
}
.m-weather__forecast {
  display: grid;
  gap: 6px;
  padding-top: 6px;
}
.m-weather__forecast > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--muted);
}
.m-weather__forecast b {
  color: var(--text);
}
.is-wide:not(.is-tall) .m-weather__forecast {
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border-top: 1px solid var(--border);
}
.is-wide:not(.is-tall) .m-weather__forecast > div {
  flex-direction: column;
  gap: 4px;
  font-size: 10px;
  white-space: nowrap;
}
.m-weather__status {
  display: grid;
  justify-items: start;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.m-weather__status p {
  margin: 0;
}
.m-weather__credit {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 4px;
  color: var(--muted);
  font-size: 9px;
}
@container (max-width: 210px) {
  .m-weather__current {
    gap: 6px;
    flex-wrap: wrap;
  }
  .m-weather__current strong {
    font-size: 30px;
  }
  .m-weather__summary {
    flex-direction: row;
    gap: 6px;
    width: 100%;
  }
}
</style>
