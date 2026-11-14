<script setup lang="ts">
import {
  countdownConfig,
  resolveCountdown,
  HOLIDAY_SOURCES,
  dateDistance,
  parsePlainDate,
  zonedParts,
  type WidgetItem,
} from '@myriad/core'
import { computed, watch } from 'vue'
import { useNow } from '../../composables/useNow'
import { useStore } from '../../state/store'
import { useI18n } from '../../i18n'
import WidgetHeader from './WidgetHeader.vue'
import { useMemo } from '../../state/memo'
import { useVisibleResource } from '../../composables/useVisibleResource'
import { loadCountdownHolidays } from '../../state/countdown'
import { grantWidgetOrigins, widgetBase } from '../../state/widgetRequests'
const props = defineProps<{ item: WidgetItem }>()
const store = useStore()
const { m, t } = useI18n()
const now = useNow()
const memo = useMemo()
const config = computed(() => countdownConfig(props.item.config))
const today = computed(() => zonedParts(now.value, store.timeZone.value))
const holidayKey = computed(() =>
  config.value.calendar === 'holiday'
    ? `countdown-holidays:${widgetBase(store, 'auto')}:${today.value.year}`
    : null,
)
const {
  root,
  data: holidays,
  error,
  reload,
} = useVisibleResource(
  holidayKey,
  (signal) =>
    loadCountdownHolidays(
      store,
      [today.value.year - 1, today.value.year, today.value.year + 1],
      signal,
    ),
  86400000,
  computed(() => props.item.id),
)
watch(holidays, (days) => {
  if (days) memo.setHolidays(days)
})
async function enable() {
  if (
    await grantWidgetOrigins(
      store,
      'auto',
      HOLIDAY_SOURCES.map((s) => new URL(s).origin),
    )
  )
    void reload()
}
const event = computed(() => resolveCountdown(config.value, today.value, holidays.value))
const tasks = computed(() =>
  config.value.includeTodos === false
    ? []
    : memo.calendarTasks.value
        .map((entry) => ({
          ...entry,
          days: dateDistance(
            zonedParts(now.value, store.timeZone.value),
            parsePlainDate(entry.task.due)!,
          ),
        }))
        .sort((a, b) => a.days - b.days)
        .slice(0, props.item.size.startsWith('4') || props.item.size.endsWith('4') ? 5 : 2),
)
</script>

<template>
  <div
    ref="root"
    class="m-countdown"
    :class="{ 'has-tasks': tasks.length, 'is-today': event?.remaining === 0 }"
    data-widget="countdown"
  >
    <WidgetHeader :item="item" />
    <div v-if="event" class="m-countdown__event">
      <h4>{{ event.title || m.widget.defaultEvent }}</h4>
      <strong
        >{{ Math.abs(event.remaining) }}<small>{{ m.widgets.dayUnit }}</small></strong
      >
      <p v-if="event.remaining === 0">{{ m.widget.eventToday }}</p>
    </div>
    <div v-else class="m-countdown__event">
      <p>
        {{
          config.calendar === 'holiday' ? m.widget.holidayUnavailable : m.widget.lunarUnavailable
        }}
      </p>
      <button
        v-if="error === 'permission'"
        type="button"
        class="m-btn m-btn--small"
        @click="enable"
      >
        {{ m.widget.enable }}
      </button>
    </div>
    <footer v-if="event">
      <span>{{ event.date }}</span>
      <span v-if="config.showElapsed && event.elapsed >= 0">{{
        t(
          !config.title && config.calendar === 'solar' && config.date === '2025-06-20'
            ? 'widget.openingDay'
            : 'widget.elapsed',
          {
            n:
              !config.title && config.calendar === 'solar' && config.date === '2025-06-20'
                ? event.elapsed + 1
                : event.elapsed,
          },
        )
      }}</span>
    </footer>
    <section v-if="tasks.length" class="m-countdown__tasks">
      <span>{{ m.memo.calendarTasks }}</span
      ><button
        v-for="entry in tasks"
        :key="`${entry.listId}:${entry.task.id}`"
        type="button"
        @click="memo.edit(entry.listId, entry.task)"
      >
        <span>{{ entry.task.title }}</span
        ><b>{{
          entry.days === 0
            ? m.widget.eventToday
            : entry.days > 0
              ? t('widget.daysLeft', { n: entry.days })
              : t('widget.daysAgo', { n: -entry.days })
        }}</b>
      </button>
    </section>
  </div>
</template>

<style scoped>
.m-countdown {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px 12px;
  overflow: auto;
}
.is-today {
  background: color-mix(in srgb, var(--blue) 9%, transparent);
}
.m-countdown__event {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  gap: 4px;
}
.m-countdown h4 {
  font-size: 13px;
  font-weight: 500;
  margin: 0;
  overflow-wrap: anywhere;
}
.m-countdown strong {
  color: var(--blue);
  font-size: 48px;
  line-height: 1.15;
  font-weight: 500;
  letter-spacing: -2px;
  font-variant-numeric: tabular-nums;
}
.m-countdown strong small {
  font-size: 12px;
  margin-left: 8px;
  letter-spacing: 0;
  color: var(--muted);
}
.m-countdown p {
  color: var(--muted);
  font-size: 11px;
  margin: 0;
}
.m-countdown footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px;
  font-size: 10px;
  color: var(--muted);
}
.m-countdown__tasks {
  border-top: 1px solid var(--border);
  padding-top: 6px;
  display: grid;
  gap: 5px;
  font-size: 10px;
  color: var(--muted);
}
.m-countdown__tasks button {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  color: var(--text);
  font-size: 11px;
}
.m-countdown__tasks button > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-countdown__tasks b {
  font-weight: 400;
  color: var(--muted);
  white-space: nowrap;
}
.has-tasks .m-countdown__event {
  flex: 0;
}
.has-tasks strong {
  font-size: 36px;
}
</style>
