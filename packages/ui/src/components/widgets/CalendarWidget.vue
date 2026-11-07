<script setup lang="ts">
import {
  addDays,
  daysInMonth,
  festivalsOn,
  type PlainDate,
  toLunar,
  weekdayOf,
  type WidgetItem,
  ymd,
  zonedParts,
} from '@myriad/core'
import { ChevronLeft, ChevronRight, RotateCcw } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useHolidays } from '../../composables/useHolidays'
import { useNow } from '../../composables/useNow'
import { useI18n } from '../../i18n'
import { useStore } from '../../state/store'
import { widgetSpan } from './registry'

const props = defineProps<{ item: WidgetItem }>()
const store = useStore()
const { m, t, lang } = useI18n()
const now = useNow()

const span = computed(() => widgetSpan(props.item.size))
const wide = computed(() => span.value.w >= 4)
const tall = computed(() => span.value.h >= 4)

const today = computed<PlainDate>(() => {
  const p = zonedParts(now.value, store.timeZone.value)
  return { year: p.year, month: p.month, day: p.day }
})
const offset = ref(0)
const view = computed(() => {
  let y = today.value.year
  let mo = today.value.month + offset.value
  while (mo < 1) {
    mo += 12
    y--
  }
  while (mo > 12) {
    mo -= 12
    y++
  }
  return { year: y, month: mo }
})

const UPCOMING_DAYS = 60
const UPCOMING_MAX = 8

const holidays = useHolidays(
  computed(() => [
    ...new Set([view.value.year, today.value.year, addDays(today.value, UPCOMING_DAYS).year]),
  ]),
  store.showHolidays,
)

const weekStart = computed(() => store.settings.clock.weekStart)
const weekHeads = computed(() => {
  const names = m.value.clock.weekdaysShort
  return Array.from({ length: 7 }, (_, i) => names[(i + weekStart.value) % 7]!)
})

interface Cell {
  date: PlainDate
  key: string
  inMonth: boolean
  isToday: boolean
  weekend: boolean
  sub: string
  festival: boolean
  holiday?: { off: boolean; name: string }
}

const cells = computed<Cell[]>(() => {
  const first = { year: view.value.year, month: view.value.month, day: 1 }
  const lead = (weekdayOf(first) - weekStart.value + 7) % 7
  const total = Math.ceil((lead + daysInMonth(first.year, first.month)) / 7) * 7
  const start = addDays(first, -lead)
  const showLunar = store.showLunar.value
  const c = store.settings.clock
  return Array.from({ length: total }, (_, i) => {
    const date = addDays(start, i)
    const key = ymd(date)
    const fest = festivalsOn(date, {
      lunar: c.festivals && showLunar,
      solar: c.festivals,
      terms: c.solarTerms && showLunar,
    })
    let sub = ''
    let festival = false
    if (fest.length) {
      sub = lang.value === 'en' ? (fest[0]!.nameEn ?? fest[0]!.name) : fest[0]!.name
      festival = true
    } else if (showLunar) {
      const l = toLunar(date)
      if (l) sub = l.day === 1 ? l.monthName : l.dayName
    }
    const wd = weekdayOf(date)
    return {
      date,
      key,
      inMonth: date.month === view.value.month,
      isToday: key === ymd(today.value),
      weekend: wd === 0 || wd === 6,
      sub,
      festival,
      holiday: holidays.value[key],
    }
  })
})

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const title = computed(() =>
  t('clock.monthTitle', {
    year: view.value.year,
    month: view.value.month,
    monthName: MONTHS_EN[view.value.month - 1]!,
  }),
)

const selected = ref<string | null>(null)
const detail = computed(() => {
  const key = selected.value ?? ymd(today.value)
  const cell = cells.value.find((c) => c.key === key)
  const date = cell?.date ?? today.value
  const l = store.showLunar.value ? toLunar(date) : null
  const fest = festivalsOn(date, {
    lunar: store.showLunar.value,
    terms: store.showLunar.value,
  }).map((f) => (lang.value === 'en' && f.nameEn ? f.nameEn : f.name))
  return {
    day: date.day,
    weekday: m.value.clock.weekdays[weekdayOf(date)]!,
    month: t('clock.monthTitle', {
      year: date.year,
      month: date.month,
      monthName: MONTHS_EN[date.month - 1]!,
    }),
    lunar: l ? `${l.yearName}${l.zodiac}年 ${l.monthName}${l.dayName}` : '',
    fest,
    holiday: holidays.value[ymd(date)],
  }
})

