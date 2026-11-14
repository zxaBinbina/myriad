<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  browserTimeZone,
  currencyConfig,
  CRYPTO_CURRENCIES,
  FIAT_CURRENCIES,
  httpSource,
  minecraftConfig,
  STATUS_HISTORY_URL,
  STATUS_URL,
  statusConfig,
  type MinecraftServer,
} from '@myriad/core'
import { useI18n } from '../../i18n'
import MSwitch from '../base/MSwitch.vue'
const props = defineProps<{
  kind: 'status' | 'minecraft' | 'currency'
  initial: Record<string, unknown>
}>()
const { m } = useI18n()
const status = ref(statusConfig(props.initial))
const minecraft = ref(minecraftConfig(props.initial))
const currency = ref(currencyConfig(props.initial, browserTimeZone() ?? ''))
const codes = computed(() => [
  ...FIAT_CURRENCIES,
  ...(currency.value.crypto ? CRYPTO_CURRENCIES : []),
])
function kindChanged(server: MinecraftServer) {
  server.historyUrl = server.kind === 'youzai' ? STATUS_HISTORY_URL : ''
  server.fallbackKind = server.kind === 'youzai' ? 'java' : 'none'
  if (server.kind === 'youzai') {
    server.sourceUrl = STATUS_URL
    server.address = 'play.mcyzw.top:25703'
  }
}
function addServer() {
  minecraft.value.servers.push({
    name: '',
    kind: 'java',
    fallbackKind: 'none',
    address: '',
    sourceUrl: STATUS_URL,
    historyUrl: '',
    actions: [],
  })
}
function validate() {
  if (props.kind === 'status') {
    if (
      !httpSource(status.value.url, '') ||
      (status.value.historyUrl && !httpSource(status.value.historyUrl, ''))
    )
      return m.value.status.invalidSource
  } else if (props.kind === 'currency') {
    if (
      !/^[A-Za-z]{2,12}$/.test(currency.value.base) ||
      !/^[A-Za-z]{2,12}$/.test(currency.value.quote)
    )
      return m.value.currency.invalidCode
  } else {
    for (const s of minecraft.value.servers) {
      if (s.kind === 'youzai' && !httpSource(s.sourceUrl, '')) return m.value.status.invalidSource
      if (s.kind !== 'youzai' || s.fallbackKind !== 'none') {
        const match = /^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(s.address.trim())
        if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535)))
          return m.value.minecraft.invalidServer
      }
      if (s.historyUrl && !httpSource(s.historyUrl, '')) return m.value.status.invalidSource
      for (const action of s.actions)
        if (action.label && action.kind === 'url' && !httpSource(action.url, ''))
          return m.value.status.invalidSource
    }
  }
  return ''
}
function value(): Record<string, unknown> {
  const config =
    props.kind === 'status'
      ? statusConfig(status.value)
      : props.kind === 'minecraft'
        ? minecraftConfig(minecraft.value)
        : currencyConfig(currency.value, browserTimeZone() ?? '')
  return JSON.parse(JSON.stringify(config))
}
defineExpose({ value, validate })
</script>
<template>
  <div class="m-advanced-settings">
    <template v-if="kind === 'status'">
      <label class="m-field"
        ><span>{{ m.status.source }}</span
        ><input v-model="status.url" type="url" class="m-input" autofocus
      /></label>
      <label class="m-field"
        ><span>{{ m.status.historySource }}</span
        ><input v-model="status.historyUrl" type="url" class="m-input"
      /></label>
      <p class="m-advanced-settings__hint">{{ m.status.sourceHint }}</p>
      <label class="m-advanced-settings__toggle"
        ><span>{{ m.status.node }}</span
        ><MSwitch v-model="status.node" :label="m.status.node"
      /></label>
      <label class="m-advanced-settings__toggle"
        ><span>{{ m.status.availability }}</span
        ><MSwitch v-model="status.availability" :label="m.status.availability"
      /></label>
      <label class="m-advanced-settings__toggle"
        ><span>{{ m.status.latency }}</span
        ><MSwitch v-model="status.latency" :label="m.status.latency"
      /></label>
    </template>
    <template v-else-if="kind === 'minecraft'">
      <label class="m-field"
        ><span>{{ m.widget.source }}</span
        ><select v-model="minecraft.route" class="m-select">
          <option value="auto">{{ m.widget.autoSource }}</option>
          <option value="direct">{{ m.widget.directSource }}</option>
        </select></label
      >
      <section
        v-for="(server, i) in minecraft.servers"
        :key="i"
        class="m-advanced-settings__server"
      >
        <div class="m-advanced-settings__row">
          <strong>{{ server.name || `${m.minecraft.server} ${i + 1}` }}</strong
          ><button type="button" class="m-btn m-btn--small" @click="minecraft.servers.splice(i, 1)">
            {{ m.minecraft.remove }}
          </button>
        </div>
        <label class="m-field"
          ><span>{{ m.minecraft.name }}</span
          ><input v-model="server.name" class="m-input"
        /></label>
        <label class="m-field"
          ><span>{{ m.minecraft.kind }}</span
          ><select v-model="server.kind" class="m-select" @change="kindChanged(server)">
            <option value="youzai">{{ m.minecraft.youzaiKind }}</option>
            <option value="java">{{ m.minecraft.java }}</option>
            <option value="bedrock">{{ m.minecraft.bedrock }}</option>
          </select></label
        >
        <p class="m-advanced-settings__hint">{{ m.minecraft.sourceHint }}</p>
        <label class="m-field"
          ><span>{{ m.minecraft.address }}</span
          ><input v-model="server.address" class="m-input" placeholder="play.example.com:25565"
        /></label>
        <label v-if="server.kind === 'youzai'" class="m-field"
          ><span>{{ m.status.source }}</span
          ><input v-model="server.sourceUrl" type="url" class="m-input"
        /></label>
        <template v-if="server.kind === 'youzai'">
          <label class="m-field"
            ><span>{{ m.minecraft.fallback }}</span
            ><select v-model="server.fallbackKind" class="m-select">
              <option value="java">{{ m.minecraft.java }}</option>
              <option value="bedrock">{{ m.minecraft.bedrock }}</option>
              <option value="none">{{ m.minecraft.noFallback }}</option>
            </select></label
          >
          <p class="m-advanced-settings__hint">{{ m.minecraft.fallbackHint }}</p>
        </template>
        <label class="m-field"
          ><span>{{ m.status.historySource }}</span
          ><input v-model="server.historyUrl" type="url" class="m-input"
        /></label>
        <details>
          <summary>{{ m.minecraft.actions }}</summary>
          <div v-for="(action, j) in server.actions" :key="j" class="m-advanced-settings__action">
            <label class="m-field"
              ><span>{{ m.minecraft.actionLabel }}</span
              ><input v-model="action.label" class="m-input"
            /></label>
            <select v-model="action.kind" class="m-select" :aria-label="m.minecraft.actions">
              <option value="url">{{ m.minecraft.openLink }}</option>
              <option value="copy">{{ m.minecraft.copyAddress }}</option>
            </select>
            <label v-if="action.kind === 'url'" class="m-field"
              ><span>{{ m.minecraft.actionUrl }}</span
              ><input v-model="action.url" type="url" class="m-input"
            /></label>
            <button type="button" class="m-btn m-btn--small" @click="server.actions.splice(j, 1)">
              {{ m.common.delete }}
            </button>
          </div>
          <button
            type="button"
            class="m-btn m-btn--small"
            :disabled="server.actions.length >= 8"
            @click="server.actions.push({ label: '', url: '', kind: 'url' })"
          >
            {{ m.minecraft.addAction }}
          </button>
        </details>
      </section>
      <button
        type="button"
        class="m-btn"
        :disabled="minecraft.servers.length >= 12"
        @click="addServer"
      >
        {{ m.minecraft.add }}
      </button>
      <p class="m-advanced-settings__hint">{{ m.minecraft.historyHint }}</p>
      <label class="m-advanced-settings__toggle"
        ><span>{{ m.minecraft.version }}</span
        ><MSwitch v-model="minecraft.version" :label="m.minecraft.version"
      /></label>
      <label class="m-advanced-settings__toggle"
        ><span>{{ m.minecraft.latency }}</span
        ><MSwitch v-model="minecraft.latency" :label="m.minecraft.latency"
      /></label>
      <label class="m-advanced-settings__toggle"
        ><span>{{ m.minecraft.icon }}</span
        ><MSwitch v-model="minecraft.icon" :label="m.minecraft.icon"
      /></label>
      <label class="m-advanced-settings__toggle"
        ><span>{{ m.minecraft.motd }}</span
        ><MSwitch v-model="minecraft.motd" :label="m.minecraft.motd"
      /></label>
      <label class="m-advanced-settings__toggle"
        ><span>{{ m.minecraft.players }}</span
        ><MSwitch v-model="minecraft.players" :label="m.minecraft.players"
      /></label>
      <label class="m-advanced-settings__toggle"
        ><span>{{ m.minecraft.avatars }}</span
        ><MSwitch v-model="minecraft.avatars" :label="m.minecraft.avatars"
      /></label>
      <label class="m-advanced-settings__toggle"
        ><span>{{ m.minecraft.historyToggle }}</span
        ><MSwitch v-model="minecraft.history" :label="m.minecraft.historyToggle"
      /></label>
    </template>
    <template v-else>
      <label class="m-field"
        ><span>{{ m.widget.source }}</span
        ><select v-model="currency.route" class="m-select">
          <option value="auto">{{ m.widget.autoSource }}</option>
          <option value="direct">{{ m.widget.directSource }}</option>
        </select></label
      >
      <div class="m-advanced-settings__row">
        <label class="m-field"
          ><span>{{ m.currency.base }}</span
          ><input
            v-model="currency.base"
            class="m-input"
            list="m-currency-codes"
            autofocus /></label
        ><label class="m-field"
          ><span>{{ m.currency.quote }}</span
          ><input v-model="currency.quote" class="m-input" list="m-currency-codes"
        /></label>
      </div>
      <datalist id="m-currency-codes">
        <option v-for="code in codes" :key="code" :value="code" />
      </datalist>
      <label class="m-advanced-settings__toggle"
        ><span>{{ m.currency.crypto }}</span
        ><MSwitch v-model="currency.crypto" :label="m.currency.crypto"
      /></label>
      <label class="m-advanced-settings__toggle"
        ><span>{{ m.currency.historyToggle }}</span
        ><MSwitch v-model="currency.history" :label="m.currency.historyToggle"
      /></label>
      <p class="m-advanced-settings__hint">{{ m.currency.sourceHint }}</p>
    </template>
  </div>
</template>
<style scoped>
.m-advanced-settings {
  display: grid;
  gap: 16px;
}
.m-advanced-settings__toggle,
.m-advanced-settings__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  font-size: 13px;
}
.m-advanced-settings__row .m-field {
  flex: 1;
  min-width: 0;
}
.m-advanced-settings__hint {
  color: var(--muted);
  font-size: 12px;
  margin: 0;
}
.m-advanced-settings__server {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
}
.m-advanced-settings__server summary {
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.m-advanced-settings__action {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: end;
  gap: 8px;
  padding: 12px 0;
}
</style>
