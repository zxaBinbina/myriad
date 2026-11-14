<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import {
  countdownConfig,
  parsePlainDate,
  quoteConfig,
  QUOTE_CATEGORIES,
  weatherConfig,
  type WeatherCity,
} from '@myriad/core'
import { useStore } from '../../state/store'
import { useI18n } from '../../i18n'
import {
  CITY_ORIGIN,
  grantWidgetOrigins,
  locateByIp,
  searchCities,
  widgetBase,
} from '../../state/widgetRequests'
import MDialog from '../base/MDialog.vue'
import MSwitch from '../base/MSwitch.vue'
import AdvancedWidgetSettings from './AdvancedWidgetSettings.vue'
import MemoSettings from './MemoSettings.vue'
import TranslationSettings from './TranslationSettings.vue'

const store = useStore()
const { m, t } = useI18n()
const item = computed(() => {
  const it = store.ui.widgetEditor ? store.data.items[store.ui.widgetEditor] : null
  return it?.type === 'widget' ? it : null
})
const weather = ref(weatherConfig({}))
const quote = ref(quoteConfig({}))
const countdown = ref(countdownConfig({}))
const calendarTasks = ref(true)
const advanced = ref<InstanceType<typeof AdvancedWidgetSettings> | null>(null)
const memoSettings = ref<InstanceType<typeof MemoSettings> | null>(null)
const translationSettings = ref<InstanceType<typeof TranslationSettings> | null>(null)
const translationFormId = useId()
const query = ref('')
const results = ref<WeatherCity[]>([])
const searched = ref(false)
const busy = ref(false)
const error = ref('')
const manualName = ref('')
const latitude = ref<string | number>('')
const longitude = ref<string | number>('')
let ctrl: AbortController | undefined
let generation = 0
function cancelRequest() {
  generation++
  ctrl?.abort()
  busy.value = false
}
watch(
  () => store.ui.widgetEditor,
  () => {
    cancelRequest()
    weather.value = weatherConfig(item.value?.config)
    quote.value = quoteConfig(item.value?.config)
    countdown.value = countdownConfig(item.value?.config)
    calendarTasks.value = item.value?.config.includeTodos !== false
    query.value = ''
    results.value = []
    searched.value = false
    error.value = ''
  },
)
function close() {
  store.ui.widgetEditor = null
}
async function save() {
  if (!item.value) return
  if (item.value.kind === 'translation' && translationSettings.value) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    const target = item.value
    try {
      const config = await translationSettings.value.save()
      target.config = config
      if (item.value === target) close()
    } catch (e) {
      error.value = e instanceof Error ? e.message : m.value.translation.storageFailed
    } finally {
      busy.value = false
    }
    return
  }
  if (item.value.kind === 'calendar') {
    item.value.config = { ...item.value.config, includeTodos: calendarTasks.value }
    close()
    return
  }
  if (item.value.kind === 'memo' && memoSettings.value) {
    busy.value = true
    error.value = ''
    try {
      item.value.config = await memoSettings.value.save()
      close()
    } catch {
      error.value = m.value.memo.failed
    } finally {
      busy.value = false
    }
    return
  }
  if (advanced.value) {
    error.value = advanced.value.validate()
    if (error.value) return
    item.value.config = advanced.value.value()
    close()
    return
  }
  if (item.value.kind === 'countdown' && !parsePlainDate(countdown.value.date)) {
    error.value = m.value.widget.invalidDate
    return
  }
  item.value.config = JSON.parse(
    JSON.stringify(
      item.value.kind === 'weather'
        ? weather.value
        : item.value.kind === 'quote'
          ? quote.value
          : countdown.value,
    ),
  )
  close()
}
function addCity(city: WeatherCity) {
  if (weather.value.cities.length >= 12) return
  if (
    !weather.value.cities.some(
      (c) => c.latitude === city.latitude && c.longitude === city.longitude,
    )
  )
    weather.value.cities.push(city)
  results.value = []
}
async function search() {
  if (query.value.trim().length < 2) return
  const permission = grantWidgetOrigins(store, weather.value.route, [CITY_ORIGIN])
  cancelRequest()
  ctrl = new AbortController()
  const signal = ctrl.signal
  const token = generation
  busy.value = true
  error.value = ''
  try {
    if (!(await permission)) throw new Error('permission')
    signal.throwIfAborted()
    results.value = await searchCities(
      store,
      weather.value.route,
      query.value.trim(),
      store.lang.value === 'zh-CN' ? 'zh' : 'en',
      signal,
    )
    searched.value = true
  } catch {
    if (!signal.aborted) error.value = m.value.widget.failed
  } finally {
    if (token === generation) busy.value = false
  }
}
async function locate(ip: boolean) {
  const permission = ip ? grantWidgetOrigins(store, weather.value.route, []) : Promise.resolve(true)
  // 浏览器定位申请要保持在这次点击中。
  const location = !ip ? store.platform.location?.locate() : undefined
  cancelRequest()
  ctrl = new AbortController()
  const signal = ctrl.signal
  const token = generation
  busy.value = true
  error.value = ''
  try {
    if (!(await permission)) throw new Error('permission')
    const city = ip
      ? await locateByIp(store, weather.value.route, signal)
      : { ...(await location!), name: m.value.widget.locationName }
    signal.throwIfAborted()
    if (!city || !Number.isFinite(city.latitude)) throw new Error('no-location')
    addCity(city)
  } catch {
    if (!signal.aborted) error.value = m.value.widget.locationFailed
  } finally {
    if (token === generation) busy.value = false
  }
}
function addManual() {
  const lat = Number(latitude.value),
    lon = Number(longitude.value)
  if (
    !manualName.value.trim() ||
    !String(latitude.value).trim() ||
    !String(longitude.value).trim() ||
    !Number.isFinite(lat) ||
    Math.abs(lat) > 90 ||
    !Number.isFinite(lon) ||
    Math.abs(lon) > 180
  ) {
    error.value = m.value.widget.invalidCoordinates
    return
  }
  addCity({ name: manualName.value.trim(), latitude: lat, longitude: lon })
  error.value = ''
}
function onVisibility() {
  if (document.visibilityState !== 'visible') cancelRequest()
}
document.addEventListener('visibilitychange', onVisibility)
onBeforeUnmount(() => {
  cancelRequest()
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <MDialog
    :open="!!item"
    :title="`${item ? t(`widgets.${item.kind}`) : ''} · ${m.widget.settings}`"
    eyebrow="WIDGET / PREFERENCES"
    width="560px"
    @close="close"
  >
    <div v-if="item" class="m-widget-editor">
      <TranslationSettings
        v-if="item.kind === 'translation'"
        :key="item.id"
        ref="translationSettings"
        :initial="item.config"
        :item-id="item.id"
        :form-id="translationFormId"
        @save="save"
      />
      <MemoSettings
        v-if="item.kind === 'memo'"
        :key="item.id"
        ref="memoSettings"
        :initial="item.config"
      />
      <label v-if="item.kind === 'calendar'" class="m-widget-editor__toggle"
        ><span>{{ m.memo.calendar }}</span
        ><MSwitch v-model="calendarTasks" :label="m.memo.calendar"
      /></label>
      <AdvancedWidgetSettings
        v-if="item.kind === 'status' || item.kind === 'minecraft' || item.kind === 'currency'"
        :key="item.id"
        ref="advanced"
        :kind="item.kind"
        :initial="item.config"
      />
      <label v-if="item.kind === 'weather' || item.kind === 'quote'" class="m-field">
        <span>{{ m.widget.source }}</span>
        <select v-if="item.kind === 'weather'" v-model="weather.route" class="m-select">
          <option value="auto">{{ m.widget.autoSource }}</option>
          <option value="direct">{{ m.widget.directSource }}</option>
        </select>
        <select v-else v-model="quote.route" class="m-select">
          <option value="auto">{{ m.widget.autoSource }}</option>
          <option value="direct">{{ m.widget.directSource }}</option>
        </select>
      </label>
      <template v-if="item.kind === 'weather'">
        <form class="m-widget-editor__search" @submit.prevent="search">
          <label class="m-field"
            ><span>{{ m.widget.searchCity }}</span
            ><input v-model="query" class="m-input" :placeholder="m.widget.cityQuery" autofocus
          /></label>
          <button class="m-btn" :disabled="busy || query.trim().length < 2">
            {{ m.widget.searchCity }}
          </button>
        </form>
        <div v-if="results.length" class="m-widget-editor__results">
          <button
            v-for="city in results"
            :key="`${city.latitude}:${city.longitude}`"
            type="button"
            class="m-btn m-btn--small"
            @click="addCity(city)"
          >
            {{ city.name }}
          </button>
        </div>
        <p v-else-if="searched" class="m-widget-editor__hint">{{ m.widget.noCities }}</p>
        <div class="m-widget-editor__buttons">
          <button
            v-if="store.platform.location"
            type="button"
            class="m-btn m-btn--small"
            :disabled="busy"
            @click="locate(false)"
          >
            {{ m.widget.location }}
          </button>
          <button
            v-if="widgetBase(store, weather.route)"
            type="button"
            class="m-btn m-btn--small"
            :disabled="busy"
            @click="locate(true)"
          >
            {{ m.widget.ipLocation }}
          </button>
        </div>
        <details>
          <summary>{{ m.widget.addCoordinates }}</summary>
          <div class="m-widget-editor__manual">
            <label class="m-field"
              ><span>{{ m.widget.cityName }}</span
              ><input v-model="manualName" class="m-input"
            /></label>
            <label class="m-field"
              ><span>{{ m.widget.latitude }}</span
              ><input
                v-model="latitude"
                type="number"
                min="-90"
                max="90"
                step="any"
                class="m-input"
            /></label>
            <label class="m-field"
              ><span>{{ m.widget.longitude }}</span
              ><input
                v-model="longitude"
                type="number"
                min="-180"
                max="180"
                step="any"
                class="m-input"
            /></label>
            <button type="button" class="m-btn m-btn--small" @click="addManual">
              {{ m.common.add }}
            </button>
          </div>
        </details>
        <div class="m-widget-editor__cities">
          <span class="m-widget-editor__hint">{{ m.widget.savedCities }}</span>
          <div v-for="(city, i) in weather.cities" :key="i">
            <span>{{ city.name }}</span
            ><button
              type="button"
              class="m-btn m-btn--small"
              :aria-label="`${m.widget.removeCity} ${city.name}`"
              @click="weather.cities.splice(i, 1)"
            >
              {{ m.common.delete }}
            </button>
          </div>
        </div>
        <label class="m-field"
          ><span>{{ m.widget.unit }}</span
          ><select v-model="weather.unit" class="m-select">
            <option value="celsius">°C</option>
            <option value="fahrenheit">°F</option>
          </select></label
        >
        <div class="m-widget-editor__toggle">
          <span>{{ m.widget.hourly }}</span
          ><MSwitch v-model="weather.hourly" :label="m.widget.hourly" />
        </div>
        <div class="m-widget-editor__toggle">
          <span>{{ m.widget.feelsLike }}</span>
          <MSwitch v-model="weather.apparent" :label="m.widget.feelsLike" />
        </div>
        <div class="m-widget-editor__toggle">
          <span>{{ m.widget.forecast }}</span
          ><MSwitch v-model="weather.forecast" :label="m.widget.forecast" />
        </div>
        <div class="m-widget-editor__toggle">
          <span>{{ m.widget.airQuality }}</span
          ><MSwitch v-model="weather.airQuality" :label="m.widget.airQuality" />
        </div>
        <div class="m-widget-editor__toggle">
          <span>{{ m.widget.sun }}</span
          ><MSwitch v-model="weather.sun" :label="m.widget.sun" />
        </div>
      </template>
      <template v-else-if="item.kind === 'quote'">
        <p class="m-widget-editor__hint">{{ m.widget.quoteCache }}</p>
        <div class="m-widget-editor__toggle">
          <span>{{ m.widget.fromFavorites }}</span
          ><MSwitch v-model="quote.fromFavorites" :label="m.widget.fromFavorites" />
        </div>
        <fieldset class="m-widget-editor__categories">
          <legend>{{ m.widget.quoteCategories }}</legend>
          <label v-for="category in QUOTE_CATEGORIES" :key="category"
            ><input v-model="quote.categories" type="checkbox" :value="category" />{{
              t(`widget.category${category.toUpperCase()}`)
            }}</label
          >
        </fieldset>
        <span class="m-widget-editor__hint">{{ m.widget.favorites }}</span>
        <p v-if="!quote.favorites.length" class="m-widget-editor__hint">
          {{ m.widget.noFavorites }}
        </p>
        <div v-for="(q, i) in quote.favorites" :key="q.id" class="m-widget-editor__favorite">
          <span>{{ q.text }}</span
          ><button type="button" class="m-btn m-btn--small" @click="quote.favorites.splice(i, 1)">
            {{ m.common.delete }}
          </button>
        </div>
      </template>
      <template v-else-if="item.kind === 'countdown'">
        <label class="m-field"
          ><span>{{ m.widget.eventTitle }}</span
          ><input
            v-model="countdown.title"
            class="m-input"
            :placeholder="m.widget.defaultEvent"
            autofocus
        /></label>
        <label class="m-field"
          ><span>{{ m.widget.eventDate }}</span
          ><input
            v-model="countdown.date"
            type="date"
            class="m-input"
            min="1000-01-01"
            max="9999-12-31"
        /></label>
        <label class="m-field"
          ><span>{{ m.widget.repeat }}</span
          ><select v-model="countdown.repeat" class="m-select">
            <option value="none">{{ m.widget.repeatNone }}</option>
            <option value="year">{{ m.widget.repeatYear }}</option>
            <option value="month">{{ m.widget.repeatMonth }}</option>
            <option value="week">{{ m.widget.repeatWeek }}</option>
          </select></label
        >
        <div class="m-widget-editor__toggle">
          <span>{{ m.widget.showElapsed }}</span
          ><MSwitch v-model="countdown.showElapsed" :label="m.widget.showElapsed" />
        </div>
        <p class="m-widget-editor__hint">{{ m.widget.countdownHint }}</p>
        <label class="m-widget-editor__toggle"
          ><span>{{ m.memo.calendar }}</span
          ><MSwitch
            :model-value="countdown.includeTodos !== false"
            :label="m.memo.calendar"
            @update:model-value="countdown.includeTodos = $event"
        /></label>
      </template>
      <p v-if="busy" class="m-widget-editor__hint" role="status">{{ m.widget.loading }}</p>
      <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    </div>
    <template #footer
      ><button type="button" class="m-btn" @click="close">{{ m.common.cancel }}</button
      ><button
        :type="item?.kind === 'translation' ? 'submit' : 'button'"
        :form="item?.kind === 'translation' ? translationFormId : undefined"
        class="m-btn m-btn--primary"
        :disabled="busy"
        @click="item?.kind !== 'translation' && save()"
      >
        {{ m.common.save }}
      </button></template
    >
  </MDialog>
</template>

<style scoped>
.m-widget-editor {
  display: grid;
  gap: 16px;
}
.m-widget-editor__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
}
.m-widget-editor__search {
  display: flex;
  align-items: end;
  gap: 8px;
}
.m-widget-editor__search .m-field {
  flex: 1;
}
.m-widget-editor__results,
.m-widget-editor__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.m-widget-editor__hint {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.m-widget-editor details {
  font-size: 12px;
  color: var(--muted);
}
.m-widget-editor summary {
  cursor: pointer;
}
.m-widget-editor__manual {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}
.m-widget-editor__cities {
  display: grid;
  gap: 8px;
}
.m-widget-editor__cities > div,
.m-widget-editor__favorite {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}
.m-widget-editor__categories {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 12px;
}
.m-widget-editor__categories legend {
  color: var(--muted);
}
.m-widget-editor__categories label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.m-widget-editor__categories input {
  accent-color: var(--blue);
}
</style>
