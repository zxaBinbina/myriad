<script setup lang="ts">
import { X } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import { WIDGETS } from './widgets/registry'

const store = useStore()
const { m } = useI18n()

const widgets = computed(() =>
  store.activeGroup.value.items
    .map((id) => store.data.items[id])
    .filter((it) => it?.type === 'widget'),
)
</script>

<template>
  <Transition name="m-dash">
    <div
      v-if="store.ui.dashboardOpen"
      class="m-dash-layer"
      @pointerdown.self="store.ui.dashboardOpen = false"
      @keydown.esc="store.ui.dashboardOpen = false"
    >
      <aside class="m-dash m-glass" role="dialog" :aria-label="m.widgets.dashboard" tabindex="-1">
        <header class="m-dash__head">
          <div>
            <p class="m-eyebrow">DASHBOARD</p>
            <h2 class="m-dash__title">
              {{ m.widgets.dashboard }} · {{ store.activeGroup.value.name }}
            </h2>
          </div>
          <button
            type="button"
            class="m-icon-btn"
            :aria-label="m.common.close"
            @click="store.ui.dashboardOpen = false"
          >
            <X :size="20" />
          </button>
        </header>
        <div class="m-dash__body">
          <div v-for="w in widgets" :key="w!.id" class="m-dash__card m-card">
            <component
              :is="WIDGETS[w!.kind].component"
              v-if="w?.type === 'widget'"
              :item="{ ...w, size: '4x2' }"
            />
          </div>
          <p v-if="!widgets.length" class="m-dash__empty">{{ m.widgets.dashboardEmpty }}</p>
        </div>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.m-dash-layer {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgb(5 6 12 / 22%);
}
.m-dash {
  position: absolute;
  top: 12px;
  left: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  width: min(440px, calc(100vw - 24px));
  border-radius: 26px;
  outline: none;
}
.m-dash__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 18px 10px 24px;
}
.m-dash__title {
  margin: 2px 0 0;
  font-size: 20px;
  font-weight: 650;
}
.m-dash__body {
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 6px 18px 18px;
  overflow: auto;
}
.m-dash__card {
  height: 220px;
  overflow: hidden;
}
.m-dash__empty {
  color: var(--muted);
  text-align: center;
}
.m-dash-enter-active,
.m-dash-leave-active {
  transition: opacity 0.3s ease;
}
.m-dash-enter-active .m-dash,
.m-dash-leave-active .m-dash {
  transition: transform 0.42s var(--motion-ease);
}
.m-dash-enter-from,
.m-dash-leave-to {
  opacity: 0;
}
.m-dash-enter-from .m-dash,
.m-dash-leave-to .m-dash {
  transform: translateX(calc(-100% - 24px));
}
@media (prefers-reduced-motion: reduce) {
  .m-dash-enter-active,
  .m-dash-leave-active,
  .m-dash-enter-active .m-dash,
  .m-dash-leave-active .m-dash {
    transition: none;
  }
}
</style>
