<script setup lang="ts">
import {
  BackupError,
  browserTimeZone,
  type ComboKey,
  comboFromEvent,
  createBackup,
  createId,
  defaultSettings,
  emptyData,
  formatCombo,
  parseBackup,
  presetData,
  resolveEngines,
  type ShortcutAction,
  type TriState,
  appendData,
  type ApiErrorCode,
  type BackupInfo,
  SYNC_SCOPES,
  type WallpaperSpec,
} from '@myriad/core'
import { Download, ExternalLink, History, Plus, RefreshCw, Trash2, Upload, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import { blobStore } from '../../state/blobs'
import { useStore } from '../../state/store'
import { useSync } from '../../state/sync'
import MSeg from '../base/MSeg.vue'
import MSwitch from '../base/MSwitch.vue'
import MRange from './MRange.vue'
import SettingRow from './SettingRow.vue'

const store = useStore()
const sync = useSync()
const { m, t, lang } = useI18n()
const logoUrl = new URL('../../assets/logo.svg', import.meta.url).href
const s = store.settings

const SECTIONS = [
  'appearance',
  'background',
  'layout',
  'icons',
  'dock',
  'search',
  'shortcuts',
  'clock',
  'sync',
  'data',
  'about',
] as const
type Section = (typeof SECTIONS)[number]
const section = ref<Section>('appearance')
watch(
  () => store.ui.settingsSection,
  (v) => {
    if ((SECTIONS as readonly string[]).includes(v)) section.value = v as Section
  },
  { immediate: true },
)

const panel = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null
watch(
  () => store.ui.settingsOpen,
  (open) => {
    if (open) {
      returnFocus = document.activeElement as HTMLElement | null
      nextTick(() => panel.value?.focus())
    } else returnFocus?.focus?.()
  },
)

const opts = <T extends string | number>(values: readonly T[], labels: Record<string, string>) =>
  values.map((v) => ({ value: v, label: labels[String(v)] ?? String(v) }))

/* ---------------- 外观 ---------------- */
const languageOptions = computed(() => [
  { value: 'auto' as const, label: m.value.settings.appearance.languageAuto },
  { value: 'zh-CN' as const, label: '简体中文' },
  { value: 'en' as const, label: 'English' },
])
const triOptions = computed(() => [
  { value: 'auto' as TriState, label: m.value.common.auto },
  { value: 'on' as TriState, label: m.value.common.on },
  { value: 'off' as TriState, label: m.value.common.off },
])
const PALETTE_SWATCH = {
  'fufu-blue': 'linear-gradient(135deg, #4ea4ef, #2d3c81)',
  'hutao-red': 'linear-gradient(135deg, #c94737, #7b595e)',
} as const

/* ---------------- 背景 ---------------- */
const COMBOS: ComboKey[] = [
  'fufu-blue:dark',
  'fufu-blue:light',
  'hutao-red:dark',
  'hutao-red:light',
]
const currentCombo = computed<ComboKey>(() => `${s.palette}:${store.resolvedTheme.value}`)
const comboLabel = (c: ComboKey) => {
  const [p, th] = c.split(':') as [
    keyof typeof m.value.settings.appearance.palettes,
    'dark' | 'light',
  ]
  return t('settings.background.combo', {
    palette: m.value.settings.appearance.palettes[p],
    theme: m.value.settings.appearance.themes[th],
  })
}
type WallSource = 'none' | WallpaperSpec['source']
const wallSourceOptions = computed(() =>
  (
    [
      'none',
      'upload',
      'url',
      'bing',
      'picsum',
      ...(sync.canUnsplash.value ||
      Object.values(s.background.wallpapers).some((w) => w?.source === 'unsplash')
        ? (['unsplash'] as const)
        : []),
    ] as WallSource[]
  ).map((v) => ({
    value: v,
    label: m.value.settings.background.sources[v],
  })),
)
function wallSource(c: ComboKey): WallSource {
  return s.background.wallpapers[c]?.source ?? 'none'
}
async function setWallSource(c: ComboKey, v: WallSource) {
  const old = s.background.wallpapers[c]
  if (old?.source === 'upload' && v !== 'upload') {
    void blobStore.delete(old.blobKey)
    void sync.deleteBlob(old.blobKey)
  }
  if (v === 'none') delete s.background.wallpapers[c]
  else if (v === 'url')
    s.background.wallpapers[c] = { source: 'url', url: old?.source === 'url' ? old.url : '' }
  else if (v === 'upload') {
    if (old?.source !== 'upload') delete s.background.wallpapers[c]
    uploadFor.value = c
    await nextTick()
    fileInput.value?.click()
  } else s.background.wallpapers[c] = { source: v }
  if (v !== 'none') s.background.mode = 'wallpaper'
}
const uploadFor = ref<ComboKey | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
async function onWallFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const c = uploadFor.value
  if (!file || !c) return
  const old = s.background.wallpapers[c]
  const key = `wallpaper.${c}.${createId()}`
  await blobStore.put(key, file)
  if (old?.source === 'upload') {
    void blobStore.delete(old.blobKey)
    void sync.deleteBlob(old.blobKey)
  }
  // 同步背景时把文件传到服务器，其他设备按需下载
  if (sync.canBlobs.value && store.local.sync.scopes.background) {
    sync
      .uploadBlob(key, file)
      .catch(() =>
        store.toast(t('sync.connectFailed', { reason: m.value.sync.errors['too-large'] }), 'error'),
      )
  }
  s.background.wallpapers[c] = { source: 'upload', blobKey: key, name: file.name }
  s.background.mode = 'wallpaper'
}
function wallUrl(c: ComboKey) {
  const w = s.background.wallpapers[c]
  return w?.source === 'url' ? w.url : ''
}
function wallName(c: ComboKey) {
  const w = s.background.wallpapers[c]
  return w?.source === 'upload' ? (w.name ?? '') : ''
}
function setWallUrl(c: ComboKey, url: string) {
  s.background.wallpapers[c] = { source: 'url', url: url.trim() }
}

