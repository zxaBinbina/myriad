<script setup lang="ts">
import { Gamepad2, RefreshCw } from '@lucide/vue'
import { minecraftConfig, motdRuns, type WidgetItem } from '@myriad/core'
import { computed } from 'vue'
import { useStore } from '../../state/store'
import { useI18n } from '../../i18n'
import { useVisibleResource } from '../../composables/useVisibleResource'
import { grantSources, widgetBase } from '../../state/widgetRequests'
import { loadMinecraft, minecraftOrigins } from '../../state/statusRequests'
import WidgetHeader from './WidgetHeader.vue'
import WidgetState from './WidgetState.vue'
import HistoryChart from './HistoryChart.vue'
const props = defineProps<{ item: WidgetItem }>()
const store = useStore(),
  { m, t } = useI18n()
const config = computed(() => minecraftConfig(props.item.config))
const index = computed(() => Math.min(config.value.servers.length - 1, config.value.serverIndex))
const server = computed(() => config.value.servers[index.value])
const large = computed(() => props.item.size.startsWith('4') || props.item.size.endsWith('4'))
const withHistory = computed(
  () => large.value && config.value.history && !!server.value?.historyUrl,
)
const key = computed(() =>
  server.value
    ? `minecraft:v2:${widgetBase(store, config.value.route)}:${server.value.kind}:${server.value.fallbackKind}:${server.value.address}:${server.value.sourceUrl}:${withHistory.value ? server.value.historyUrl : ''}`
    : null,
)
const { root, data, active, error, loading, stale, reload } = useVisibleResource(
  key,
  (signal) => loadMinecraft(store, config.value.route, server.value!, withHistory.value, signal),
  (value) => value.refreshAfterMs,
  computed(() => props.item.id),
)
const runs = computed(() => motdRuns(data.value?.reading.motd ?? ''))
const history = computed(() => data.value?.history.map((p) => ({ x: p.time, y: p.players })) ?? [])
async function enable() {
  if (server.value) {
    const grant = grantSources(
      store,
      minecraftOrigins(store, config.value.route, server.value, withHistory.value),
    )
    if (await grant) void reload()
  }
}
const avatar = (id: string) =>
  /^[a-f0-9-]{32,36}$/i.test(id) ? `https://mc-heads.net/avatar/${id.replaceAll('-', '')}/24` : ''
