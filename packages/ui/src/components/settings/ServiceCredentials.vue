<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import {
  ApiError,
  createApi,
  normalizeBase,
  SERVICE_FIELDS,
  type CredentialService,
  type CredentialsStatus,
  type ServiceCredential,
} from '@zxabinbina/myriad-core'
import { useStore } from '../../state/store'
import { useSync } from '../../state/sync'
import { useI18n } from '../../i18n'

const props = defineProps<{ services: CredentialService[]; embedded?: boolean; formId?: string }>()
const store = useStore(),
  sync = useSync(),
  { m } = useI18n(),
  id = useId()
const status = ref<CredentialsStatus | null>(null)
const drafts = ref<Partial<Record<CredentialService, ServiceCredential>>>({})
const busy = ref(false),
  loaded = ref(false),
  message = ref(''),
  failed = ref(false),
  show = ref(false)
const root = ref<HTMLElement | null>(null)
let generation = 0
const connection = () =>
  JSON.stringify([
    store.local.sync.apiBase,
    store.local.sync.authMode,
    store.local.sync.token,
    store.local.sync.clientId,
    store.local.sync.clientSecret,
    store.local.sync.enabled,
  ])
const ready = computed(
  () =>
    store.local.sync.enabled &&
    store.local.sync.authMode === 'token' &&
    !!store.local.sync.token &&
    sync.active.value &&
    sync.api?.base === normalizeBase(store.local.sync.apiBase),
)
const label = (service: CredentialService) => m.value.credentials.services[service]
function api() {
  if (!ready.value) throw new Error(m.value.credentials.connectFirst)
  return createApi({ base: store.local.sync.apiBase, token: store.local.sync.token.trim() })
}
function failure(e: unknown) {
  if (e instanceof ApiError && e.status === 400) return m.value.credentials.invalid
  return e instanceof ApiError
    ? m.value.sync.errors[e.code]
    : e instanceof Error
      ? e.message
      : m.value.credentials.failed
}
async function load(clear = true) {
  const gen = ++generation
  if (clear) {
    drafts.value = Object.fromEntries(
      props.services.map((s) => [s, Object.fromEntries(SERVICE_FIELDS[s].map((f) => [f, '']))]),
    )
    status.value = null
  }
  loaded.value = false
  if (!ready.value) return
  try {
    const result = await api().credentials()
    if (gen !== generation) return
    status.value = result
    loaded.value = true
    message.value = result.enabled ? '' : m.value.credentials.disabled
  } catch (e) {
    if (gen === generation) {
      failed.value = true
      message.value = failure(e)
    }
  }
}
watch(
  () => [connection(), ready.value, props.services.join(',')],
  () => {
    message.value = ''
    failed.value = false
    void load()
  },
  { immediate: true },
)
watch(
  () => sync.state.features?.credentialRevision,
  () => {
    if (
      loaded.value &&
      !busy.value &&
      !Object.values(drafts.value).some((fields) =>
        Object.values(fields).some((value) => value.trim()),
      )
    )
      void load(false)
  },
)
onBeforeUnmount(() => {
  generation++
  drafts.value = {}
})
async function save() {
  const changed = props.services.filter((s) =>
    Object.values(drafts.value[s] ?? {}).some((v) => v.trim()),
  )
  if (!changed.length) return
  if (busy.value) throw new Error(m.value.credentials.saving)
  if (!loaded.value || !status.value?.enabled) throw new Error(m.value.credentials.connectFirst)
  const inputs = root.value?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea',
  )
  for (const input of inputs ?? [])
    if (!input.reportValidity()) throw new Error(m.value.translation.invalidSettings)
  const a = api(),
    target = connection(),
    gen = generation
  busy.value = true
  message.value = ''
  failed.value = false
  try {
    for (const service of changed) {
      if (target !== connection() || gen !== generation)
        throw new Error(m.value.credentials.changedWorker)
      const fields = { ...drafts.value[service] }
      const result = await a.saveCredential(service, {
        fields,
        version: status.value!.services[service].version,
      })
      if (target !== connection() || gen !== generation)
        throw new Error(m.value.credentials.changedWorker)
      status.value = result
      // Clear only the submitted values; never overwrite input typed during an upload.
      for (const [field, value] of Object.entries(fields))
        if (drafts.value[service]?.[field] === value) drafts.value[service]![field] = ''
    }
    message.value = m.value.credentials.saved
    await sync.refreshFeatures(true).catch(() => undefined)
  } catch (e) {
    if (target === connection() && gen === generation) {
      failed.value = true
      message.value = failure(e)
      if (e instanceof ApiError && e.code === 'conflict') {
        const current = await a.credentials().catch(() => null)
        if (current && gen === generation) status.value = current
      }
    }
    throw e
  } finally {
    busy.value = false
  }
}
async function submit() {
  try {
    await save()
  } catch {}
}
async function remove(service: CredentialService) {
  if (busy.value || !status.value || !ready.value) return
  const target = connection(),
    gen = generation,
    a = api()
  busy.value = true
  failed.value = false
  try {
    const result = await a.saveCredential(service, {
      fields: {},
      version: status.value.services[service].version,
      remove: true,
    })
    if (gen !== generation || target !== connection()) return
    status.value = result
    drafts.value[service] = Object.fromEntries(SERVICE_FIELDS[service].map((f) => [f, '']))
    message.value = m.value.credentials.removed
    await sync.refreshFeatures(true).catch(() => undefined)
  } catch (e) {
    if (gen === generation) {
      failed.value = true
      message.value = failure(e)
    }
  } finally {
    busy.value = false
  }
}
defineExpose({ save })
</script>