/* ---------------- 搜索 ---------------- */
const engines = computed(() => resolveEngines(s.search, lang.value))
function engineSetting(id: string) {
  let e = s.search.engines.find((x) => x.id === id)
  if (!e) {
    const r = engines.value.find((x) => x.id === id)!
    e = { id, enabled: r.enabled, prefix: r.prefix }
    s.search.engines.push(e)
  }
  return e
}
const custom = ref({ name: '', url: '', suggestUrl: '' })
const customError = ref(false)
function addCustom() {
  if (!custom.value.name.trim() || !custom.value.url.includes('%s')) {
    customError.value = true
    return
  }
  const id = createId('e')
  s.search.custom.push({
    id,
    name: custom.value.name.trim(),
    url: custom.value.url.trim(),
    suggestUrl: custom.value.suggestUrl.trim() || undefined,
  })
  s.search.engines.push({ id, enabled: true, prefix: '' })
  custom.value = { name: '', url: '', suggestUrl: '' }
  customError.value = false
}
function removeCustom(id: string) {
  s.search.custom = s.search.custom.filter((c) => c.id !== id)
  s.search.engines = s.search.engines.filter((e) => e.id !== id)
  if (s.search.defaultEngine === id) s.search.defaultEngine = 'google'
}

/* ---------------- 快捷键 ---------------- */
const ACTIONS: ShortcutAction[] = [
  'focusSearch',
  'cycleEngine',
  'clearSearch',
  'nextGroup',
  'prevGroup',
  'openSettings',
]
const recording = ref<ShortcutAction | null>(null)
function onRecordKey(e: KeyboardEvent) {
  if (!recording.value) return
  e.preventDefault()
  e.stopPropagation()
  const combo = comboFromEvent(e)
  if (!combo) return
  const list = s.shortcuts.bindings[recording.value]
  if (!list.includes(combo)) list.push(combo)
  recording.value = null
}
watch(recording, (r) => {
  if (r) addEventListener('keydown', onRecordKey, true)
  else removeEventListener('keydown', onRecordKey, true)
})
onBeforeUnmount(() => removeEventListener('keydown', onRecordKey, true))

/* ---------------- 时钟 ---------------- */
const zones = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf(
      'timeZone',
    )
  } catch {
    return ['Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'UTC']
  }
})()
const autoZone = browserTimeZone() ?? 'Asia/Shanghai'
const newZone = ref('UTC')
function addZone() {
  if (!s.clock.extraZones.some((z) => z.zone === newZone.value)) {
    s.clock.extraZones.push({
      zone: newZone.value,
      label: newZone.value.split('/').pop()!.replace(/_/g, ' '),
    })
  }
}

/* ---------------- 数据 ---------------- */
const importMode = ref<'append' | 'replace'>('append')
const importSettings = ref(false)
const importInput = ref<HTMLInputElement | null>(null)

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function doExport() {
  const backup = createBackup(
    {
      data: JSON.parse(JSON.stringify(store.data)),
      settings: JSON.parse(JSON.stringify(store.settings)),
    },
    `Myriad ${store.platform.version}`,
  )
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  download(`myriad-backup-${stamp}.json`, JSON.stringify(backup, null, 2))
  store.toast(m.value.settings.data.exported, 'success')
}
async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const parsed = parseBackup(await file.text())
    await sync.backupBefore('import')
    if (parsed.data) {
      if (importMode.value === 'replace') store.replaceData(parsed.data)
      else appendData(store.data, parsed.data)
    }
    if (parsed.settings && importSettings.value) store.replaceSettings(parsed.settings)
    store.local.onboarded = true
    store.toast(m.value.settings.data.imported, 'success')
  } catch (err) {
    const key = err instanceof BackupError ? err.message : 'invalid-json'
    store.toast(
      m.value.settings.data.importError[key as keyof typeof m.value.settings.data.importError] ??
        key,
      'error',
    )
  }
}
async function restorePreset() {
  if (
    await store.confirm(m.value.settings.data.presetConfirm, {
      title: m.value.settings.data.preset,
      danger: true,
      okText: m.value.common.ok,
    })
  ) {
    store.replaceData(presetData(lang.value))
    store.toast(m.value.settings.data.done, 'success')
  }
}
async function clearAll() {
  if (
    await store.confirm(m.value.settings.data.clearAllConfirm, {
      title: m.value.settings.data.clearAll,
      danger: true,
      okText: m.value.common.clear,
    })
  ) {
    store.replaceData(emptyData())
    store.toast(m.value.settings.data.done, 'success')
  }
}
async function resetSettings() {
  if (
    await store.confirm(m.value.settings.data.resetSettingsConfirm, {
      title: m.value.settings.data.resetSettings,
      danger: true,
      okText: m.value.common.reset,
    })
  ) {
    store.replaceSettings(defaultSettings())
    store.toast(m.value.settings.data.done, 'success')
  }
}
function clearHistory() {
  store.local.searchHistory = []
  store.toast(m.value.settings.search.historyCleared, 'success')
}
function refreshIcons() {
  store.local.iconCache = {}
  store.toast(m.value.settings.icons.refreshed, 'success')
}

/* ---------------- 同步 ---------------- */
const sc = store.local.sync
const syncBusy = ref(false)

function errorText(code: ApiErrorCode | '') {
  return code ? m.value.sync.errors[code] : ''
}

function relTime(at: number) {
  if (!at) return ''
  const diff = (at - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(lang.value, { numeric: 'auto' })
  const abs = Math.abs(diff)
  if (abs < 45) return rtf.format(Math.round(diff), 'second')
  if (abs < 2700) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 79200) return rtf.format(Math.round(diff / 3600), 'hour')
  return new Date(at).toLocaleString(lang.value)
}

