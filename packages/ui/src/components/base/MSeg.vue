<script setup lang="ts" generic="T extends string | number">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  options: { value: T; label: string }[]
  label?: string
  wrap?: boolean
}>()
const model = defineModel<T>({ required: true })

const root = ref<HTMLElement | null>(null)
const thumb = ref({ x: 0, y: 0, w: 0, h: 0, ready: false })
const animated = ref(false)

function measure() {
  const el = root.value?.querySelector<HTMLElement>('[aria-checked="true"]')
  if (!el) {
    thumb.value.ready = false
    return
  }
  thumb.value = {
    x: el.offsetLeft,
    y: el.offsetTop,
    w: el.offsetWidth,
    h: el.offsetHeight,
    ready: true,
  }
}

let ro: ResizeObserver | null = null
onMounted(() => {
  measure()
  ro = new ResizeObserver(measure)
  if (root.value) ro.observe(root.value)
  requestAnimationFrame(() => (animated.value = true))
})
onBeforeUnmount(() => ro?.disconnect())
watch([model, () => props.options], () => nextTick(measure))

function onKey(e: KeyboardEvent) {
  const i = props.options.findIndex((o) => o.value === model.value)
  let next = i
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % props.options.length
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
    next = (i - 1 + props.options.length) % props.options.length
  else return
  e.preventDefault()
  model.value = props.options[next]!.value
  nextTick(() => root.value?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
}
</script>

<template>
  <div
    ref="root"
    class="m-seg"
    :class="{ 'm-seg--animated': animated, 'm-seg--wrap': wrap }"
    role="radiogroup"
    :aria-label="label"
    @keydown="onKey"
  >
    <span
      v-show="thumb.ready"
      class="m-seg__thumb"
      aria-hidden="true"
      :style="{
        transform: `translate(${thumb.x}px, ${thumb.y}px)`,
        width: `${thumb.w}px`,
        height: `${thumb.h}px`,
      }"
    />
    <button
      v-for="o in options"
      :key="String(o.value)"
      type="button"
      class="m-seg__item"
      role="radio"
      :aria-checked="o.value === model"
      :tabindex="o.value === model ? 0 : -1"
      @click="model = o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.m-seg {
  position: relative;
  display: inline-flex;
  align-items: stretch;
  max-width: 100%;
  min-height: 36px;
  padding: 2px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--text) 7%, transparent);
  isolation: isolate;
}
.m-seg--wrap {
  flex-wrap: wrap;
}
.m-seg__item {
  position: relative;
  z-index: 1;
  flex: 1 0 auto;
  min-height: 32px;
  padding: 4px 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
}
.m-seg__item[aria-checked='true'] {
  font-weight: 600;
}
.m-seg__item:hover {
  background: color-mix(in srgb, var(--text) 4%, transparent);
}
.m-seg__thumb {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  border-radius: 999px;
  background: var(--seg-selected-bg);
  box-shadow:
    inset 0 0 0 1px var(--seg-selected-border),
    0 3px 8px rgb(0 0 0 / 12%);
  pointer-events: none;
}
.m-seg--animated .m-seg__thumb {
  transition:
    transform 240ms var(--motion-ease),
    width 240ms var(--motion-ease),
    height 240ms var(--motion-ease);
}
@media (prefers-reduced-motion: reduce) {
  .m-seg--animated .m-seg__thumb {
    transition: none;
  }
}
</style>
