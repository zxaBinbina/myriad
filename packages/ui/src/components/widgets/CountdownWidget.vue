<script setup lang="ts">
import {
  countdownConfig,
  countdownOccurrence,
  dateDistance,
  parsePlainDate,
  zonedParts,
  type WidgetItem,
} from '@myriad/core'
import { computed } from 'vue'
import { useNow } from '../../composables/useNow'
import { useStore } from '../../state/store'
import { useI18n } from '../../i18n'
import WidgetHeader from './WidgetHeader.vue'
import { useMemo } from '../../state/memo'
const props = defineProps<{ item: WidgetItem }>()
const store = useStore()
const { m, t } = useI18n()
const now = useNow()
const memo = useMemo()
const config = computed(() => countdownConfig(props.item.config))
const event = computed(() =>
  countdownOccurrence(config.value, zonedParts(now.value, store.timeZone.value)),
)
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
  <div class="m-countdown" :class="{ 'has-tasks': tasks.length }" data-widget="countdown">
    <WidgetHeader :item="item" />
    <div class="m-countdown__event">
      <h4>{{ config.title || m.widget.defaultEvent }}</h4>
      <strong
        >{{ Math.abs(event.remaining) }}<small>{{ m.widgets.dayUnit }}</small></strong
      >
      <p v-if="event.remaining === 0">{{ m.widget.eventToday }}</p>
    </div>
    <footer>
      <span>{{ event.date }}</span>
      <span v-if="config.showElapsed && event.elapsed >= 0">{{
        t(!config.title && config.date === '2025-06-20' ? 'widget.openingDay' : 'widget.elapsed', {
          n: !config.title && config.date === '2025-06-20' ? event.elapsed + 1 : event.elapsed,
        })
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
