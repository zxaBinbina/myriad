<script setup lang="ts">
import {
  dayOfYear,
  festivalsOn,
  isoWeek,
  type PlainDate,
  toLunar,
  ymd,
  zonedParts,
  ZODIAC_EN,
} from '@myriad/core'
import { computed } from 'vue'
import { useHolidays } from '../composables/useHolidays'
import { useNow } from '../composables/useNow'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'

const store = useStore()
const { m, t, lang } = useI18n()
const now = useNow()
const emit = defineEmits<{ secret: [] }>()

const c = computed(() => store.settings.clock)
const parts = computed(() => zonedParts(now.value, store.timeZone.value))
const today = computed<PlainDate>(() => ({
  year: parts.value.year,
  month: parts.value.month,
  day: parts.value.day,
}))

const pad = (n: number) => String(n).padStart(2, '0')
const time = computed(() => {
  const p = parts.value
  let h = p.hour
  if (c.value.hour12) h = h % 12 || 12
  const main = `${c.value.hour12 ? h : pad(h)}:${pad(p.minute)}`
  return {
    main,
    seconds: pad(p.second),
    meridiem: p.hour < 12 ? m.value.clock.am : m.value.clock.pm,
  }
})

const holidayYears = computed(() => [today.value.year])
const holidays = useHolidays(holidayYears, store.showHolidays)
const holiday = computed(() => holidays.value[ymd(today.value)])

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

const dateLine = computed(() => {
  const d = today.value
  const out: string[] = []
  if (c.value.showDate) {
    out.push(
      t('clock.dateFormat', { month: d.month, day: d.day, monthName: MONTHS_EN[d.month - 1]! }),
    )
  }
  if (c.value.showWeekday) out.push(m.value.clock.weekdays[parts.value.weekday]!)
  return out.join(' ')
})

const lunarLine = computed(() => {
  if (!store.showLunar.value) return ''
  const l = toLunar(today.value)
  if (!l) return ''
  const year = c.value.ganzhi
    ? lang.value === 'en'
      ? `${l.yearName} (${ZODIAC_EN['鼠牛虎兔龙蛇马羊猴鸡狗猪'.indexOf(l.zodiac)]}) `
      : `${l.yearName}${l.zodiac}年 `
    : ''
  return `${m.value.clock.lunarPrefix} ${year}${l.monthName}${l.dayName}`
})

const festivals = computed(() =>
  festivalsOn(today.value, {
    lunar: c.value.festivals && store.showLunar.value,
    solar: c.value.festivals,
    terms: c.value.solarTerms && store.showLunar.value,
  }).map((f) => (lang.value === 'en' && f.nameEn ? f.nameEn : f.name)),
)

const meta = computed(() => {
  const out: string[] = []
  if (c.value.dayOfYear) out.push(t('clock.dayOfYear', { n: dayOfYear(today.value) }))
  if (c.value.weekNumber) out.push(t('clock.weekNumber', { n: isoWeek(today.value).week }))
  return out
})

const extra = computed(() =>
  c.value.extraZones
    .map((z) => {
      try {
        const p = zonedParts(now.value, z.zone)
        const h = c.value.hour12 ? p.hour % 12 || 12 : p.hour
        return {
          label: z.label || z.zone.split('/').pop()!.replace(/_/g, ' '),
          time: `${c.value.hour12 ? h : pad(h)}:${pad(p.minute)}`,
          pm: p.hour >= 12,
        }
      } catch {
        return null
      }
    })
    .filter((x) => !!x),
)

/* 连续点击 5 次触发隐藏入口（网站版登录） */
let clicks = 0
let clickTimer: ReturnType<typeof setTimeout> | undefined
function onClockClick() {
  clicks++
  clearTimeout(clickTimer)
  clickTimer = setTimeout(() => (clicks = 0), 1200)
  if (clicks >= 5) {
    clicks = 0
    emit('secret')
  }
}

