<script setup lang="ts">
import { ArrowLeftRight, Copy } from '@lucide/vue'
import {
  translationConfig,
  TRANSLATION_LANGUAGES,
  TRANSLATION_MAX_LENGTH,
  type TranslationProvider,
  type TranslationResult,
  type TranslationSource,
  type TranslationLanguage,
  type WidgetItem,
} from '@myriad/core'
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useWidgetVisibility } from '../../composables/useWidgetVisibility'
import { useI18n } from '../../i18n'
import { useStore } from '../../state/store'
import { grantSources } from '../../state/widgetRequests'
import {
  ApiError,
  PermissionRequired,
  TranslationError,
  WorkerNotConfigured,
  runTranslation,
  translationOrigins,
} from '../../state/translation'
import WidgetHeader from './WidgetHeader.vue'

const props = defineProps<{ item: WidgetItem }>()
const store = useStore()
const { m, t } = useI18n()
const id = useId()
const config = computed(() => translationConfig(props.item.config))
const source = ref<TranslationSource>(config.value.source)
const target = ref<TranslationLanguage>(config.value.target)
const text = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const form = ref<HTMLFormElement | null>(null)
const { root, active } = useWidgetVisibility(computed(() => props.item.id))
interface ResultRow {
  provider: TranslationProvider
  status: 'pending' | 'done' | 'error' | 'cancelled'
  result?: TranslationResult
  error?: string
}
const rows = ref<ResultRow[]>([])
const busy = ref(false)
const error = ref('')
let controller: AbortController | undefined
let generation = 0
function stop() {
  generation++
  controller?.abort()
  busy.value = false
  for (const row of rows.value) if (row.status === 'pending') row.status = 'cancelled'
}
function invalidate() {
  stop()
  rows.value = []
  error.value = ''
}
watch([text, source, target], invalidate)
watch(
  config,
  () => {
    source.value = config.value.source
    target.value = config.value.target
    invalidate()
  },
  { deep: true },
)
watch(active, (value) => {
  if (!value) stop()
})
onBeforeUnmount(stop)
watch(
  () => store.ui.translationInput,
  async (incoming) => {
    if (incoming?.itemId !== props.item.id) return
    text.value = incoming.text
    await nextTick()
    root.value?.scrollIntoView({ block: 'center', behavior: 'instant' })
    textarea.value?.focus({ preventScroll: true })
    if (store.ui.translationInput === incoming) store.ui.translationInput = null
  },
  { immediate: true },
)
function message(e: unknown) {
  if (e instanceof PermissionRequired) return m.value.translation.permission
  if (e instanceof WorkerNotConfigured) return m.value.translation.workerMissing
  if (e instanceof ApiError) {
    if (e.code === 'disabled') return m.value.translation.disabled
    if (e.code === 'auth' || e.code === 'forbidden') return m.value.translation.workerAuth
    if (e.status === 429) return m.value.translation.quota
  }
  if (e instanceof TranslationError) return t(`translation.error${e.code}`)
  return m.value.translation.failed
}
async function submit() {
  if (busy.value || !active.value) return
  if (!text.value.trim()) {
    error.value = m.value.translation.empty
    textarea.value?.focus()
    return
  }
  if (text.value.length > TRANSLATION_MAX_LENGTH) {
    error.value = m.value.translation.errorlength
    return
  }
  const cfg = translationConfig(props.item.config)
  const providers: TranslationProvider[] = cfg.mode === 'llm' ? ['openai'] : [...cfg.services]
  if (!providers.length) {
    error.value = m.value.translation.chooseService
    return
  }
  stop()
  controller = new AbortController()
  const signal = controller.signal
  const token = generation
  const input = { text: text.value, source: source.value, target: target.value }
  rows.value = providers.map((provider) => ({ provider, status: 'pending' }))
  busy.value = true
  error.value = ''
  // Permission request must start inside this submit gesture, before the first await.
  try {
    const permission = grantSources(store, translationOrigins(store, cfg))
    if (!(await permission)) throw new PermissionRequired()
    signal.throwIfAborted()
    await Promise.all(
      providers.map(async (provider, i) => {
        try {
          const result = await runTranslation(store, props.item.id, provider, input, cfg, signal)
          if (generation === token && !signal.aborted)
            rows.value[i] = { provider, status: 'done', result }
        } catch (e) {
          if (generation === token && !signal.aborted)
            rows.value[i] = { provider, status: 'error', error: message(e) }
        }
      }),
    )
  } catch (e) {
    if (generation === token && !signal.aborted)
      rows.value = providers.map((provider) => ({ provider, status: 'error', error: message(e) }))
  } finally {
    if (generation === token) busy.value = false
  }
}
function keydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) {
    e.preventDefault()
    form.value?.requestSubmit()
  }
}
function swap() {
  if (source.value === 'auto') return
  const old = source.value
  source.value = target.value
  target.value = old
}
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    store.toast(m.value.widget.copied, 'success')
  } catch {
    store.toast(m.value.widget.copyFailed, 'error')
  }
}
</script>

