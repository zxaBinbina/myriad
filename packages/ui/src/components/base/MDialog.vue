<script setup lang="ts">
import { X } from '@lucide/vue'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '../../i18n'

const props = defineProps<{ open: boolean; title: string; eyebrow?: string; width?: string }>()
const emit = defineEmits<{ close: [] }>()
const { m } = useI18n()
const el = ref<HTMLDialogElement | null>(null)

function sync() {
  const d = el.value
  if (!d) return
  if (props.open && !d.open) {
    d.showModal()
    nextTick(() => d.querySelector<HTMLElement>('[autofocus]')?.focus())
  } else if (!props.open && d.open) d.close()
}
onMounted(sync)
watch(
  () => props.open,
  () => nextTick(sync),
)
onBeforeUnmount(() => el.value?.open && el.value.close())

function onCancel(e: Event) {
  e.preventDefault()
  emit('close')
}
function onClick(e: MouseEvent) {
  // 点击遮罩（dialog 元素自身）时关闭
  if (e.target === el.value) emit('close')
}
</script>

<template>
  <dialog
    ref="el"
    class="m-dialog"
    :style="{ '--dialog-width': width ?? '520px' }"
    :aria-label="title"
    @cancel="onCancel"
    @click="onClick"
  >
    <div v-if="open" class="m-dialog__panel m-glass">
      <header class="m-dialog__head">
        <div>
          <p v-if="eyebrow" class="m-eyebrow">{{ eyebrow }}</p>
          <h2 class="m-dialog__title">{{ title }}</h2>
        </div>
        <button
          type="button"
          class="m-icon-btn m-icon-btn--small"
          :aria-label="m.common.close"
          @click="emit('close')"
        >
          <X :size="18" />
        </button>
      </header>
      <div class="m-dialog__body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="m-dialog__foot">
        <slot name="footer" />
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.m-dialog {
  width: min(var(--dialog-width), calc(100vw - 32px));
  max-width: none;
  max-height: calc(100vh - 48px);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  overflow: visible;
}
.m-dialog::backdrop {
  background: rgb(5 6 12 / 45%);
  backdrop-filter: blur(4px);
}
.m-dialog[open] {
  animation: m-dialog-in 0.32s var(--motion-ease);
}
.m-dialog[open]::backdrop {
  animation: m-fade-in 0.24s ease;
}
.m-dialog__panel {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 48px);
  border-radius: 24px;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
}
.m-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 22px 6px 26px;
}
.m-dialog__title {
  margin: 2px 0 0;
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.3px;
}
.m-dialog__body {
  padding: 12px 26px 22px;
  overflow: auto;
}
.m-dialog__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 20px;
  border-top: 1px solid var(--border);
}
@keyframes m-dialog-in {
  from {
    opacity: 0;
    translate: 0 12px;
    scale: 0.97;
  }
}
@keyframes m-fade-in {
  from {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .m-dialog[open],
  .m-dialog[open]::backdrop {
    animation: none;
  }
}
</style>