const fullLabel = computed(() =>
  [
    `${c.value.hour12 ? time.value.meridiem + ' ' : ''}${time.value.main}`,
    dateLine.value,
    lunarLine.value,
    ...festivals.value,
  ]
    .filter(Boolean)
    .join('，'),
)
</script>

<template>
  <section class="m-clock" :aria-label="fullLabel" @click="onClockClick">
    <div v-if="c.showTime" class="m-clock__face" aria-hidden="true">
      <span v-if="c.hour12" class="m-clock__meridiem">{{ time.meridiem }}</span>
      <span class="m-clock__time">{{ time.main }}</span>
      <span v-if="c.showSeconds" class="m-clock__seconds">{{ time.seconds }}</span>
    </div>
    <p class="m-clock__date" aria-hidden="true">
      <span v-if="dateLine">{{ dateLine }}</span>
      <span v-if="lunarLine">{{ lunarLine }}</span>
      <span v-for="f in festivals" :key="f" class="m-clock__festival">{{ f }}</span>
      <span
        v-if="holiday"
        class="m-clock__holiday"
        :class="holiday.off ? 'is-off' : 'is-work'"
        :title="t(holiday.off ? 'clock.offDay' : 'clock.workDay', { name: holiday.name })"
      >
        {{ holiday.off ? m.clock.off : m.clock.work }}
      </span>
      <span v-for="x in meta" :key="x" class="m-clock__meta">{{ x }}</span>
    </p>
    <p v-if="extra.length" class="m-clock__zones" aria-hidden="true">
      <span v-for="z in extra" :key="z.label">
        <b>{{ z.label }}</b> {{ z.time }}<small v-if="c.hour12">{{ z.pm ? 'PM' : 'AM' }}</small>
      </span>
    </p>
  </section>
</template>

<style scoped>
.m-clock {
  display: grid;
  justify-items: center;
  gap: 6px;
  color: var(--text);
  text-align: center;
}
.m-clock__face {
  display: flex;
  align-items: baseline;
  gap: 10px;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}
.m-clock__time {
  background: linear-gradient(
    110deg,
    var(--title-gradient-start),
    var(--title-gradient-mid) 58%,
    var(--title-gradient-end)
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-size: clamp(52px, 6vw, 84px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -2px;
  line-height: 1.05;
}
.m-clock__seconds {
  min-width: 2ch;
  color: var(--muted);
  font-size: clamp(20px, 2vw, 28px);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.m-clock__meridiem {
  color: var(--muted);
  font-size: clamp(14px, 1.4vw, 18px);
  font-weight: 600;
  letter-spacing: 1px;
}
.m-clock__date,
.m-clock__zones {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px 14px;
  margin: 0;
  color: var(--muted);
  font-size: 13.5px;
}
.m-clock__festival {
  color: var(--blue);
  font-weight: 600;
}
.m-clock__holiday {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 700;
}
.m-clock__holiday.is-off {
  background: color-mix(in srgb, var(--status-success) 18%, transparent);
  color: var(--status-success);
}
.m-clock__holiday.is-work {
  background: color-mix(in srgb, var(--status-danger) 18%, transparent);
  color: var(--status-danger);
}
.m-clock__meta {
  font-family: var(--font-mono);
  font-size: 12px;
}
.m-clock__zones b {
  font-weight: 600;
  color: var(--text);
}
.m-clock__zones small {
  margin-left: 2px;
  font-size: 10px;
}
:global(.myriad.has-wallpaper .m-clock__date),
:global(.myriad.has-wallpaper .m-clock__zones),
:global(.myriad.has-wallpaper .m-clock__seconds),
:global(.myriad.has-wallpaper .m-clock__meridiem) {
  color: var(--on-wallpaper-muted);
  text-shadow: 0 1px 3px rgb(0 0 0 / 30%);
}
:global(.myriad.has-wallpaper .m-clock__time) {
  background: none;
  color: var(--on-wallpaper);
  text-shadow: 0 2px 18px rgb(0 0 0 / 25%);
}
:global(.myriad.has-wallpaper .m-clock__zones b) {
  color: var(--on-wallpaper);
}
</style>