<template>
  <div ref="root" class="m-translation" data-widget="translation" :aria-busy="busy">
    <WidgetHeader :item="item" />
    <form ref="form" method="post" :aria-label="m.widgets.translation" @submit.prevent="submit">
      <div class="m-translation__languages">
        <div class="m-field">
          <label :for="`${id}-source`">{{ m.translation.source }}</label>
          <select :id="`${id}-source`" v-model="source" name="source" class="m-select">
            <option value="auto">{{ m.translation.auto }}</option>
            <option v-for="code in TRANSLATION_LANGUAGES" :key="code" :value="code">
              {{ t(`translation.lang${code}`) }}
            </option>
          </select>
        </div>
        <button
          type="button"
          class="m-icon-btn m-icon-btn--small"
          :disabled="source === 'auto'"
          :aria-label="m.translation.swap"
          @click="swap"
        >
          <ArrowLeftRight :size="16" />
        </button>
        <div class="m-field">
          <label :for="`${id}-target`">{{ m.translation.target }}</label>
          <select :id="`${id}-target`" v-model="target" name="target" class="m-select">
            <option v-for="code in TRANSLATION_LANGUAGES" :key="code" :value="code">
              {{ t(`translation.lang${code}`) }}
            </option>
          </select>
        </div>
      </div>
      <div class="m-field">
        <label :for="`${id}-text`">{{ m.translation.input }}</label>
        <textarea
          :id="`${id}-text`"
          ref="textarea"
          v-model="text"
          class="m-input m-translation__input"
          name="text"
          required
          :maxlength="TRANSLATION_MAX_LENGTH"
          :aria-describedby="`${id}-hint`"
          @keydown="keydown"
        />
      </div>
      <div class="m-translation__submit">
        <span :id="`${id}-hint`"
          >{{ text.length }} / {{ TRANSLATION_MAX_LENGTH }} · Ctrl / ⌘ + Enter</span
        >
        <button v-if="busy" type="button" class="m-btn m-btn--small" @click="stop">
          {{ m.common.cancel }}
        </button>
        <button type="submit" class="m-btn m-btn--primary m-btn--small" :disabled="busy">
          {{ m.translation.translate }}
        </button>
      </div>
    </form>
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <div class="m-translation__results" aria-live="polite">
      <section
        v-for="row in rows"
        :key="row.provider"
        class="m-translation__result"
        :data-provider="row.provider"
        :data-status="row.status"
      >
        <header>
          <strong>{{ t(`translation.${row.provider}`) }}</strong>
          <button
            v-if="row.result"
            type="button"
            class="m-icon-btn m-icon-btn--small"
            :aria-label="`${m.translation.copy} · ${t(`translation.${row.provider}`)}`"
            @click="copy(row.result.text)"
          >
            <Copy :size="14" />
          </button>
        </header>
        <p v-if="row.status === 'pending'" class="m-translation__hint">
          {{ m.translation.working }}
        </p>
        <p v-else-if="row.status === 'cancelled'" class="m-translation__hint">
          {{ m.translation.cancelled }}
        </p>
        <p v-else-if="row.error" class="m-error">{{ row.error }}</p>
        <p v-else-if="row.result" class="m-translation__text" :lang="target">
          {{ row.result.text }}
        </p>
        <small v-if="source === 'auto' && row.result?.detected"
          >{{ m.translation.detected }}: {{ row.result.detected }}</small
        >
      </section>
    </div>
    <p v-if="!rows.length" class="m-translation__hint">{{ m.translation.hint }}</p>
  </div>
</template>

<style scoped>
.m-translation {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  overflow: auto;
}
.m-translation form {
  display: grid;
  gap: 8px;
}
.m-translation__languages {
  display: flex;
  align-items: end;
  gap: 6px;
}
.m-translation__languages .m-field {
  flex: 1;
  min-width: 0;
}
.m-translation__languages .m-select {
  width: 100%;
  padding-inline: 6px;
}
.m-translation__input {
  width: 100%;
  min-height: 76px;
  max-height: 220px;
  resize: vertical;
  font: inherit;
  line-height: 1.6;
}
.m-translation__submit {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.m-translation__submit > span {
  margin-inline-end: auto;
  color: var(--muted);
  font-size: 10px;
}
.m-translation__results {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
  gap: 10px;
}
.m-translation__result {
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
}
.m-translation__result header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 26px;
  font-size: 11px;
}
.m-translation__text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
  font-size: 13px;
  user-select: text;
}
.m-translation__hint,
.m-translation__result small {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}
.m-translation__hint,
.m-translation__text,
.m-translation .m-error {
  margin-block: 4px;
}
</style>
