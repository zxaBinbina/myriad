<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  label: string
  points: { x: number; y: number | null }[]
  unit?: string
}>()
const valid = computed(() => props.points.filter((p) => Number.isFinite(p.x)))
const domain = computed(() => {
  const values = valid.value
    .map((p) => p.y)
    .filter((y): y is number => y !== null && Number.isFinite(y))
  const min = Math.min(...values),
    max = Math.max(...values),
    pad = (max - min) * 0.12 || Math.max(Math.abs(max) * 0.02, 0.000001)
  return {
    min: min - pad,
    max: max + pad,
    left: Math.min(...valid.value.map((p) => p.x)),
    right: Math.max(...valid.value.map((p) => p.x)),
  }
})
const lines = computed(() => {
  const d = domain.value
  const out: string[] = []
  let current: string[] = []
  for (const p of valid.value) {
    if (p.y === null || !Number.isFinite(p.y)) {
      if (current.length) out.push(current.join(' '))
      current = []
      continue
    }
    const x = 4 + ((p.x - d.left) / (d.right - d.left || 1)) * 292
    const y = 64 - ((p.y - d.min) / (d.max - d.min || 1)) * 58
    current.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  if (current.length) out.push(current.join(' '))
  return out
})
const latest = computed(() => valid.value.filter((p) => p.y !== null).at(-1)?.y)
</script>
<template>
  <figure class="m-history-chart">
    <figcaption>
      {{ label
      }}<span v-if="latest !== undefined && latest !== null"
        >{{ latest.toLocaleString(undefined, { maximumFractionDigits: 6 }) }}{{ unit }}</span
      >
    </figcaption>
    <svg
      v-if="lines.length"
      viewBox="0 0 300 72"
      role="img"
      :aria-label="label"
      preserveAspectRatio="none"
    >
      <path d="M0 70H300" class="m-history-chart__axis" />
      <polyline
        v-for="(line, i) in lines"
        :key="i"
        :points="line"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  </figure>
</template>
<style scoped>
.m-history-chart {
  margin: 0;
  min-width: 0;
}
.m-history-chart figcaption {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 10px;
}
.m-history-chart svg {
  display: block;
  width: 100%;
  height: 72px;
  overflow: visible;
}
.m-history-chart polyline {
  fill: none;
  stroke: var(--blue);
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.m-history-chart__axis {
  stroke: var(--border);
  fill: none;
}
</style>
