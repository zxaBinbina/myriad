<script setup lang="ts">
import { type Json, type ResolvedConflict, SETTINGS_SCOPES, type SettingsScope } from '@myriad/core'
import { Cloud, Laptop } from '@lucide/vue'
import { ref, watch } from 'vue'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import { conflictTarget, useSync } from '../state/sync'
import MDialog from './base/MDialog.vue'

const store = useStore()
const sync = useSync()
const { m, t } = useI18n()

/* ---------------- 冲突 ---------------- */
const picks = ref<Record<number, 'local' | 'remote'>>({})
watch(
  () => sync.conflicts.value.length,
  () => {
    // 默认选中合并后实际生效的一边
    picks.value = Object.fromEntries(
      sync.conflicts.value.map((c, i) => [
        i,
        JSON.stringify(c.current) === JSON.stringify(c.local) ? 'local' : 'remote',
      ]),
    )
  },
  { immediate: true },
)

function scopeOfSetting(key: string): SettingsScope | null {
  for (const [scope, keys] of Object.entries(SETTINGS_SCOPES))
    if ((keys as readonly string[]).includes(key)) return scope as SettingsScope
  return null
}

function title(c: ResolvedConflict) {
  const target = conflictTarget(store, c)
  if (target.kind === 'item') return t('sync.conflictItem', { name: target.name })
  if (target.kind === 'group') return t('sync.conflictGroup', { name: target.name })
  const scope = scopeOfSetting(target.name)
  return scope ? m.value.sync.scopeNames[scope] : target.name
}

function field(c: ResolvedConflict) {
  const target = conflictTarget(store, c)
  if (target.kind === 'setting') return [target.name, target.field].filter(Boolean).join(' › ')
  const [head, ...rest] = target.field.split('.')
  const fields = m.value.sync.fields as Record<string, string>
  return [fields[head ?? ''] ?? head, ...rest].filter(Boolean).join(' › ')
}

function show(v: Json | undefined): string {
  if (v === undefined || v === null || v === '') return m.value.sync.emptyValue
  if (typeof v === 'string') return v.startsWith('data:') ? `${v.slice(0, 32)}…` : v
  const s = JSON.stringify(v)
  return s.length > 80 ? `${s.slice(0, 80)}…` : s
}

function apply() {
  sync.resolveConflicts(picks.value)
}
</script>

<template>
  <MDialog
    :open="!!sync.state.choice"
    :title="m.sync.choiceTitle"
    eyebrow="SYNC"
    width="460px"
    @close="sync.state.choice?.resolve(null)"
  >
    <p class="m-sync-dlg__desc">{{ m.sync.choiceDesc }}</p>
    <div class="m-sync-choice">
      <button type="button" class="m-sync-choice__opt" @click="sync.state.choice?.resolve('cloud')">
        <Cloud :size="22" />
        <span>
          <strong>{{ m.sync.useCloud }}</strong>
          <small>{{ m.sync.useCloudDesc }}</small>
        </span>
      </button>
      <button type="button" class="m-sync-choice__opt" @click="sync.state.choice?.resolve('local')">
        <Laptop :size="22" />
        <span>
          <strong>{{ m.sync.useLocal }}</strong>
          <small>{{ m.sync.useLocalDesc }}</small>
        </span>
      </button>
    </div>
    <template #footer>
      <button type="button" class="m-btn" @click="sync.state.choice?.resolve(null)">
        {{ m.common.cancel }}
      </button>
    </template>
  </MDialog>

  <MDialog
    :open="!sync.state.choice && sync.conflicts.value.length > 0"
    :title="m.sync.conflictTitle"
    eyebrow="SYNC"
    width="560px"
    @close="apply"
  >
    <p class="m-sync-dlg__desc">{{ m.sync.conflictDesc }}</p>
    <ul class="m-conflicts">
      <li v-for="(c, i) in sync.conflicts.value" :key="c.path.join('/')" class="m-conflict">
        <p class="m-conflict__title">
          {{ title(c) }} <span class="m-conflict__field">{{ field(c) }}</span>
        </p>
        <div class="m-conflict__opts" role="radiogroup" :aria-label="title(c)">
          <label
            v-for="side in ['local', 'remote'] as const"
            :key="side"
            class="m-conflict__opt"
            :class="{ 'is-picked': picks[i] === side }"
          >
            <input v-model="picks[i]" type="radio" :name="`conflict-${i}`" :value="side" />
            <span class="m-conflict__side">
              {{ side === 'local' ? m.sync.conflictLocal : m.sync.conflictRemote }}
            </span>
            <span class="m-conflict__value">{{ show(side === 'local' ? c.local : c.remote) }}</span>
          </label>
        </div>
      </li>
    </ul>
    <template #footer>
      <button type="button" class="m-btn m-btn--primary" autofocus @click="apply">
        {{ m.sync.conflictApply }}
      </button>
    </template>
  </MDialog>
</template>

<style scoped>
.m-sync-dlg__desc {
  margin: 0 0 14px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}
.m-sync-choice {
  display: grid;
  gap: 10px;
}
.m-sync-choice__opt {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--secondary-surface);
  color: var(--text);
  text-align: left;
}
.m-sync-choice__opt:hover,
.m-sync-choice__opt:focus-visible {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 18%, transparent);
}
.m-sync-choice__opt svg {
  flex: none;
  margin-top: 2px;
  color: var(--blue);
}
.m-sync-choice__opt span {
  display: grid;
  gap: 3px;
}
.m-sync-choice__opt strong {
  font-size: 14px;
}
.m-sync-choice__opt small {
  color: var(--muted);
  font-size: 12px;
}
.m-conflicts {
  display: grid;
  gap: 12px;
  max-height: 52vh;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.m-conflict__title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}
.m-conflict__field {
  margin-left: 6px;
  color: var(--muted);
  font-weight: 500;
}
.m-conflict__opts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.m-conflict__opt {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  cursor: pointer;
}
.m-conflict__opt.is-picked {
  border-color: var(--blue);
  background: var(--tag-surface);
}
.m-conflict__opt input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.m-conflict__opt:has(input:focus-visible) {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
.m-conflict__side {
  color: var(--muted);
  font-size: 11.5px;
}
.m-conflict__value {
  overflow: hidden;
  font-size: 13px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
