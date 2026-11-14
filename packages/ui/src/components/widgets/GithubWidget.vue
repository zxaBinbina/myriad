<script setup lang="ts">
import { RefreshCw, Star, GitFork, CircleDot } from '@lucide/vue'
import { computed, ref, watch, useId } from 'vue'
import { githubConfig, type GithubSection, type WidgetItem } from '@myriad/core'
import { useStore } from '../../state/store'
import { useI18n } from '../../i18n'
import { useVisibleResource } from '../../composables/useVisibleResource'
import { grantWidgetOrigins, widgetBase } from '../../state/widgetRequests'
import { GITHUB_ORIGINS, loadGithub } from '../../state/github'
import WidgetHeader from './WidgetHeader.vue'
import { useSync } from '../../state/sync'
const props = defineProps<{ item: WidgetItem }>()
const store = useStore(),
  { m, t } = useI18n()
const config = computed(() => githubConfig(props.item.config))
const sync = useSync()
const requestConfig = computed(() => ({
  ...config.value,
  personal: config.value.personal && sync.state.features?.githubPrivate !== false,
}))
const section = ref<GithubSection>('repositories')
const credentialVersion = ref(0)
watch(
  () => [
    store.local.sync.token,
    store.local.sync.clientId,
    store.local.sync.clientSecret,
    store.local.sync.authMode,
  ],
  () => credentialVersion.value++,
)
watch(
  () => config.value.sections,
  (sections) => {
    if (!sections.includes(section.value)) section.value = sections[0] ?? 'repositories'
  },
)
const key = computed(() =>
  config.value.sections.length
    ? `github:${widgetBase(store, config.value.route)}:${JSON.stringify(requestConfig.value)}:${section.value}:${credentialVersion.value}`
    : null,
)
// A private response is kept only in this mounted instance; never in localStorage or shared caches.
const resource = useVisibleResource(
  key,
  (signal) => loadGithub(store, requestConfig.value, section.value, signal),
  300000,
  computed(() => props.item.id),
  {
    get persist() {
      return !requestConfig.value.personal || !widgetBase(store, config.value.route)
    },
  },
)
const { root, data, loading, error, reload } = resource
const days = computed(() => data.value?.days ?? [])
const total = computed(() => days.value.reduce((sum, d) => sum + (d.count ?? 0), 0))
const totalLabel = computed(() =>
  days.value.some((d) => d.count === null)
    ? m.value.github.contributionUnknown
    : t('github.contributionTotal', { n: total.value }),
)
const sectionId = useId()
const weekOffset = computed(() =>
  days.value.length ? new Date(days.value[0]!.date + 'T12:00Z').getUTCDay() : 0,
)
async function enable() {
  if (await grantWidgetOrigins(store, config.value.route, GITHUB_ORIGINS)) void reload()
}
function status(value: string) {
  return t(`github.${value}`) === `github.${value}` ? value : t(`github.${value}`)
}
</script>
<template>
  <div ref="root" class="m-github" data-widget="github" :aria-busy="loading">
    <WidgetHeader :item="item"
      ><button
        class="m-icon-btn m-icon-btn--small"
        type="button"
        :aria-label="m.github.refresh"
        :disabled="loading"
        @click="reload(true)"
      >
        <RefreshCw :size="14" /></button
    ></WidgetHeader>
    <div class="m-github__selector">
      <label :for="sectionId">{{ m.github.section }}</label>
      <select :id="sectionId" v-model="section" class="m-select">
        <option v-for="s in config.sections" :key="s" :value="s">{{ t(`github.${s}`) }}</option>
      </select>
    </div>
    <div v-if="data" class="m-github__content">
      <template v-if="section === 'contributions'">
        <p>{{ config.user }} · {{ totalLabel }}</p>
        <div
          class="m-github__heatmap"
          role="img"
          :aria-label="totalLabel"
          :style="{ '--m-github-columns': Math.max(1, Math.ceil((days.length + weekOffset) / 7)) }"
        >
          <span v-for="i in weekOffset" :key="`offset:${i}`" />
          <span
            v-for="d in days"
            :key="d.date"
            :data-level="d.level"
            :title="`${d.date}: ${d.count ?? '—'}`"
          />
        </div>
        <details>
          <summary>{{ m.github.dailyData }}</summary>
          <table>
            <caption>
              {{
                config.user
              }}
              ·
              {{
                m.github.contributions
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">{{ m.github.date }}</th>
                <th scope="col">{{ m.github.count }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in [...days].reverse()" :key="d.date">
                <th scope="row">{{ d.date }}</th>
                <td>{{ d.count ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </template>
      <ul v-else-if="section === 'repositories'" class="m-github__list">
        <li v-for="r in data.repos" :key="r.name">
          <a :href="r.url || undefined" target="_blank" rel="noopener noreferrer"
            >{{ r.name }} <small v-if="r.private">{{ m.github.privateRepo }}</small></a
          >
          <p v-if="r.description">{{ r.description }}</p>
          <div class="m-github__stats">
            <span
              ><Star :size="12" aria-hidden="true" /><span class="m-sr-only">Star</span>
              {{ r.stars }}</span
            ><span
              ><GitFork :size="12" aria-hidden="true" /><span class="m-sr-only">Fork</span>
              {{ r.forks }}</span
            ><span
              ><CircleDot :size="12" aria-hidden="true" />{{ m.github.openItems }}
              {{ r.issues }}</span
            >
          </div>
        </li>
      </ul>
      <ul v-else class="m-github__list">
        <li v-for="e in data.entries" :key="e.id">
          <a :href="e.url || undefined" target="_blank" rel="noopener noreferrer">{{
            e.title || `${e.actor} · ${status(e.status)}`
          }}</a>
          <p>
            {{ e.repository }} <span v-if="e.status">· {{ status(e.status) }}</span
            ><span v-if="e.reason"> · {{ status(e.reason) }}</span>
          </p>
          <time v-if="e.date" :datetime="e.date">{{ e.date.slice(0, 10) }}</time>
        </li>
      </ul>
      <p v-if="section !== 'contributions' && !data.repos.length && !data.entries.length">
        {{ m.github.empty }}
      </p>
      <p v-if="data.errors.length" class="m-github__hint">
        {{ m.github.partial }} {{ data.errors.join('、') }}
      </p>
      <a
        v-if="data.more"
        :href="
          section === 'notifications'
            ? 'https://github.com/notifications'
            : section === 'tasks'
              ? 'https://github.com/issues'
              : `https://github.com/${config.user}`
        "
        target="_blank"
        rel="noopener noreferrer"
        >{{ m.github.more }}</a
      >
    </div>
    <div v-if="error || !data" class="m-github__hint" aria-live="polite">
      <p>
        {{
          error === 'permission'
            ? m.widget.enable
            : error
              ? section === 'tasks' || section === 'notifications'
                ? m.github.privateHint
                : m.github.failed
              : m.widget.loading
        }}
      </p>
      <button
        v-if="error"
        type="button"
        class="m-btn m-btn--small"
        @click="error === 'permission' ? enable() : reload(true)"
      >
        {{ error === 'permission' ? m.widget.enable : m.widget.retry }}
      </button>
    </div>
    <footer>
      <a :href="`https://github.com/${config.user}`" target="_blank" rel="noopener noreferrer">{{
        config.user
      }}</a
      ><span>{{ data?.personal ? m.github.personal : m.github.public }}</span>
    </footer>
  </div>
</template>
<style scoped>
.m-github {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 10px;
  overflow: auto;
  font-size: 12px;
}
.m-github__selector {
  display: flex;
  gap: 8px;
  align-items: center;
  color: var(--muted);
}
.m-github__selector select {
  min-width: 0;
  flex: 1;
  padding: 4px 8px;
  font-size: 12px;
}
.m-github__content {
  min-height: 0;
  overflow: auto;
  flex: 1;
}
.m-github__content p {
  margin: 4px 0;
  overflow-wrap: anywhere;
}
.m-github__list {
  list-style: none;
  display: grid;
  gap: 10px;
  padding: 0;
  margin: 0;
}
.m-github__list li {
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
}
.m-github__list a {
  color: var(--text);
  overflow-wrap: anywhere;
}
.m-github__list p,
.m-github__list time,
.m-github__stats,
.m-github__hint,
footer {
  color: var(--muted);
  font-size: 10px;
}
.m-github__stats,
.m-github__stats > span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.m-github__stats {
  gap: 14px;
  flex-wrap: wrap;
}
.m-github__heatmap {
  display: grid;
  grid-template-rows: repeat(7, 9px);
  grid-template-columns: repeat(var(--m-github-columns), minmax(4px, 9px));
  grid-auto-flow: column;
  gap: 2px;
  overflow: auto;
  padding: 10px 0;
}
.m-github__heatmap [data-level] {
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--secondary-surface);
}
.m-github__heatmap [data-level='1'] {
  background: color-mix(in srgb, var(--blue) 25%, var(--panel));
}
.m-github__heatmap [data-level='2'] {
  background: color-mix(in srgb, var(--blue) 45%, var(--panel));
}
.m-github__heatmap [data-level='3'] {
  background: color-mix(in srgb, var(--blue) 70%, var(--panel));
}
.m-github__heatmap [data-level='4'] {
  background: var(--blue);
}
.m-github details {
  font-size: 10px;
  color: var(--muted);
}
.m-github table {
  width: 100%;
  text-align: left;
  border-collapse: collapse;
}
.m-github td,
.m-github th {
  padding: 3px 6px;
}
.m-github footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
}
.m-sr-only {
  position: absolute;
  clip-path: inset(50%);
  width: 1px;
  height: 1px;
  overflow: hidden;
}
</style>
