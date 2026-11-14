<script setup lang="ts">
import {
  translationConfig,
  TRANSLATION_LANGUAGES,
  TRANSLATION_SERVICES,
  type TranslationCredentials,
  type TranslationProvider,
} from '@myriad/core'
import { computed, onMounted, ref, useId } from 'vue'
import { useI18n } from '../../i18n'
import { useStore } from '../../state/store'
import {
  loadTranslationCredentials,
  translationCredentialsKey,
  translationEndpoint,
} from '../../state/translation'

const props = defineProps<{ initial: Record<string, unknown>; itemId: string; formId: string }>()
const emit = defineEmits<{ save: [] }>()
const store = useStore()
const { m, t } = useI18n()
const id = useId()
const config = ref(translationConfig(props.initial))
const credentials = ref<TranslationCredentials>({})
const form = ref<HTMLFormElement | null>(null)
const loaded = ref(false)
const showKey = ref(false)
const providers = computed<TranslationProvider[]>(() =>
  config.value.mode === 'llm' ? ['openai'] : config.value.services.filter((p) => p !== 'worker'),
)
onMounted(async () => {
  try {
    const saved = await loadTranslationCredentials(store, props.itemId)
    for (const provider of [...TRANSLATION_SERVICES, 'openai'] as TranslationProvider[])
      credentials.value[provider] = saved[provider] ?? { id: '', key: '' }
    loaded.value = true
  } catch {
    store.toast(m.value.translation.storageFailed, 'error')
  }
})
async function save() {
  if (!loaded.value) throw new Error(m.value.translation.storageFailed)
  if (!form.value?.reportValidity()) throw new Error(m.value.translation.invalidSettings)
  if (config.value.mode === 'services' && !config.value.services.length)
    throw new Error(m.value.translation.chooseService)
  let endpoint: string | undefined
  if (config.value.mode === 'llm' || credentials.value.openai?.key) {
    try {
      endpoint = translationEndpoint(config.value.baseUrl)
    } catch {
      throw new Error(m.value.translation.errorendpoint)
    }
  }
  const clean: TranslationCredentials = {}
  for (const provider of [...TRANSLATION_SERVICES, 'openai'] as TranslationProvider[]) {
    const value = credentials.value[provider]
    if (value?.key.trim())
      clean[provider] = {
        id: value.id.trim(),
        key: value.key.trim(),
        ...(provider === 'openai'
          ? { endpoint: config.value.mode === 'llm' ? endpoint : value.endpoint }
          : {}),
      }
  }
  await store.platform.storage.set(translationCredentialsKey(props.itemId), clean)
  return { ...translationConfig(config.value as unknown as Record<string, unknown>) }
}
defineExpose({ save })
</script>