function dateTime(at: number) {
  return new Date(at).toLocaleString(lang.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 点击「连接」：先在用户操作中申请主机权限，再连接 */
function onConnect() {
  const permission = sync.requestPermission()
  syncBusy.value = true
  void (async () => {
    try {
      if (!(await permission)) {
        store.toast(m.value.sync.permissionDenied, 'error')
        return
      }
      const ok = await sync.connect()
      if (ok) {
        store.toast(t('sync.connected', { identity: sync.state.identity }), 'success')
        void loadBackups()
      } else if (sync.state.error) {
        store.toast(t('sync.connectFailed', { reason: errorText(sync.state.error) }), 'error')
      }
    } finally {
      syncBusy.value = false
    }
  })()
}

async function onDisconnect() {
  if (
    await store.confirm(m.value.sync.disconnectConfirm, {
      title: m.value.sync.disconnect,
      okText: m.value.sync.disconnect,
      danger: true,
    })
  )
    await sync.disconnect()
}

/* 备份 */
const backups = ref<BackupInfo[]>([])
const backupCfg = ref({ enabled: true, keep: 2 })
const KEEP_OPTIONS = [1, 2, 3, 5, 7, 14, 30]

async function loadBackups() {
  if (!sync.canBackups.value || !sync.api) return
  try {
    const r = await sync.api.listBackups()
    backups.value = r.backups
    backupCfg.value = r.config
  } catch {
    /* 忽略：状态栏会显示错误 */
  }
}

watch(
  () => [section.value, sync.canBackups.value, store.ui.settingsOpen] as const,
  ([sec, can, open]) => {
    if (sec === 'sync' && can && open) void loadBackups()
  },
  { immediate: true },
)

async function saveBackupCfg() {
  if (!sync.api) return
  try {
    backupCfg.value = (await sync.api.setBackupConfig(backupCfg.value)).config
    await loadBackups()
  } catch (e) {
    store.toast(errorText((e as { code?: ApiErrorCode }).code ?? 'network'), 'error')
  }
}

async function backupNow() {
  if (!sync.api) return
  syncBusy.value = true
  try {
    await sync.syncNow()
    await sync.api.createBackup('manual')
    store.toast(m.value.sync.backupDone, 'success')
    await loadBackups()
  } catch (e) {
    store.toast(errorText((e as { code?: ApiErrorCode }).code ?? 'network'), 'error')
  } finally {
    syncBusy.value = false
  }
}

async function rollbackTo(b: BackupInfo) {
  const ok = await store.confirm(t('sync.rollbackConfirm', { time: dateTime(b.at) }), {
    title: m.value.sync.rollback,
    okText: m.value.sync.rollback,
    danger: true,
  })
  if (!ok) return
  syncBusy.value = true
  try {
    await sync.rollback(b.id)
    store.toast(m.value.sync.rolledBack, 'success')
    await loadBackups()
  } catch (e) {
    store.toast(errorText((e as { code?: ApiErrorCode }).code ?? 'network'), 'error')
  } finally {
    syncBusy.value = false
  }
}

async function removeBackup(b: BackupInfo) {
  const ok = await store.confirm(t('sync.deleteBackupConfirm', { time: dateTime(b.at) }), {
    danger: true,
    okText: m.value.common.delete,
  })
  if (!ok || !sync.api) return
  await sync.api.deleteBackup(b.id).catch(() => undefined)
  await loadBackups()
}

function formatSize(n: number) {
  return n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`
}

function close() {
  recording.value = null
  store.ui.settingsOpen = false
}
</script>

<template>
  <Transition name="m-drawer">
    <div
      v-if="store.ui.settingsOpen"
      class="m-drawer-layer"
      @pointerdown.self="close"
      @keydown.esc="!recording && close()"
    >
      <aside
        ref="panel"
        class="m-drawer m-glass"
        role="dialog"
        aria-modal="true"
        :aria-label="m.settings.title"
        tabindex="-1"
      >
        <header class="m-drawer__head">
          <div>
            <p class="m-eyebrow">SETTINGS</p>
            <h2 class="m-drawer__title">{{ m.settings.title }}</h2>
          </div>
          <button type="button" class="m-icon-btn" :aria-label="m.common.close" @click="close">
            <X :size="20" />
          </button>
        </header>
        <nav class="m-drawer__nav" :aria-label="m.settings.title">
          <button
            v-for="sec in SECTIONS"
            :key="sec"
            type="button"
            class="m-drawer__tab"
            :aria-current="section === sec ? 'page' : undefined"
            @click="section = sec"
          >
            {{ m.settings.sections[sec] }}
          </button>
        </nav>

        <div class="m-drawer__body">
          <!-- 外观 -->
          <section v-if="section === 'appearance'">
            <SettingRow :label="m.settings.appearance.language">
              <select v-model="s.language" class="m-select m-select--auto">
                <option v-for="o in languageOptions" :key="o.value" :value="o.value">
                  {{ o.label }}
                </option>
              </select>
            </SettingRow>
            <SettingRow :label="m.settings.appearance.palette" stacked>
              <div class="m-palettes" role="radiogroup" :aria-label="m.settings.appearance.palette">
                <button
                  v-for="(bg, p) in PALETTE_SWATCH"
                  :key="p"
                  type="button"
                  role="radio"
                  class="m-palette"
                  :aria-checked="s.palette === p"
                  @click="s.palette = p"
                >
                  <span class="m-palette__swatch" :style="{ background: bg }" />
                  {{ m.settings.appearance.palettes[p] }}
                </button>
              </div>
            </SettingRow>
            <SettingRow :label="m.settings.appearance.theme">
              <MSeg
                v-model="s.theme"
                :options="opts(['dark', 'light', 'auto'] as const, m.settings.appearance.themes)"
                :label="m.settings.appearance.theme"
              />
            </SettingRow>
            <SettingRow :label="m.settings.appearance.density">
              <MSeg
                v-model="s.layout.density"
                :options="
                  opts(['comfortable', 'compact'] as const, m.settings.appearance.densities)
                "
                :label="m.settings.appearance.density"
              />
            </SettingRow>
            <SettingRow
              :label="m.settings.appearance.reducedMotion"
              :desc="m.settings.appearance.reducedMotionDesc"
            >
              <MSeg
                v-model="s.reducedMotion"
                :options="triOptions"
                :label="m.settings.appearance.reducedMotion"
              />
            </SettingRow>
          </section>

          <!-- 背景 -->
          <section v-else-if="section === 'background'">
            <SettingRow :label="m.settings.background.mode">
              <MSeg
                v-model="s.background.mode"
                :options="opts(['solid', 'wallpaper'] as const, m.settings.background.modes)"
                :label="m.settings.background.mode"
              />
            </SettingRow>
            <template v-if="s.background.mode === 'wallpaper'">
              <p class="m-drawer__note">
                {{ m.settings.background.perCombo }} {{ m.settings.background.videoNote }}
              </p>
              <div
                v-for="c in COMBOS"
                :key="c"
                class="m-wall"
                :class="{ 'is-current': c === currentCombo }"
              >
                <div class="m-wall__head">
                  <span class="m-wall__name">{{ comboLabel(c) }}</span>
                  <span v-if="c === currentCombo" class="m-wall__badge">{{
                    m.settings.background.current
                  }}</span>
                  <select
                    :value="wallSource(c)"
                    class="m-select m-select--auto"
                    :aria-label="`${comboLabel(c)} ${m.settings.background.source}`"
                    @change="
                      setWallSource(c, ($event.target as HTMLSelectElement).value as WallSource)
                    "
                  >
                    <option v-for="o in wallSourceOptions" :key="o.value" :value="o.value">
                      {{ o.label }}
                    </option>
                  </select>
                </div>
                <input
                  v-if="wallSource(c) === 'url'"
                  class="m-input"
                  type="url"
                  :value="wallUrl(c)"
                  :placeholder="m.settings.background.urlPlaceholder"
                  @change="setWallUrl(c, ($event.target as HTMLInputElement).value)"
                />
                <p
                  v-if="wallSource(c) === 'unsplash' && !sync.canUnsplash.value"
                  class="m-wall__file"
                >
                  {{ m.settings.background.unsplashNote }}
                </p>
                <div v-if="wallSource(c) === 'upload'" class="m-wall__file">
                  <span>{{ wallName(c) }}</span>
                  <button
                    type="button"
                    class="m-btn m-btn--small"
                    @click="setWallSource(c, 'upload')"
                  >
                    {{ m.settings.background.choose }}
                  </button>
                </div>
              </div>
              <input
                ref="fileInput"
                type="file"
                accept="image/*,video/*"
                class="visually-hidden"
                tabindex="-1"
                @change="onWallFile"
              />
              <SettingRow :label="m.settings.background.blur">
                <MRange
                  v-model="s.background.blur"
                  :min="0"
                  :max="30"
                  :step="1"
                  :label="m.settings.background.blur"
                  :format="(v) => `${v}px`"
                />
              </SettingRow>
              <SettingRow :label="m.settings.background.dim">
                <MRange
                  v-model="s.background.dim"
                  :min="0"
                  :max="0.8"
                  :step="0.05"
                  :label="m.settings.background.dim"
                  :format="(v) => `${Math.round(v * 100)}%`"
                />
              </SettingRow>
              <SettingRow :label="m.settings.background.brightness">
                <MRange
                  v-model="s.background.brightness"
                  :min="0.4"
                  :max="1.2"
                  :step="0.05"
                  :label="m.settings.background.brightness"
                  :format="(v) => `${Math.round(v * 100)}%`"
                />
              </SettingRow>
              <SettingRow :label="m.settings.background.darkAutoDim">
                <MSwitch
                  v-model="s.background.darkAutoDim"
                  :label="m.settings.background.darkAutoDim"
                />
              </SettingRow>
            </template>
          </section>

          <!-- 布局 -->
          <section v-else-if="section === 'layout'">
            <SettingRow :label="m.settings.layout.mode" :desc="m.settings.layout.modeDesc">
              <MSeg
                v-model="s.layout.mode"
                :options="opts(['grid', 'minimal'] as const, m.settings.layout.modes)"
                :label="m.settings.layout.mode"
              />
            </SettingRow>
            <SettingRow :label="m.settings.layout.groupPosition">
              <MSeg
                v-model="s.layout.groupPosition"
                :options="opts(['top', 'side'] as const, m.settings.layout.positions)"
                :label="m.settings.layout.groupPosition"
              />
            </SettingRow>
            <SettingRow :label="m.settings.layout.transition">
              <MSeg
                v-model="s.layout.transition"
                :options="opts(['slide', 'fade'] as const, m.settings.layout.transitions)"
                :label="m.settings.layout.transition"
              />
            </SettingRow>
            <SettingRow
              :label="m.settings.layout.wheelSwitch"
              :desc="m.settings.layout.wheelSwitchDesc"
            >
              <MSwitch v-model="s.layout.wheelSwitch" :label="m.settings.layout.wheelSwitch" />
            </SettingRow>
          </section>

          <!-- 图标 -->
          <section v-else-if="section === 'icons'">
            <SettingRow :label="m.settings.icons.size">
              <MSeg
                v-model="s.icons.size"
                :options="
                  ([48, 56, 64, 72, 88] as const).map((v) => ({ value: v, label: String(v) }))
                "
                :label="m.settings.icons.size"
              />
            </SettingRow>
            <SettingRow :label="m.settings.icons.radius">
              <MSeg
                v-model="s.icons.radius"
                :options="opts(['default', 'large', 'round'] as const, m.settings.icons.radii)"
                :label="m.settings.icons.radius"
              />
            </SettingRow>
            <SettingRow :label="m.settings.icons.showLabels">
              <MSwitch v-model="s.icons.showLabels" :label="m.settings.icons.showLabels" />
            </SettingRow>
            <SettingRow :label="m.settings.icons.openIn">
              <MSeg
                v-model="s.openIn"
                :options="opts(['current', 'new'] as const, m.settings.icons.openTargets)"
                :label="m.settings.icons.openIn"
              />
            </SettingRow>
            <SettingRow :label="m.settings.icons.provider" :desc="m.settings.icons.providerDesc">
              <select v-model="s.icons.faviconProvider" class="m-select m-select--auto">
                <option v-for="(label, p) in m.settings.icons.providers" :key="p" :value="p">
                  {{ label }}
                </option>
              </select>
            </SettingRow>
            <SettingRow :label="m.settings.icons.refreshIcons">
              <button type="button" class="m-btn m-btn--small" @click="refreshIcons">
                {{ m.settings.icons.refreshIcons }}
              </button>
            </SettingRow>
          </section>

          <!-- Dock -->
          <section v-else-if="section === 'dock'">
            <SettingRow :label="m.settings.dock.visibility">
              <MSeg
                v-model="s.dock.visibility"
                :options="
                  opts(['always', 'auto-hide', 'hidden'] as const, m.settings.dock.visibilities)
                "
                :label="m.settings.dock.visibility"
              />
            </SettingRow>
            <SettingRow :label="m.settings.dock.hover">
              <MSeg
                v-model="s.dock.hover"
                :options="opts(['magnify', 'lift'] as const, m.settings.dock.hovers)"
                :label="m.settings.dock.hover"
              />
            </SettingRow>
          </section>

          <!-- 搜索 -->
          <section v-else-if="section === 'search'">
            <SettingRow :label="m.settings.search.defaultEngine">
              <select v-model="s.search.defaultEngine" class="m-select m-select--auto">
                <option v-for="e in engines.filter((x) => x.enabled)" :key="e.id" :value="e.id">
                  {{ e.name }}
                </option>
              </select>
            </SettingRow>
            <SettingRow
              :label="m.settings.search.engines"
              :desc="m.settings.search.enginesDesc"
              stacked
            >
              <ul class="m-engines">
                <li v-for="e in engines" :key="e.id" class="m-engine">
                  <MSwitch
                    :model-value="e.enabled"
                    :label="e.name"
                    :disabled="e.id === s.search.defaultEngine"
                    @update:model-value="engineSetting(e.id).enabled = $event"
                  />
                  <span class="m-engine__name">{{ e.name }}</span>
                  <input
                    class="m-input m-engine__prefix"
                    :value="e.prefix"
                    :aria-label="`${e.name} ${m.settings.search.prefix}`"
                    :placeholder="m.settings.search.prefix"
                    maxlength="8"
                    @change="
                      engineSetting(e.id).prefix = ($event.target as HTMLInputElement).value.trim()
                    "
                  />
                  <button
                    v-if="e.custom"
                    type="button"
                    class="m-icon-btn m-icon-btn--small"
                    :aria-label="m.common.delete"
                    @click="removeCustom(e.id)"
                  >
                    <Trash2 :size="15" />
                  </button>
                </li>
              </ul>
            </SettingRow>
            <SettingRow :label="m.settings.search.addCustom" stacked>
              <form class="m-custom" @submit.prevent="addCustom">
                <input
                  v-model="custom.name"
                  class="m-input"
                  :placeholder="m.settings.search.customName"
                />
                <input
                  v-model="custom.url"
                  class="m-input"
                  placeholder="https://example.com/search?q=%s"
                  :aria-label="m.settings.search.customUrl"
                />
                <input
                  v-model="custom.suggestUrl"
                  class="m-input"
                  :placeholder="m.settings.search.customSuggest"
                />
                <p v-if="customError" class="m-error">{{ m.settings.search.customInvalid }}</p>
                <button type="submit" class="m-btn m-btn--small">
                  <Plus :size="14" />{{ m.common.add }}
                </button>
              </form>
            </SettingRow>
            <SettingRow :label="m.settings.search.switchBy" stacked>
              <label class="m-check"
                ><MSwitch
                  v-model="s.search.switchByClick"
                  :label="m.settings.search.switchByClick"
                />{{ m.settings.search.switchByClick }}</label
              >
              <label class="m-check"
                ><MSwitch
                  v-model="s.search.switchByPrefix"
                  :label="m.settings.search.switchByPrefix"
                />{{ m.settings.search.switchByPrefix }}</label
              >
              <label class="m-check"
                ><MSwitch v-model="s.search.switchByTab" :label="m.settings.search.switchByTab" />{{
                  m.settings.search.switchByTab
                }}</label
              >
            </SettingRow>
            <SettingRow :label="m.settings.search.suggestions">
              <MSwitch
                v-model="s.search.suggestions.enabled"
                :label="m.settings.search.suggestions"
              />
            </SettingRow>
            <SettingRow
              v-if="s.search.suggestions.enabled"
              :label="m.settings.search.suggestions"
              stacked
            >
              <label class="m-check"
                ><MSwitch
                  v-model="s.search.suggestions.engine"
                  :label="m.settings.search.suggestEngine"
                />{{ m.settings.search.suggestEngine }}</label
              >
              <label class="m-check"
                ><MSwitch
                  v-model="s.search.suggestions.history"
                  :label="m.settings.search.suggestHistory"
                />{{ m.settings.search.suggestHistory }}</label
              >
              <label class="m-check"
                ><MSwitch
                  v-model="s.search.suggestions.shortcuts"
                  :label="m.settings.search.suggestShortcuts"
                />{{ m.settings.search.suggestShortcuts }}</label
              >
            </SettingRow>
            <SettingRow :label="m.settings.search.keepHistory">
              <button type="button" class="m-btn m-btn--small" @click="clearHistory">
                {{ m.settings.search.clearHistory }}
              </button>
              <MSwitch v-model="s.search.keepHistory" :label="m.settings.search.keepHistory" />
            </SettingRow>
            <SettingRow :label="m.settings.search.openIn">
              <MSeg
                v-model="s.search.openIn"
                :options="opts(['current', 'new'] as const, m.settings.icons.openTargets)"
                :label="m.settings.search.openIn"
              />
            </SettingRow>
            <SettingRow
              v-if="store.platform.grabFocus"
              :label="m.settings.search.grabFocus"
              :desc="m.settings.search.grabFocusDesc"
            >
              <MSwitch v-model="s.search.grabFocus" :label="m.settings.search.grabFocus" />
            </SettingRow>
          </section>

          <!-- 快捷键 -->
          <section v-else-if="section === 'shortcuts'">
            <SettingRow v-for="a in ACTIONS" :key="a" :label="m.settings.shortcuts.actions[a]">
              <span v-for="(b, i) in s.shortcuts.bindings[a]" :key="b" class="m-bind">
                <kbd class="m-kbd">{{ formatCombo(b) }}</kbd>
                <button
                  type="button"
                  class="m-bind__x"
                  :aria-label="`${m.common.remove} ${formatCombo(b)}`"
                  @click="s.shortcuts.bindings[a].splice(i, 1)"
                >
                  <X :size="12" />
                </button>
              </span>
              <button
                type="button"
                class="m-btn m-btn--small"
                :class="{ 'is-recording': recording === a }"
                @click="recording = recording === a ? null : a"
              >
                {{
                  recording === a ? m.settings.shortcuts.recording : m.settings.shortcuts.addBinding
                }}
              </button>
            </SettingRow>
            <SettingRow :label="m.settings.shortcuts.typeToSearch">
              <MSwitch
                v-model="s.shortcuts.typeToSearch"
                :label="m.settings.shortcuts.typeToSearch"
              />
            </SettingRow>
            <SettingRow :label="m.settings.shortcuts.digitGroups">
              <MSwitch
                v-model="s.shortcuts.digitGroups"
                :label="m.settings.shortcuts.digitGroups"
              />
            </SettingRow>
            <SettingRow :label="m.settings.shortcuts.showHints">
              <MSwitch v-model="s.shortcuts.showHints" :label="m.settings.shortcuts.showHints" />
            </SettingRow>
          </section>

          <!-- 时钟 -->
          <section v-else-if="section === 'clock'">
            <SettingRow :label="m.settings.clock.showTime" :desc="m.settings.clock.showTimeDesc">
              <MSwitch v-model="s.clock.showTime" :label="m.settings.clock.showTime" />
            </SettingRow>
            <SettingRow :label="m.settings.clock.showSeconds">
              <MSwitch v-model="s.clock.showSeconds" :label="m.settings.clock.showSeconds" />
            </SettingRow>
            <SettingRow :label="m.settings.clock.hour12">
              <MSwitch v-model="s.clock.hour12" :label="m.settings.clock.hour12" />
            </SettingRow>
            <SettingRow :label="m.settings.clock.timeZone">
              <select v-model="s.clock.timeZone" class="m-select m-select--zone">
                <option value="">{{ t('settings.clock.timeZoneAuto', { zone: autoZone }) }}</option>
                <option v-for="z in zones" :key="z" :value="z">{{ z }}</option>
              </select>
            </SettingRow>
            <SettingRow :label="m.settings.clock.extraZones" stacked>
              <div v-for="(z, i) in s.clock.extraZones" :key="z.zone" class="m-zone">
                <span class="m-zone__name">{{ z.zone }}</span>
                <input
                  v-model="z.label"
                  class="m-input"
                  :aria-label="m.settings.clock.extraZoneLabel"
                  :placeholder="m.settings.clock.extraZoneLabel"
                />
                <button
                  type="button"
                  class="m-icon-btn m-icon-btn--small"
                  :aria-label="m.common.remove"
                  @click="s.clock.extraZones.splice(i, 1)"
                >
                  <Trash2 :size="15" />
                </button>
              </div>
              <div class="m-zone">
                <select
                  v-model="newZone"
                  class="m-select m-select--zone"
                  :aria-label="m.settings.clock.addZone"
                >
                  <option v-for="z in zones" :key="z" :value="z">{{ z }}</option>
                </select>
                <button type="button" class="m-btn m-btn--small" @click="addZone">
                  <Plus :size="14" />{{ m.settings.clock.addZone }}
                </button>
              </div>
            </SettingRow>
            <SettingRow :label="m.settings.clock.showDate">
              <MSwitch v-model="s.clock.showDate" :label="m.settings.clock.showDate" />
            </SettingRow>
            <SettingRow :label="m.settings.clock.showWeekday">
              <MSwitch v-model="s.clock.showWeekday" :label="m.settings.clock.showWeekday" />
            </SettingRow>
            <SettingRow :label="m.settings.clock.lunar" :desc="m.settings.clock.triAutoDesc">
              <MSeg v-model="s.clock.lunar" :options="triOptions" :label="m.settings.clock.lunar" />
            </SettingRow>
            <SettingRow :label="m.settings.clock.holidays" :desc="m.settings.clock.triAutoDesc">
              <MSeg
                v-model="s.clock.holidays"
                :options="triOptions"
                :label="m.settings.clock.holidays"
              />
            </SettingRow>
            <SettingRow :label="m.settings.clock.ganzhi">
              <MSwitch v-model="s.clock.ganzhi" :label="m.settings.clock.ganzhi" />
            </SettingRow>
            <SettingRow :label="m.settings.clock.solarTerms">
              <MSwitch v-model="s.clock.solarTerms" :label="m.settings.clock.solarTerms" />
            </SettingRow>
            <SettingRow :label="m.settings.clock.festivals">
              <MSwitch v-model="s.clock.festivals" :label="m.settings.clock.festivals" />
            </SettingRow>
            <SettingRow :label="m.settings.clock.dayOfYear">
              <MSwitch v-model="s.clock.dayOfYear" :label="m.settings.clock.dayOfYear" />
            </SettingRow>
            <SettingRow :label="m.settings.clock.weekNumber">
              <MSwitch v-model="s.clock.weekNumber" :label="m.settings.clock.weekNumber" />
            </SettingRow>
            <SettingRow :label="m.settings.clock.weekStart">
              <MSeg
                v-model="s.clock.weekStart"
                :options="
                  ([1, 0] as const).map((v) => ({
                    value: v,
                    label: m.settings.clock.weekStarts[v],
                  }))
                "
                :label="m.settings.clock.weekStart"
              />
            </SettingRow>
          </section>

          <!-- 同步 -->
          <section v-else-if="section === 'sync'">
            <p class="m-drawer__note">{{ m.sync.intro }}</p>
            <div class="m-sync-status" :class="`is-${sync.state.status}`" role="status">
              <span class="m-sync-status__dot" aria-hidden="true" />
              <div class="m-sync-status__text">
                <strong>{{ m.sync.status[sync.state.status] }}</strong>
                <span v-if="sync.state.status === 'error'">{{ errorText(sync.state.error) }}</span>
                <span v-else-if="sync.state.identity && sync.active.value">
                  {{ sync.state.identity }}
                  <template v-if="sc.lastSync">
                    · {{ t('sync.lastSync', { time: relTime(sc.lastSync) }) }}</template
                  >
                  <template v-if="sync.state.pending"> · {{ m.sync.pending }}</template>
                </span>
              </div>
              <button
                v-if="sync.active.value"
                type="button"
                class="m-icon-btn"
                :aria-label="m.sync.syncNow"
                :title="m.sync.syncNow"
                :disabled="sync.state.status === 'syncing'"
                @click="sync.syncNow()"
              >
                <RefreshCw :size="16" :class="{ 'm-spin': sync.state.status === 'syncing' }" />
              </button>
            </div>

            <SettingRow :label="m.sync.server" :desc="m.sync.serverDesc" stacked>
              <input
                v-model.trim="sc.apiBase"
                class="m-input"
                type="url"
                name="myriad-api-base"
                inputmode="url"
                spellcheck="false"
                autocomplete="off"
                :disabled="sc.enabled"
              />
            </SettingRow>
            <SettingRow :label="m.sync.token" :desc="m.sync.tokenDesc" stacked>
              <div class="m-sync-token">
                <input
                  v-model.trim="sc.clientId"
                  class="m-input"
                  name="myriad-client-id"
                  :placeholder="m.sync.clientId"
                  :aria-label="m.sync.clientId"
                  spellcheck="false"
                  autocomplete="off"
                  :disabled="sc.enabled"
                />
                <input
                  v-model.trim="sc.clientSecret"
                  class="m-input"
                  type="password"
                  name="myriad-client-secret"
                  :placeholder="m.sync.clientSecret"
                  :aria-label="m.sync.clientSecret"
                  autocomplete="off"
                  :disabled="sc.enabled"
                />
              </div>
            </SettingRow>
            <div class="m-sync-actions">
              <button
                v-if="!sc.enabled"
                type="button"
                class="m-btn m-btn--primary"
                :disabled="syncBusy || !sc.apiBase"
                @click="onConnect"
              >
                {{ sync.state.status === 'connecting' ? m.sync.status.connecting : m.sync.connect }}
              </button>
              <button v-else type="button" class="m-btn m-btn--danger" @click="onDisconnect">
                {{ m.sync.disconnect }}
              </button>
            </div>

            <template v-if="sc.enabled">
              <h3 class="m-drawer__sub">{{ m.sync.scopes }}</h3>
              <p class="m-drawer__note">{{ m.sync.scopesDesc }}</p>
              <SettingRow
                v-for="scope in SYNC_SCOPES"
                :key="scope"
                :label="m.sync.scopeNames[scope]"
              >
                <MSwitch v-model="sc.scopes[scope]" :label="m.sync.scopeNames[scope]" />
              </SettingRow>
              <SettingRow :label="m.sync.iconProxy" :desc="m.sync.iconProxyDesc">
                <MSwitch v-model="sc.iconProxy" :label="m.sync.iconProxy" />
              </SettingRow>

              <template v-if="sync.canBackups.value">
                <h3 class="m-drawer__sub">{{ m.sync.backups }}</h3>
                <p class="m-drawer__note">{{ m.sync.backupsDesc }}</p>
                <SettingRow :label="m.sync.backupEnabled">
                  <MSwitch
                    v-model="backupCfg.enabled"
                    :label="m.sync.backupEnabled"
                    @update:model-value="saveBackupCfg"
                  />
                </SettingRow>
                <SettingRow :label="m.sync.backupKeep">
                  <select
                    v-model.number="backupCfg.keep"
                    class="m-select m-select--auto"
                    name="myriad-backup-keep"
                    @change="saveBackupCfg"
                  >
                    <option v-for="n in KEEP_OPTIONS" :key="n" :value="n">{{ n }}</option>
                  </select>
                </SettingRow>
                <ul v-if="backups.length" class="m-backups">
                  <li v-for="b in backups" :key="b.id" class="m-backup">
                    <span class="m-backup__badge">{{ m.sync.backupReasons[b.reason] }}</span>
                    <span class="m-backup__time">{{ dateTime(b.at) }}</span>
                    <span class="m-backup__size">{{ formatSize(b.size) }}</span>
                    <button
                      type="button"
                      class="m-btn m-btn--small"
                      :disabled="syncBusy"
                      @click="rollbackTo(b)"
                    >
                      <History :size="14" />{{ m.sync.rollback }}
                    </button>
                    <button
                      type="button"
                      class="m-icon-btn"
                      :aria-label="m.common.delete"
                      @click="removeBackup(b)"
                    >
                      <Trash2 :size="15" />
                    </button>
                  </li>
                </ul>
                <p v-else class="m-drawer__note">{{ m.sync.backupNone }}</p>
                <button
                  type="button"
                  class="m-btn m-btn--small"
                  :disabled="syncBusy"
                  @click="backupNow"
                >
                  {{ m.sync.backupNow }}
                </button>
              </template>
            </template>
          </section>

          <!-- 数据 -->
          <section v-else-if="section === 'data'">
            <SettingRow
              v-if="store.platform.bookmarks"
              :label="m.settings.data.bookmarks"
              :desc="m.settings.data.bookmarksDesc"
            >
              <button
                type="button"
                class="m-btn m-btn--small"
                @click="store.ui.bookmarkImportOpen = true"
              >
                {{ m.bookmarks.import }}
              </button>
            </SettingRow>
            <SettingRow :label="m.settings.data.export" :desc="m.settings.data.exportDesc">
              <button type="button" class="m-btn m-btn--small" @click="doExport">
                <Download :size="14" />{{ m.settings.data.export }}
              </button>
            </SettingRow>
            <SettingRow :label="m.settings.data.import" :desc="m.settings.data.importDesc" stacked>
              <MSeg
                v-model="importMode"
                :options="[
                  { value: 'append', label: m.settings.data.importAppend },
                  { value: 'replace', label: m.settings.data.importReplace },
                ]"
                :label="m.settings.data.importMode"
              />
              <label class="m-check"
                ><MSwitch v-model="importSettings" :label="m.settings.data.importSettings" />{{
                  m.settings.data.importSettings
                }}</label
              >
              <button type="button" class="m-btn m-btn--small" @click="importInput?.click()">
                <Upload :size="14" />{{ m.settings.data.import }}
              </button>
              <input
                ref="importInput"
                type="file"
                accept="application/json,.json"
                class="visually-hidden"
                tabindex="-1"
                @change="onImportFile"
              />
            </SettingRow>
            <SettingRow :label="m.settings.data.preset">
              <button type="button" class="m-btn m-btn--small" @click="restorePreset">
                {{ m.settings.data.preset }}
              </button>
            </SettingRow>
            <SettingRow :label="m.settings.data.resetSettings">
              <button type="button" class="m-btn m-btn--small m-btn--danger" @click="resetSettings">
                {{ m.common.reset }}
              </button>
            </SettingRow>
            <SettingRow :label="m.settings.data.clearAll">
              <button type="button" class="m-btn m-btn--small m-btn--danger" @click="clearAll">
                {{ m.common.clear }}
              </button>
            </SettingRow>
          </section>

          <!-- 关于 -->
          <section v-else class="m-about">
            <img class="m-about__logo" :src="logoUrl" alt="" width="72" height="72" />
            <p class="m-about__name">{{ m.app.name }} <small>Myriad</small></p>
            <p class="m-about__slogan">{{ m.app.slogan }}</p>
            <p class="m-about__meta">
              {{ t('settings.about.version', { version: store.platform.version }) }} ·
              {{ m.settings.about.platform[store.platform.kind] }} · {{ m.settings.about.license }}
            </p>
            <a
              v-if="store.platform.repoUrl"
              class="m-btn m-btn--small"
              :href="store.platform.repoUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink :size="14" />{{ m.settings.about.source }}
            </a>
          </section>
        </div>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.m-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgb(5 6 12 / 28%);
}
.m-drawer {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  width: min(460px, calc(100vw - 24px));
  border-radius: 26px;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  outline: none;
}
.m-drawer__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 18px 8px 26px;
}
.m-drawer__title {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 650;
}
.m-drawer__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 22px 14px;
  border-bottom: 1px solid var(--border);
}
.m-drawer__tab {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 500;
}
.m-drawer__tab:hover {
  color: var(--text);
  background: var(--interactive-hover);
}
.m-drawer__tab[aria-current='page'] {
  border-color: transparent;
  background: var(--seg-selected-bg);
  color: var(--text);
  font-weight: 650;
  box-shadow: inset 0 0 0 1px var(--seg-selected-border);
}
.m-drawer__body {
  flex: 1;
  padding: 8px 26px 26px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.m-drawer__note {
  margin: 10px 0 4px;
  color: var(--muted);
  font-size: 12px;
}
.m-select--auto {
  width: auto;
  min-width: 140px;
}
.m-select--zone {
  width: 220px;
}
.m-palettes {
  display: flex;
  gap: 10px;
}
.m-palette {
  display: inline-flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 6px 14px 6px 8px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--secondary-surface);
  font-size: 13px;
  font-weight: 600;
}
.m-palette[aria-checked='true'] {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 18%, transparent);
}
.m-palette__swatch {
  width: 32px;
  height: 32px;
  border-radius: 10px;
}
.m-wall {
  display: grid;
  gap: 8px;
  margin: 8px 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 16px;
}
.m-wall.is-current {
  border-color: var(--project-hover-border);
}
.m-wall__head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.m-wall__name {
  flex: 1;
  font-size: 13px;
  font-weight: 550;
}
.m-wall__badge {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--tag-surface);
  color: var(--blue);
  font-size: 11px;
}
.m-wall__file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}
.m-engines {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.m-engine {
  display: flex;
  align-items: center;
  gap: 10px;
}
.m-engine__name {
  flex: 1;
  font-size: 13px;
}
.m-engine__prefix {
  width: 84px;
  min-height: 32px;
  padding: 4px 10px;
  font-family: var(--font-mono);
}
.m-custom {
  display: grid;
  gap: 8px;
}
.m-custom .m-btn {
  justify-self: start;
}
.m-check {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  font-size: 13px;
}
.m-bind {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.m-bind__x {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
}
.m-bind__x:hover {
  background: var(--interactive-hover);
  color: var(--status-danger);
}
.is-recording {
  border-color: var(--blue);
  color: var(--blue);
}
.m-zone {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.m-zone__name {
  width: 140px;
  overflow: hidden;
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.m-zone .m-input {
  flex: 1;
}
.m-drawer__sub {
  margin: 22px 0 2px;
  font-size: 14px;
  font-weight: 650;
}
.m-sync-status {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0 6px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--secondary-surface);
}
.m-sync-status__dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--muted);
}
.m-sync-status.is-idle .m-sync-status__dot {
  background: var(--status-success, #3fb37f);
}
.m-sync-status.is-syncing .m-sync-status__dot,
.m-sync-status.is-connecting .m-sync-status__dot {
  background: var(--blue);
}
.m-sync-status.is-offline .m-sync-status__dot {
  background: var(--status-warning, #e0a43a);
}
.m-sync-status.is-error .m-sync-status__dot {
  background: var(--status-danger);
}
.m-sync-status__text {
  display: grid;
  flex: 1;
  gap: 2px;
  min-width: 0;
  font-size: 13px;
}
.m-sync-status__text span {
  overflow: hidden;
  color: var(--muted);
  font-size: 12px;
  text-overflow: ellipsis;
}
.m-sync-token {
  display: grid;
  gap: 8px;
  width: 100%;
}
.m-sync-actions {
  display: flex;
  gap: 8px;
  padding: 12px 0 4px;
}
.m-spin {
  animation: m-spin 1s linear infinite;
}
@keyframes m-spin {
  to {
    rotate: 360deg;
  }
}
.m-backups {
  display: grid;
  gap: 6px;
  margin: 8px 0 12px;
  padding: 0;
  list-style: none;
}
.m-backup {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 6px 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  font-size: 12.5px;
}
.m-backup__badge {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--tag-surface);
  color: var(--blue);
  font-size: 11px;
  white-space: nowrap;
}
.m-backup__time {
  flex: 1;
  font-variant-numeric: tabular-nums;
}
.m-backup__size {
  color: var(--muted);
  font-size: 11.5px;
}
.m-about {
  display: grid;
  justify-items: start;
  gap: 8px;
  padding-top: 18px;
}
.m-about p {
  margin: 0;
}
.m-about__logo {
  display: block;
  width: 72px;
  height: 72px;
  margin-bottom: 4px;
}
.m-about__name {
  font-size: 28px;
  font-weight: 800;
}
.m-about__name small {
  color: var(--muted);
  font-size: 14px;
  font-weight: 500;
}
.m-about__slogan {
  background: linear-gradient(
    110deg,
    var(--title-gradient-start),
    var(--title-gradient-mid) 58%,
    var(--title-gradient-end)
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-size: 16px;
  font-weight: 650;
}
.m-about__meta {
  color: var(--muted);
  font-size: 12.5px;
}
.m-drawer-enter-active,
.m-drawer-leave-active {
  transition: opacity 0.3s ease;
}
.m-drawer-enter-active .m-drawer,
.m-drawer-leave-active .m-drawer {
  transition: transform 0.42s var(--motion-ease);
}
.m-drawer-enter-from,
.m-drawer-leave-to {
  opacity: 0;
}
.m-drawer-enter-from .m-drawer,
.m-drawer-leave-to .m-drawer {
  transform: translateX(calc(100% + 24px));
}
@media (prefers-reduced-motion: reduce) {
  .m-spin {
    animation: none;
  }
  .m-drawer-enter-active,
  .m-drawer-leave-active,
  .m-drawer-enter-active .m-drawer,
  .m-drawer-leave-active .m-drawer {
    transition: none;
  }
}
</style>