/* 4×4：未来两个月的节日、节气与法定假期（只列放假首日） */
interface Upcoming {
  key: string
  name: string
  date: string
  days: number
  tone: 'fest' | 'term' | 'off'
}
const upcoming = computed<Upcoming[]>(() => {
  if (!(wide.value && tall.value)) return []
  const showLunar = store.showLunar.value
  const c = store.settings.clock
  const out: Upcoming[] = []
  const fmt = (d: PlainDate) => `${d.month}/${d.day} ${m.value.clock.weekdaysShort[weekdayOf(d)]!}`
  for (let i = 0; i <= UPCOMING_DAYS && out.length < UPCOMING_MAX; i++) {
    const date = addDays(today.value, i)
    const key = ymd(date)
    const seen = new Set<string>()
    const hol = holidays.value[key]
    if (hol?.off && holidays.value[ymd(addDays(date, -1))]?.name !== hol.name) {
      seen.add(hol.name)
      out.push({ key: `${key}-h`, name: hol.name, date: fmt(date), days: i, tone: 'off' })
    }
    const fest = festivalsOn(date, {
      lunar: c.festivals && showLunar,
      solar: c.festivals,
      terms: c.solarTerms && showLunar,
    })
    for (const f of fest) {
      if (seen.has(f.name)) continue
      seen.add(f.name)
      out.push({
        key: `${key}-${f.name}`,
        name: lang.value === 'en' && f.nameEn ? f.nameEn : f.name,
        date: fmt(date),
        days: i,
        tone: f.kind === 'term' ? 'term' : 'fest',
      })
    }
  }
  return out.slice(0, UPCOMING_MAX)
})
</script>

<template>
  <div class="m-cal" :class="{ 'is-wide': wide, 'is-tall': tall }" data-no-wheel>
    <div class="m-cal__main">
      <aside v-if="wide" class="m-cal__today">
        <p class="m-eyebrow">{{ detail.month }}</p>
        <p class="m-cal__big">{{ detail.day }}</p>
        <p class="m-cal__weekday">{{ detail.weekday }}</p>
        <p v-if="detail.lunar" class="m-cal__lunar">{{ detail.lunar }}</p>
        <p v-for="f in detail.fest" :key="f" class="m-cal__fest">{{ f }}</p>
        <p
          v-if="detail.holiday"
          class="m-cal__hol"
          :class="detail.holiday.off ? 'is-off' : 'is-work'"
        >
          {{
            t(detail.holiday.off ? 'clock.offDay' : 'clock.workDay', { name: detail.holiday.name })
          }}
        </p>
      </aside>
      <div class="m-cal__month">
        <header class="m-cal__head">
          <span class="m-cal__title">{{ title }}</span>
          <button
            v-if="offset"
            type="button"
            class="m-icon-btn m-icon-btn--small"
            :aria-label="m.clock.backToday"
            :title="m.clock.backToday"
            @click="offset = 0"
          >
            <RotateCcw :size="14" />
          </button>
          <button
            type="button"
            class="m-icon-btn m-icon-btn--small"
            :aria-label="m.clock.prevMonth"
            @click="offset--"
          >
            <ChevronLeft :size="16" />
          </button>
          <button
            type="button"
            class="m-icon-btn m-icon-btn--small"
            :aria-label="m.clock.nextMonth"
            @click="offset++"
          >
            <ChevronRight :size="16" />
          </button>
        </header>
        <div class="m-cal__grid" role="grid" :aria-label="title">
          <span v-for="h in weekHeads" :key="h" class="m-cal__wh" role="columnheader">{{ h }}</span>
          <button
            v-for="c in cells"
            :key="c.key"
            type="button"
            class="m-cal__day"
            role="gridcell"
            :class="{
              'is-out': !c.inMonth,
              'is-today': c.isToday,
              'is-weekend': c.weekend,
              'is-selected': selected === c.key,
              'is-off': c.holiday?.off,
              'is-work': c.holiday && !c.holiday.off,
            }"
            :aria-label="`${c.key} ${c.sub}`"
            @click="selected = c.key"
          >
            <span class="m-cal__num">{{ c.date.day }}</span>
            <span
              v-if="c.sub && (wide || tall)"
              class="m-cal__sub"
              :class="{ 'is-fest': c.festival }"
              >{{ c.sub }}</span
            >
            <span v-if="c.holiday" class="m-cal__badge">{{
              c.holiday.off ? m.clock.off : m.clock.work
            }}</span>
          </button>
        </div>
      </div>
    </div>
    <section v-if="wide && tall" class="m-cal__upcoming" :aria-label="m.widgets.upcoming">
      <p class="m-eyebrow">{{ m.widgets.upcoming }}</p>
      <ul v-if="upcoming.length" class="m-cal__list">
        <li v-for="u in upcoming" :key="u.key" class="m-cal__event" :class="`is-${u.tone}`">
          <span class="m-cal__event-dot" aria-hidden="true" />
          <span class="m-cal__event-name">{{ u.name }}</span>
          <span class="m-cal__event-date">{{ u.date }}</span>
          <span class="m-cal__event-days">{{
            u.days === 0 ? m.widgets.todayTag : t('widgets.inDays', { n: u.days })
          }}</span>
        </li>
      </ul>
      <p v-else class="m-cal__none">{{ m.widgets.upcomingEmpty }}</p>
    </section>
  </div>