<template>
  <form
    :id="formId"
    ref="form"
    class="m-translation-settings"
    method="post"
    :aria-label="m.translation.settings"
    @submit.prevent="emit('save')"
  >
    <p class="m-translation-settings__hint">{{ m.translation.privacy }}</p>
    <fieldset>
      <legend>{{ m.translation.mode }}</legend>
      <label :for="`${id}-services`"
        ><input
          :id="`${id}-services`"
          v-model="config.mode"
          type="radio"
          name="mode"
          value="services"
        />{{ m.translation.servicesMode }}</label
      >
      <label :for="`${id}-llm`"
        ><input :id="`${id}-llm`" v-model="config.mode" type="radio" name="mode" value="llm" />{{
          m.translation.llmMode
        }}</label
      >
    </fieldset>
    <fieldset v-if="config.mode === 'services'">
      <legend>{{ m.translation.services }}</legend>
      <label
        v-for="provider in TRANSLATION_SERVICES"
        :key="provider"
        :for="`${id}-${provider}-enabled`"
        ><input
          :id="`${id}-${provider}-enabled`"
          v-model="config.services"
          type="checkbox"
          name="services"
          :value="provider"
        />{{ t(`translation.${provider}`) }}</label
      >
    </fieldset>
    <div v-if="config.mode === 'services' && config.services.includes('worker')" class="m-field">
      <label :for="`${id}-worker`">{{ m.translation.workerProvider }}</label>
      <select
        :id="`${id}-worker`"
        v-model="config.workerProvider"
        class="m-select"
        name="workerProvider"
      >
        <option value="ai">Workers AI · m2m100</option>
        <option value="deepl">DeepL</option>
        <option value="microsoft">Microsoft</option>
      </select>
      <p class="m-translation-settings__hint">{{ m.translation.workerHint }}</p>
    </div>
    <div class="m-field">
      <label :for="`${id}-source`">{{ m.translation.defaultSource }}</label>
      <select :id="`${id}-source`" v-model="config.source" name="source" class="m-select">
        <option value="auto">{{ m.translation.auto }}</option>
        <option v-for="code in TRANSLATION_LANGUAGES" :key="code" :value="code">
          {{ t(`translation.lang${code}`) }}
        </option>
      </select>
    </div>
    <div class="m-field">
      <label :for="`${id}-target`">{{ m.translation.defaultTarget }}</label>
      <select :id="`${id}-target`" v-model="config.target" name="target" class="m-select">
        <option v-for="code in TRANSLATION_LANGUAGES" :key="code" :value="code">
          {{ t(`translation.lang${code}`) }}
        </option>
      </select>
    </div>
    <template v-if="config.mode === 'llm'">
      <div class="m-field">
        <label :for="`${id}-base`">Base URL</label
        ><input
          :id="`${id}-base`"
          v-model="config.baseUrl"
          type="url"
          class="m-input"
          name="baseUrl"
          required
          autocorrect="off"
          autocapitalize="none"
          :spellcheck="false"
          :aria-describedby="`${id}-base-help`"
        /><small :id="`${id}-base-help`">{{ m.translation.baseHint }}</small>
      </div>
      <div class="m-field">
        <label :for="`${id}-model`">{{ m.translation.model }}</label
        ><input
          :id="`${id}-model`"
          v-model="config.model"
          class="m-input"
          name="model"
          required
          maxlength="200"
          autocorrect="off"
          autocapitalize="none"
          :spellcheck="false"
        />
      </div>
    </template>
    <fieldset v-if="config.mode === 'services' && config.services.includes('deepl')">
      <legend>{{ m.translation.deeplPlan }}</legend>
      <label :for="`${id}-free`"
        ><input
          :id="`${id}-free`"
          v-model="config.deeplFree"
          name="deeplPlan"
          type="radio"
          :value="true"
        />API Free</label
      ><label :for="`${id}-pro`"
        ><input
          :id="`${id}-pro`"
          v-model="config.deeplFree"
          name="deeplPlan"
          type="radio"
          :value="false"
        />API Pro</label
      >
    </fieldset>
    <div v-if="config.mode === 'services' && config.services.includes('microsoft')" class="m-field">
      <label :for="`${id}-ms-region`">{{ m.translation.region }} · Microsoft</label
      ><input
        :id="`${id}-ms-region`"
        v-model="config.microsoftRegion"
        class="m-input"
        name="microsoftRegion"
        maxlength="80"
        autocorrect="off"
        autocapitalize="none"
        :spellcheck="false"
      />
    </div>
    <div v-if="config.mode === 'services' && config.services.includes('tencent')" class="m-field">
      <label :for="`${id}-tc-region`"
        >{{ m.translation.region }} · {{ m.translation.tencent }}</label
      ><input
        :id="`${id}-tc-region`"
        v-model="config.tencentRegion"
        class="m-input"
        name="tencentRegion"
        required
        maxlength="80"
        autocorrect="off"
        autocapitalize="none"
        :spellcheck="false"
      />
    </div>
    <template v-if="loaded">
      <fieldset
        v-for="provider in providers"
        :key="provider"
        class="m-translation-settings__credential"
      >
        <legend>{{ t(`translation.${provider}`) }} · {{ m.translation.localKey }}</legend>
        <div v-if="['baidu', 'youdao', 'tencent'].includes(provider)" class="m-field">
          <label :for="`${id}-${provider}-id`">{{
            provider === 'tencent' ? 'Secret ID' : 'App ID / App Key'
          }}</label
          ><input
            :id="`${id}-${provider}-id`"
            v-model="credentials[provider]!.id"
            class="m-input"
            :name="`${provider}Id`"
            autocorrect="off"
            autocapitalize="none"
            :spellcheck="false"
          />
        </div>
        <div class="m-field">
          <label :for="`${id}-${provider}-key`">{{
            provider === 'tencent' ? 'Secret Key' : 'API Key / Secret'
          }}</label
          ><input
            :id="`${id}-${provider}-key`"
            v-model="credentials[provider]!.key"
            :type="showKey ? 'text' : 'password'"
            class="m-input"
            :name="`${provider}Key`"
            autocomplete="new-password"
            autocorrect="off"
            autocapitalize="none"
            :spellcheck="false"
          />
        </div>
      </fieldset>
      <button
        v-if="providers.length"
        type="button"
        class="m-btn m-btn--small"
        :aria-pressed="showKey"
        @click="showKey = !showKey"
      >
        {{ showKey ? m.translation.hideKeys : m.translation.showKeys }}
      </button>
    </template>
    <p v-else role="status">{{ m.widget.loading }}</p>
  </form>
</template>

<style scoped>
.m-translation-settings {
  display: grid;
  gap: 14px;
}
.m-translation-settings fieldset {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
}
.m-translation-settings legend {
  color: var(--muted);
  padding-inline: 4px;
}
.m-translation-settings fieldset > label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.m-translation-settings input[type='radio'],
.m-translation-settings input[type='checkbox'] {
  accent-color: var(--blue);
}
.m-translation-settings .m-translation-settings__credential {
  display: grid;
}
.m-translation-settings__hint,
.m-translation-settings small {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}
</style>