async function copyAddress() {
  try {
    await navigator.clipboard.writeText(server.value?.address || data.value?.reading.address || '')
    store.toast(m.value.minecraft.copied, 'success')
  } catch {
    store.toast(m.value.widget.copyFailed, 'error')
  }
}
</script>
<template>
  <div ref="root" class="m-minecraft" data-widget="minecraft" :aria-busy="loading">
    <WidgetHeader :item="item"
      ><button
        type="button"
        class="m-icon-btn m-icon-btn--small"
        :aria-label="m.minecraft.refresh"
        :disabled="loading"
        @click="reload(true)"
      >
        <RefreshCw :size="14" /></button
    ></WidgetHeader>
    <select
      v-if="config.servers.length > 1"
      class="m-minecraft__select"
      :aria-label="m.minecraft.server"
      :value="index"
      @change="item.config.serverIndex = Number(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="(s, i) in config.servers" :key="i" :value="i">
        {{ s.name || (s.kind === 'youzai' ? m.minecraft.youzai : s.address) }}
      </option>
    </select>
    <template v-if="data && server">
      <div class="m-minecraft__server">
        <img
          v-if="config.icon && data.reading.icon"
          :src="data.reading.icon"
          alt=""
          class="m-minecraft__icon"
        />
        <Gamepad2 v-else-if="config.icon" :size="32" class="m-minecraft__fallback" />
        <div>
          <strong>{{
            server.name || (server.kind === 'youzai' ? m.minecraft.youzai : server.address)
          }}</strong
          ><span>{{ data.reading.address || server.address }}</span>
        </div>
      </div>
      <div class="m-minecraft__online">
        <span :class="`is-${data.reading.status}`">{{ t(`status.${data.reading.status}`) }}</span
        ><b
          >{{ data.reading.playersOnline ?? '—'
          }}<small> / {{ data.reading.playersMax ?? '—' }}</small></b
        >
      </div>
      <div class="m-minecraft__meta">
        <span v-if="config.version && data.reading.version">{{ data.reading.version }}</span
        ><span v-if="config.latency && data.reading.latencyMs !== null"
          >{{ Math.round(data.reading.latencyMs) }} ms</span
        >
      </div>
      <p v-if="config.motd && runs.length" class="m-minecraft__motd">
        <span
          v-for="(r, i) in runs"
          :key="i"
          :style="{
            color: r.color || undefined,
            fontWeight: r.bold ? '700' : undefined,
            fontStyle: r.italic ? 'italic' : undefined,
            textDecoration: [r.strike ? 'line-through' : '', r.underline ? 'underline' : ''].join(
              ' ',
            ),
          }"
          >{{ r.text }}</span
        >
      </p>
      <div
        v-if="config.players && large && data.reading.players.length"
        class="m-minecraft__players"
      >
        <span v-for="p in data.reading.players" :key="p.id || p.name"
          ><img
            v-if="config.avatars && active && avatar(p.id)"
            :src="avatar(p.id)"
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
          />{{ p.name }}</span
        >
      </div>
      <HistoryChart
        v-if="withHistory && history.some((p) => p.y !== null)"
        :label="m.minecraft.history"
        :points="history"
      />
      <p v-if="data.historyUnavailable" class="m-minecraft__hint">
        {{ m.status.historyUnavailable }}
      </p>
      <div v-if="server.actions.length" class="m-minecraft__actions">
        <template v-for="(a, i) in server.actions" :key="i"
          ><button
            v-if="a.kind === 'copy'"
            type="button"
            class="m-btn m-btn--small"
            @click="copyAddress"
          >
            {{ a.label }}</button
          ><a
            v-else
            class="m-btn m-btn--small"
            :href="a.url"
            :target="store.settings.openIn === 'new' ? '_blank' : undefined"
            rel="noopener noreferrer"
            >{{ a.label }}</a
          ></template
        >
      </div>
      <footer>
        <span v-if="data.usedFallback">{{ m.minecraft.usingFallback }} · </span>
        {{
          stale
            ? m.widget.cached
            : data.generatedAt
              ? new Date(data.generatedAt).toLocaleTimeString(store.lang.value, {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : ''
        }}
        <span v-if="data.reading.provider === 'mcstatus.io'"> · mcstatus.io</span>
      </footer>
    </template>
    <p v-if="!server" class="m-minecraft__hint">{{ m.minecraft.noServers }}</p>
    <WidgetState
      :error="error"
      :loading="loading"
      :empty="!data"
      :failure-text="m.minecraft.queryFailed"
      @enable="enable"
      @retry="reload(true)"
    />
  </div>
</template>
<style scoped>
.m-minecraft {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px 14px;
  overflow: auto;
}
.m-minecraft__select {
  width: 100%;
  padding: 3px 5px;
  border: 0;
  border-radius: 7px;
  background: var(--secondary-surface);
  font-size: 11px;
}
.m-minecraft__server {
  display: flex;
  align-items: center;
  gap: 9px;
}
.m-minecraft__icon {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  image-rendering: pixelated;
}
.m-minecraft__fallback {
  color: var(--blue);
  flex: none;
}
.m-minecraft__server > div {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 12px;
}
.m-minecraft__server span {
  color: var(--muted);
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-minecraft__online {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
}
.m-minecraft__online b {
  font-size: 24px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.m-minecraft__online small {
  color: var(--muted);
  font-size: 12px;
}
.is-operational {
  color: var(--status-success);
}
.is-degraded {
  color: var(--status-warning);
}
.is-outage {
  color: var(--status-danger);
}
.is-unknown {
  color: var(--muted);
}
.m-minecraft__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--muted);
  font-size: 10px;
}
.m-minecraft__motd {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  margin: 0;
}
.m-minecraft__players {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  font-size: 10px;
}
.m-minecraft__players > span {
  display: flex;
  align-items: center;
  gap: 4px;
}
.m-minecraft__players img {
  width: 18px;
  height: 18px;
  image-rendering: pixelated;
}
.m-minecraft__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.m-minecraft footer,
.m-minecraft__hint {
  color: var(--muted);
  font-size: 9px;
  margin: 0;
}
.m-minecraft footer {
  margin-top: auto;
}
</style>