</template>

<style scoped>
.m-cal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 12px 14px;
  font-size: 12px;
}
.m-cal__main {
  display: flex;
  flex: 1;
  gap: 16px;
  min-height: 0;
}
.m-cal__upcoming {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.m-cal__upcoming .m-eyebrow {
  margin: 0;
}
.m-cal__list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.m-cal__event {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  line-height: 1.6;
}
.m-cal__event-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--blue);
}
.m-cal__event.is-term .m-cal__event-dot {
  background: var(--muted);
}
.m-cal__event.is-off .m-cal__event-dot {
  background: var(--status-success);
}
.m-cal__event-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.m-cal__event-date {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.m-cal__event-days {
  min-width: 4.5em;
  color: var(--muted);
  font-size: 11px;
  text-align: right;
  white-space: nowrap;
}
.m-cal__none {
  margin: 0;
  color: var(--muted);
}
.m-cal__today {
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 38%;
  min-width: 0;
  padding-right: 14px;
  border-right: 1px solid var(--border);
}
.m-cal__today p {
  margin: 0;
}
.m-cal__big {
  background: linear-gradient(
    110deg,
    var(--title-gradient-start),
    var(--title-gradient-mid) 58%,
    var(--title-gradient-end)
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-size: 56px;
  font-weight: 800;
  line-height: 1.1;
}
.m-cal__weekday {
  font-size: 15px;
  font-weight: 650;
}
.m-cal__lunar {
  margin-top: 6px !important;
  color: var(--muted);
}
.m-cal__fest {
  color: var(--blue);
  font-weight: 600;
}
.m-cal__hol.is-off {
  color: var(--status-success);
}
.m-cal__hol.is-work {
  color: var(--status-danger);
}
.m-cal__month {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.m-cal__head {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-bottom: 4px;
}
.m-cal__title {
  flex: 1;
  font-size: 13px;
  font-weight: 650;
}
.m-cal__grid {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 1fr;
  gap: 1px;
}
.m-cal__wh {
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 10.5px;
}
.m-cal__day {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  line-height: 1.1;
}
.m-cal__day:hover {
  background: var(--interactive-hover);
}
.m-cal__day.is-out {
  opacity: 0.35;
}
.m-cal__day.is-weekend .m-cal__num {
  color: var(--muted);
}
.m-cal__day.is-selected {
  box-shadow: inset 0 0 0 1px var(--blue);
}
.m-cal__day.is-today {
  background: var(--primary-action);
  color: var(--primary-action-text);
}
.m-cal__day.is-today .m-cal__num,
.m-cal__day.is-today .m-cal__sub {
  color: inherit;
}
.m-cal__day.is-off:not(.is-today) {
  background: color-mix(in srgb, var(--status-success) 12%, transparent);
}
.m-cal__day.is-work:not(.is-today) {
  background: color-mix(in srgb, var(--status-danger) 10%, transparent);
}
.m-cal__num {
  font-size: 12.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.is-tall .m-cal__num {
  font-size: 15px;
}
.m-cal__sub {
  max-width: 100%;
  overflow: hidden;
  color: var(--muted);
  font-size: 9.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.is-tall .m-cal__sub {
  font-size: 10.5px;
}
.m-cal__sub.is-fest {
  color: var(--blue);
}
.m-cal__badge {
  position: absolute;
  top: 1px;
  right: 2px;
  font-size: 8.5px;
  font-weight: 700;
}
.m-cal__day.is-off .m-cal__badge {
  color: var(--status-success);
}
.m-cal__day.is-work .m-cal__badge {
  color: var(--status-danger);
}
.m-cal__day.is-today .m-cal__badge {
  color: inherit;
}
</style>
