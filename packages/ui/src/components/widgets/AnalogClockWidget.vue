<script setup lang="ts">
import { type WidgetItem, zonedParts } from '@myriad/core'
import { computed } from 'vue'
import { useNow } from '../../composables/useNow'
import { useI18n } from '../../i18n'
import { useStore } from '../../state/store'

defineProps<{ item: WidgetItem }>()
const store = useStore()
const { m } = useI18n()
const now = useNow()

const showSeconds = computed(() => store.settings.clock.showSeconds)
const parts = computed(() => zonedParts(now.value, store.timeZone.value))
const hands = computed(() => {
  const p = parts.value
  return {
    hour: ((p.hour % 12) + p.minute / 60) * 30,
    minute: (p.minute + p.second / 60) * 6,
    second: p.second * 6,
  }
})
const label = computed(() => {
  const p = parts.value
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
})
const weekday = computed(() => m.value.clock.weekdays[parts.value.weekday]!)
</script>

<template>
  <div class="m-aclock" role="img" :aria-label="label">
    <svg class="m-aclock__face" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="47" class="m-aclock__dial" />
      <line
        v-for="i in 60"
        :key="i"
        x1="50"
        :y1="i % 5 === 0 ? 7 : 7.5"
        x2="50"
        :y2="i % 15 === 0 ? 15 : i % 5 === 0 ? 12.5 : 9.5"
        class="m-aclock__tick"
        :class="{ 'is-major': i % 5 === 0 }"
        :transform="`rotate(${i * 6} 50 50)`"
      />
      <text x="50" y="66" class="m-aclock__day">{{ weekday }}</text>
      <line
        x1="50"
        y1="53"
        x2="50"
        y2="28"
        class="m-aclock__hand m-aclock__hand--hour"
        :transform="`rotate(${hands.hour} 50 50)`"
      />
      <line
        x1="50"
        y1="54"
        x2="50"
        y2="16"
        class="m-aclock__hand m-aclock__hand--minute"
        :transform="`rotate(${hands.minute} 50 50)`"
      />
      <line
        v-if="showSeconds"
        x1="50"
        y1="59"
        x2="50"
        y2="12"
        class="m-aclock__hand m-aclock__hand--second"
        :transform="`rotate(${hands.second} 50 50)`"
      />
      <circle cx="50" cy="50" r="2.6" class="m-aclock__pin" />
    </svg>
  </div>
</template>

<style scoped>
.m-aclock {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 10px;
}
.m-aclock__face {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
}
.m-aclock__dial {
  fill: color-mix(in srgb, var(--panel) 55%, transparent);
  stroke: var(--border);
  stroke-width: 1;
}
.m-aclock__tick {
  stroke: var(--muted);
  stroke-width: 0.8;
  stroke-linecap: round;
  opacity: 0.6;
}
.m-aclock__tick.is-major {
  stroke: var(--text);
  stroke-width: 1.8;
  opacity: 0.85;
}
.m-aclock__day {
  fill: var(--muted);
  font-size: 6.5px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-anchor: middle;
}
.m-aclock__hand {
  stroke: var(--text);
  stroke-linecap: round;
}
.m-aclock__hand--hour {
  stroke-width: 4;
}
.m-aclock__hand--minute {
  stroke-width: 2.6;
}
.m-aclock__hand--second {
  stroke: var(--blue);
  stroke-width: 1.1;
}
.m-aclock__pin {
  fill: var(--blue);
}
</style>
