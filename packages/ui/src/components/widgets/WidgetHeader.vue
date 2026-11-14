<script setup lang="ts">
import { Settings2 } from '@lucide/vue'
import type { WidgetItem } from '@myriad/core'
import { useI18n } from '../../i18n'
import { useStore } from '../../state/store'
defineProps<{ item: WidgetItem; title?: string }>()
const store = useStore()
const { m, t } = useI18n()
</script>

<template>
  <header class="m-widget-head">
    <div class="m-widget-head__label">
      <h3>{{ title || t(`widgets.${item.kind}`) }}</h3>
    </div>
    <div class="m-widget-head__actions">
      <slot />
      <button
        type="button"
        class="m-icon-btn m-icon-btn--small"
        :aria-label="m.widget.settings"
        :title="m.widget.settings"
        @click="store.ui.widgetEditor = item.id"
      >
        <Settings2 :size="15" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.m-widget-head {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}
.m-widget-head__label {
  min-width: 0;
}
.m-widget-head h3 {
  margin: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-widget-head__actions {
  display: flex;
  flex: none;
  gap: 0;
}
</style>
