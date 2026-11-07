<script setup lang="ts">
defineProps<{ label?: string; disabled?: boolean }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    type="button"
    class="m-switch"
    role="switch"
    :aria-checked="model"
    :aria-label="label"
    :disabled="disabled"
    @click="model = !model"
  >
    <span class="m-switch__knob" aria-hidden="true" />
  </button>
</template>

<style scoped>
.m-switch {
  position: relative;
  flex: none;
  width: 44px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 12%, transparent);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}
.m-switch[aria-checked='true'] {
  border-color: transparent;
  background: var(--primary-action);
}
.m-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.m-switch__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 25%);
  transition: translate 0.24s var(--motion-ease);
}
.m-switch[aria-checked='true'] .m-switch__knob {
  translate: 18px 0;
}
@media (prefers-reduced-motion: reduce) {
  .m-switch__knob {
    transition: none;
  }
}
</style>
