<script setup lang="ts">
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, Moon, Sun } from '@lucide/vue'
import { weatherCondition } from '@myriad/core'
import { computed } from 'vue'
const props = withDefaults(defineProps<{ code: number | null; isDay?: boolean; size?: number }>(), {
  isDay: true,
  size: 24,
})
const icon = computed(
  () =>
    ({
      clear: props.isDay ? Sun : Moon,
      cloudy: Cloud,
      fog: CloudFog,
      rain: CloudRain,
      snow: CloudSnow,
      thunder: CloudLightning,
    })[weatherCondition(props.code)] ?? Cloud,
)
</script>
<template><component :is="icon" :size="size" :stroke-width="1.6" aria-hidden="true" /></template>
