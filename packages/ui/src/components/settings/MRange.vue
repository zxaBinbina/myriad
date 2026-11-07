<script setup lang="ts">
defineProps<{
  min: number
  max: number
  step: number
  label: string
  format?: (v: number) => string
}>()
const model = defineModel<number>({ required: true })
</script>

<template>
  <span class="m-range">
    <input
      v-model.number="model"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :aria-label="label"
    />
    <output>{{ format ? format(model) : model }}</output>
  </span>
</template>

<style scoped>
.m-range {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.m-range input {
  width: 150px;
  accent-color: var(--blue);
}
.m-range output {
  min-width: 42px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 12px;
  text-align: right;
}
</style>
