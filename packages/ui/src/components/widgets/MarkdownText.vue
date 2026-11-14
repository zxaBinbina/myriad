<script setup lang="ts">
import { marked } from 'marked'
import { onBeforeUnmount, ref, watch } from 'vue'
import { useStore } from '../../state/store'
const props = defineProps<{ text: string }>(),
  store = useStore()
const root = ref<HTMLElement | null>(null)
const elements = [
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'del',
  'blockquote',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'a',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'input',
]
const attributes = ['href', 'title', 'type', 'checked', 'disabled']
let generation = 0
async function render() {
  const el = root.value,
    version = ++generation
  if (!el) return
  const html = marked.parse(props.text, { async: false })
  if ('setHTML' in Element.prototype) {
    ;(el as HTMLElement & { setHTML(html: string, options: unknown): void }).setHTML(html, {
      sanitizer: { elements, attributes },
    })
  } else {
    const { default: DOMPurify } = await import('dompurify')
    if (version !== generation || root.value !== el) return
    const content = DOMPurify.sanitize(html, {
      RETURN_DOM_FRAGMENT: true,
      ALLOWED_TAGS: [...elements, '#text'],
      ALLOWED_ATTR: attributes,
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      KEEP_CONTENT: false,
    })
    el.replaceChildren(content)
  }
  for (const input of el.querySelectorAll('input')) {
    if (input.type !== 'checkbox') input.remove()
    else input.disabled = true
  }
}
watch(
  [() => props.text, root],
  () =>
    void render().catch(() => {
      if (root.value) root.value.textContent = props.text
    }),
  { immediate: true, flush: 'post' },
)
onBeforeUnmount(() => generation++)
function open(event: MouseEvent) {
  const link = (event.target as HTMLElement).closest('a')
  if (link) {
    event.preventDefault()
    if (/^https?:$/.test(new URL(link.href).protocol)) store.openUrl(link.href)
  }
}
</script>
<template><div ref="root" class="m-markdown" @click="open" /></template>
<style scoped>
.m-markdown {
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.m-markdown :deep(p) {
  margin: 0 0 8px;
}
.m-markdown :deep(h1),
.m-markdown :deep(h2),
.m-markdown :deep(h3) {
  font-size: 16px;
  margin: 12px 0 6px;
}
.m-markdown :deep(a) {
  color: var(--blue);
}
.m-markdown :deep(pre) {
  padding: 10px;
  background: var(--secondary-surface);
  border-radius: 9px;
  overflow: auto;
}
.m-markdown :deep(code) {
  font-size: 11px;
}
.m-markdown :deep(blockquote) {
  margin: 8px 0;
  padding-left: 12px;
  border-left: 2px solid var(--blue);
  color: var(--muted);
}
.m-markdown :deep(ul),
.m-markdown :deep(ol) {
  padding-left: 20px;
}
.m-markdown :deep(table) {
  border-collapse: collapse;
  display: block;
  overflow: auto;
}
.m-markdown :deep(td),
.m-markdown :deep(th) {
  border: 1px solid var(--border);
  padding: 4px 8px;
}
</style>
