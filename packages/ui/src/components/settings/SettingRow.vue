<script setup lang="ts">
defineProps<{ label: string; desc?: string; stacked?: boolean }>()
</script>

<template>
  <div class="m-row" :class="{ 'is-stacked': stacked }">
    <div class="m-row__text">
      <span class="m-row__label">{{ label }}</span>
      <span v-if="desc" class="m-row__desc">{{ desc }}</span>
    </div>
    <div class="m-row__control">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.m-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 52px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.m-row:last-child {
  border-bottom: 0;
}
.m-row.is-stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}
.m-row__text {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.m-row__label {
  font-size: 13.5px;
  font-weight: 550;
}
.m-row__desc {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
.m-row__control {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  max-width: 100%;
}
.m-row.is-stacked .m-row__control {
  justify-content: flex-start;
  flex-wrap: wrap;
}
</style>
