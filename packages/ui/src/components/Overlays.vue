<script setup lang="ts">
import { CircleAlert, CircleCheck, Info } from '@lucide/vue'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import MDialog from './base/MDialog.vue'

const store = useStore()
const { m } = useI18n()
</script>

<template>
  <div class="m-toasts" role="status" aria-live="polite">
    <TransitionGroup name="m-toast">
      <div v-for="t in store.ui.toasts" :key="t.id" class="m-toast m-glass" :class="`is-${t.tone}`">
        <CircleCheck v-if="t.tone === 'success'" :size="16" />
        <CircleAlert v-else-if="t.tone === 'error'" :size="16" />
        <Info v-else :size="16" />
        <span>{{ t.text }}</span>
      </div>
    </TransitionGroup>
  </div>

  <MDialog
    :open="!!store.ui.confirm"
    :title="store.ui.confirm?.title ?? m.common.confirmDelete"
    width="420px"
    @close="store.ui.confirm?.resolve(false)"
  >
    <p class="m-confirm__text">{{ store.ui.confirm?.text }}</p>
    <template #footer>
      <button type="button" class="m-btn" @click="store.ui.confirm?.resolve(false)">
        {{ m.common.cancel }}
      </button>
      <button
        type="button"
        class="m-btn"
        :class="store.ui.confirm?.danger ? 'm-btn--danger' : 'm-btn--primary'"
        autofocus
        @click="store.ui.confirm?.resolve(true)"
      >
        {{ store.ui.confirm?.okText ?? m.common.ok }}
      </button>
    </template>
  </MDialog>
</template>

<style scoped>
.m-toasts {
  position: fixed;
  top: 20px;
  left: 50%;
  z-index: 300;
  display: grid;
  justify-items: center;
  gap: 8px;
  translate: -50% 0;
  pointer-events: none;
}
.m-toast {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(480px, calc(100vw - 32px));
  padding: 10px 16px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 500;
}
.m-toast.is-success svg {
  color: var(--status-success);
}
.m-toast.is-error svg {
  color: var(--status-danger);
}
.m-toast.is-info svg {
  color: var(--blue);
}
.m-toast-enter-active,
.m-toast-leave-active {
  transition:
    opacity 0.24s ease,
    translate 0.3s var(--motion-ease);
}
.m-toast-enter-from,
.m-toast-leave-to {
  opacity: 0;
  translate: 0 -10px;
}
.m-confirm__text {
  margin: 0;
  line-height: 1.8;
}
@media (prefers-reduced-motion: reduce) {
  .m-toast-enter-active,
  .m-toast-leave-active {
    transition: none;
  }
}
</style>
