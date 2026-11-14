<script setup lang="ts">
import { useI18n } from '../../i18n'
defineProps<{ error: string; loading: boolean; empty?: boolean; failureText?: string }>()
const emit = defineEmits<{ enable: []; retry: [] }>()
const { m } = useI18n()
</script>
<template>
  <div v-if="error || (empty && loading)" class="m-widget-state" aria-live="polite">
    <p>
      {{
        error === 'permission'
          ? m.widget.enable
          : error
            ? failureText || m.widget.failed
            : m.widget.loading
      }}
    </p>
    <button
      v-if="error"
      type="button"
      class="m-btn m-btn--small"
      @click="error === 'permission' ? emit('enable') : emit('retry')"
    >
      {{ error === 'permission' ? m.widget.enable : m.widget.retry }}
    </button>
  </div>
</template>
<style scoped>
.m-widget-state {
  color: var(--muted);
  font-size: 12px;
  display: grid;
  justify-items: start;
  gap: 8px;
}
.m-widget-state p {
  margin: 0;
}
</style>