<template>
  <component
    :is="embedded ? 'div' : 'form'"
    ref="root"
    class="m-service-credentials"
    method="post"
    :aria-label="m.credentials.title"
    @submit.prevent="submit"
  >
    <p>{{ m.credentials.intro }}</p>
    <p v-if="!ready">{{ m.credentials.connectFirst }}</p>
    <p v-else-if="!loaded" role="status">{{ message || m.widget.loading }}</p>
    <template v-if="ready && loaded && status?.enabled">
      <details v-for="service in services" :key="service" :open="services.length === 1">
        <summary>
          {{ label(service) }} ·
          {{
            status.services[service].locked
              ? m.credentials.locked
              : status.services[service].configured
                ? m.credentials.configured
                : m.credentials.empty
          }}
        </summary>
        <fieldset :disabled="busy">
          <legend>{{ label(service) }}</legend>
          <p v-if="status.services[service].source === 'environment'">
            {{ m.credentials.environment }}
          </p>
          <p v-if="service === 'qweather'">{{ m.credentials.qweatherHint }}</p>
          <p v-if="service === 'openai'">{{ m.credentials.openaiHint }}</p>
          <div v-for="field in SERVICE_FIELDS[service]" :key="field" class="m-field">
            <label :for="`${id}-${service}-${field}`">{{ m.credentials.fields[field] }}</label>
            <textarea
              v-if="field === 'privateKey'"
              :id="`${id}-${service}-${field}`"
              v-model="drafts[service]![field]"
              class="m-input"
              :name="`${service}-${field}`"
              :form="formId"
              rows="3"
              maxlength="16000"
              autocomplete="new-password"
              autocorrect="off"
              autocapitalize="none"
              :spellcheck="false"
              :placeholder="
                status.services[service].fields.includes(field) ? m.credentials.keep : ''
              "
            />
            <input
              v-else
              :id="`${id}-${service}-${field}`"
              v-model="drafts[service]![field]"
              class="m-input"
              :name="`${service}-${field}`"
              :form="formId"
              :type="
                ['key', 'id'].includes(field)
                  ? show
                    ? 'text'
                    : 'password'
                  : field === 'endpoint'
                    ? 'url'
                    : 'text'
              "
              maxlength="2000"
              :autocomplete="['key', 'id'].includes(field) ? 'new-password' : 'off'"
              autocorrect="off"
              autocapitalize="none"
              :spellcheck="false"
              :placeholder="
                status.services[service].fields.includes(field) ? m.credentials.keep : ''
              "
              :aria-describedby="`${id}-help`"
            />
          </div>
          <button
            v-if="status.services[service].source === 'saved'"
            type="button"
            class="m-btn m-btn--small"
            @click="remove(service)"
          >
            {{ m.credentials.remove }}
          </button>
        </fieldset>
      </details>
      <p :id="`${id}-help`">{{ m.credentials.keepHint }}</p>
      <button type="button" class="m-btn m-btn--small" :aria-pressed="show" @click="show = !show">
        {{ show ? m.translation.hideKeys : m.translation.showKeys }}
      </button>
      <button v-if="!embedded" type="submit" class="m-btn m-btn--primary" :disabled="busy">
        {{ busy ? m.credentials.saving : m.credentials.save }}
      </button>
    </template>
    <p v-if="message && loaded" :role="failed ? 'alert' : 'status'">{{ message }}</p>
  </component>
</template>

<style scoped>
.m-service-credentials {
  display: grid;
  gap: 12px;
  font-size: 13px;
}
.m-service-credentials p {
  margin: 0;
  color: var(--muted);
  line-height: 1.7;
}
.m-service-credentials details {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
}
.m-service-credentials summary {
  cursor: pointer;
}
.m-service-credentials fieldset {
  display: grid;
  gap: 12px;
  min-width: 0;
  border: 0;
  padding: 12px 0 0;
}
.m-service-credentials legend {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.m-service-credentials textarea {
  resize: vertical;
}
.m-service-credentials input:user-invalid {
  border-color: var(--blue);
}
</style>
