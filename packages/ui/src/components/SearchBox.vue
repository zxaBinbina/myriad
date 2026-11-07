<script setup lang="ts">
import {
  allShortcuts,
  buildSearchUrl,
  formatCombo,
  hostnameOf,
  type IconSpec,
  matchAny,
  matchPrefix,
  normalizeUrl,
  parseSuggestions,
  resolveEngines,
} from '@myriad/core'
import { ChevronDown, Clock3, Globe, Search, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import ItemIcon from './ItemIcon.vue'

const store = useStore()
const { m, t, lang } = useI18n()

const s = computed(() => store.settings.search)
const engines = computed(() => resolveEngines(s.value, lang.value))
const enabled = computed(() => engines.value.filter((e) => e.enabled))
const defaultEngine = computed(
  () =>
    enabled.value.find((e) => e.id === s.value.defaultEngine) ??
    enabled.value[0] ??
    engines.value[0]!,
)
/** 本次搜索临时使用的引擎（前缀 / Tab / 点选），不改变默认引擎 */
const overrideId = ref<string | null>(null)
const prefixMode = ref(false)
const engine = computed(
  () => enabled.value.find((e) => e.id === overrideId.value) ?? defaultEngine.value,
)

const input = ref<HTMLInputElement | null>(null)
const query = ref('')
const focused = ref(false)
const menuOpen = ref(false)
const activeIndex = ref(-1)

/* ---------------- 建议 ---------------- */
type Suggestion =
  | { kind: 'url'; text: string; url: string }
  | { kind: 'shortcut'; text: string; url: string; id: string; icon: IconSpec }
  | { kind: 'history'; text: string; engine: string }
  | { kind: 'engine'; text: string }

const remote = ref<string[]>([])
let abort: AbortController | null = null
let debounce: ReturnType<typeof setTimeout> | undefined

function looksLikeUrl(q: string) {
  if (/\s/.test(q)) return false
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(q)) return true
  return /^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/.*)?$/i.test(q)
}

const suggestions = computed<Suggestion[]>(() => {
  const q = query.value.trim()
  if (!q || !s.value.suggestions.enabled) return []
  const lower = q.toLowerCase()
  const out: Suggestion[] = []
  if (!prefixMode.value && looksLikeUrl(q)) out.push({ kind: 'url', text: q, url: normalizeUrl(q) })
  if (s.value.suggestions.shortcuts && !prefixMode.value) {
    const hits = allShortcuts(store.data)
      .filter((x) => x.title.toLowerCase().includes(lower) || hostnameOf(x.url).includes(lower))
      .sort(
        (a, b) =>
          Number(!a.title.toLowerCase().startsWith(lower)) -
          Number(!b.title.toLowerCase().startsWith(lower)),
      )
      .slice(0, 4)
    for (const h of hits)
      out.push({ kind: 'shortcut', text: h.title, url: h.url, id: h.id, icon: h.icon })
  }
  if (s.value.suggestions.history) {
    const seen = new Set<string>()
    for (const h of store.local.searchHistory) {
      if (out.filter((x) => x.kind === 'history').length >= 3) break
      if (seen.has(h.q) || h.q === q || !h.q.toLowerCase().includes(lower)) continue
      seen.add(h.q)
      out.push({ kind: 'history', text: h.q, engine: h.engine })
    }
  }
  if (s.value.suggestions.engine) {
    const taken = new Set(out.map((x) => x.text))
    for (const r of remote.value) {
      if (taken.has(r) || r === q) continue
      out.push({ kind: 'engine', text: r })
      if (out.length >= 10) break
    }
  }
  return out
})

function fetchRemote() {
  clearTimeout(debounce)
  abort?.abort()
  const q = query.value.trim()
  const sug = engine.value.suggest
  if (!q || !sug || !s.value.suggestions.enabled || !s.value.suggestions.engine) {
    remote.value = []
    return
  }
  debounce = setTimeout(async () => {
    abort = new AbortController()
    try {
      const res = await fetch(buildSearchUrl({ url: sug.url }, q), {
        signal: abort.signal,
        credentials: 'omit',
      })
      if (!res.ok) throw new Error(String(res.status))
      const body: unknown = await res.json()
      if (query.value.trim() === q) remote.value = parseSuggestions(sug.format, body).slice(0, 8)
    } catch {
      // 联想失败不影响搜索（网页版多数接口不允许跨域）
      if (query.value.trim() === q) remote.value = []
    }
  }, 140)
}

watch([query, () => engine.value.id], () => {
  activeIndex.value = -1
  fetchRemote()
})
onBeforeUnmount(() => {
  clearTimeout(debounce)
  abort?.abort()
})

/* ---------------- 输入与前缀 ---------------- */
function onInput() {
  if (!s.value.switchByPrefix || prefixMode.value) return
  const hit = matchPrefix(enabled.value, query.value)
  if (hit) {
    overrideId.value = hit.engine.id
    prefixMode.value = true
    query.value = hit.query
  }
}

function cycle(delta: 1 | -1) {
  const list = enabled.value
  if (!list.length) return
  const i = list.findIndex((e) => e.id === engine.value.id)
  overrideId.value = list[(i + delta + list.length) % list.length]!.id
  prefixMode.value = false
}

function pickEngine(id: string) {
  overrideId.value = id
  prefixMode.value = false
  menuOpen.value = false
  nextTick(() => input.value?.focus())
}

function resetEngine() {
  overrideId.value = null
  prefixMode.value = false
}

/* ---------------- 提交 ---------------- */
function submit(text = query.value, useEngine = engine.value) {
  const q = text.trim()
  if (!q) return
  const newTab = s.value.openIn === 'new'
  if (!prefixMode.value && looksLikeUrl(q) && text === query.value && activeIndex.value < 0) {
    store.openUrl(normalizeUrl(q), newTab)
  } else {
    if (s.value.keepHistory) {
      const list = store.local.searchHistory.filter((h) => h.q !== q)
      list.unshift({ q, engine: useEngine.id, at: Date.now() })
      store.local.searchHistory = list.slice(0, 100)
    }
    store.openUrl(buildSearchUrl(useEngine, q), newTab)
  }
  if (newTab) {
    query.value = ''
    resetEngine()
  }
}

function choose(sug: Suggestion) {
  const newTab = s.value.openIn === 'new'
  if (sug.kind === 'url' || sug.kind === 'shortcut')
    store.openUrl(sug.url, sug.kind === 'shortcut' ? store.settings.openIn === 'new' : newTab)
  else if (sug.kind === 'history')
    submit(sug.text, enabled.value.find((e) => e.id === sug.engine) ?? engine.value)
  else submit(sug.text)
}

function removeHistory(q: string) {
  store.local.searchHistory = store.local.searchHistory.filter((h) => h.q !== q)
}

/* ---------------- 键盘 ---------------- */
function onKeydown(e: KeyboardEvent) {
  const binds = store.settings.shortcuts.bindings
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!suggestions.value.length) return
    e.preventDefault()
    const n = suggestions.value.length
    activeIndex.value =
      e.key === 'ArrowDown' ? (activeIndex.value + 1) % n : (activeIndex.value - 1 + n) % n
    return
  }
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault()
    const sug = suggestions.value[activeIndex.value]
    if (sug) choose(sug)
    else submit()
    return
  }
  if (e.key === 'Backspace' && !query.value && overrideId.value) {
    e.preventDefault()
    resetEngine()
    return
  }
  if (
    s.value.switchByTab &&
    (matchAny(binds.cycleEngine, e) ||
      (e.key === 'Tab' && e.shiftKey && binds.cycleEngine.includes('Tab')))
  ) {
    e.preventDefault()
    cycle(e.shiftKey ? -1 : 1)
    return
  }
  if (matchAny(binds.clearSearch, e)) {
    e.preventDefault()
    e.stopPropagation()
    if (menuOpen.value) menuOpen.value = false
    else if (query.value || overrideId.value) {
      query.value = ''
      resetEngine()
    } else input.value?.blur()
  }
}

const showSuggestions = computed(() => focused.value && suggestions.value.length > 0)
const focusKey = computed(() => {
  const b = store.settings.shortcuts.bindings.focusSearch[0]
  return b ? formatCombo(b) : ''
})
const placeholder = computed(() =>
  !focused.value && store.settings.shortcuts.showHints && focusKey.value
    ? t('hint.pressToSearch', { key: focusKey.value })
    : m.value.hint.searchPlaceholder,
)
const tabHint = computed(
  () =>
    focused.value &&
    !query.value &&
    store.settings.shortcuts.showHints &&
    s.value.switchByTab &&
    enabled.value.length > 1 &&
    store.settings.shortcuts.bindings.cycleEngine[0],
)

function onBlur(e: FocusEvent) {
  const next = e.relatedTarget as HTMLElement | null
  if (next?.closest('.m-search')) return
  focused.value = false
  menuOpen.value = false
}

function focus(selectAll = false) {
  input.value?.focus()
  if (selectAll) input.value?.select()
}

defineExpose({ focus, input })
</script>

<template>
  <div
    class="m-search"
    :class="{ 'is-focused': focused, 'is-open': showSuggestions || menuOpen }"
    role="search"
  >
    <div class="m-search__bar m-glass">
      <button
        type="button"
        class="m-search__engine"
        :aria-label="`${m.search.switchEngine}：${engine.name}`"
        :title="engine.name"
        :aria-expanded="menuOpen"
        :disabled="!s.switchByClick"
        @click="menuOpen = !menuOpen"
        @focus="focused = true"
        @blur="onBlur"
      >
        <span class="m-search__engine-icon"
          ><ItemIcon :title="engine.name" :url="engine.home" :icon="{ source: 'auto' }"
        /></span>
        <ChevronDown v-if="s.switchByClick" :size="14" class="m-search__chev" />
      </button>
      <span
        v-if="prefixMode || overrideId"
        class="m-search__chip"
        :title="t('search.prefixActive', { engine: engine.name })"
      >
        {{ engine.name }}
        <button
          type="button"
          class="m-search__chip-x"
          :aria-label="m.common.reset"
          @mousedown.prevent
          @click="resetEngine"
        >
          <X :size="12" />
        </button>
      </span>
      <input
        ref="input"
        v-model="query"
        class="m-search__input"
        type="search"
        :placeholder="placeholder"
        :aria-label="m.search.submit"
        autocomplete="off"
        spellcheck="false"
        enterkeyhint="search"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="showSuggestions"
        aria-controls="m-search-suggestions"
        :aria-activedescendant="activeIndex >= 0 ? `m-sug-${activeIndex}` : undefined"
        @input="onInput"
        @keydown="onKeydown"
        @focus="focused = true"
        @blur="onBlur"
      />
      <span v-if="tabHint" class="m-search__hint" aria-hidden="true">
        <kbd class="m-kbd">{{
          formatCombo(store.settings.shortcuts.bindings.cycleEngine[0]!)
        }}</kbd>
        {{ m.search.tabHint.replace(/^Tab\s*/, '') }}
      </span>
      <button
        v-if="query"
        type="button"
        class="m-icon-btn m-icon-btn--small"
        :aria-label="m.search.clear"
        @mousedown.prevent
        @click="query = ''"
      >
        <X :size="16" />
      </button>
      <button
        type="button"
        class="m-search__go"
        :aria-label="m.search.submit"
        @mousedown.prevent
        @click="submit()"
      >
        <Search :size="18" />
      </button>
    </div>

    <Transition name="m-pop">
      <ul
        v-if="menuOpen"
        class="m-search__menu m-glass"
        role="listbox"
        :aria-label="m.search.engine"
      >
        <li v-for="e in enabled" :key="e.id" role="none">
          <button
            type="button"
            role="option"
            class="m-search__option"
            :aria-selected="e.id === engine.id"
            @click="pickEngine(e.id)"
            @blur="onBlur"
          >
            <span class="m-search__opt-icon"
              ><ItemIcon :title="e.name" :url="e.home" :icon="{ source: 'auto' }"
            /></span>
            <span class="m-search__opt-name">{{ e.name }}</span>
            <kbd v-if="e.prefix && s.switchByPrefix" class="m-kbd">{{ e.prefix }}</kbd>
          </button>
        </li>
      </ul>
    </Transition>

    <Transition name="m-pop">
      <ul
        v-if="showSuggestions && !menuOpen"
        id="m-search-suggestions"
        class="m-search__list m-glass"
        role="listbox"
      >
        <li
          v-for="(sug, i) in suggestions"
          :id="`m-sug-${i}`"
          :key="`${sug.kind}:${sug.text}`"
          role="option"
          class="m-search__sug"
          :class="{ 'is-active': i === activeIndex }"
          :aria-selected="i === activeIndex"
          @mousedown.prevent
          @mouseenter="activeIndex = i"
          @click="choose(sug)"
        >
          <span class="m-search__sug-icon">
            <Globe v-if="sug.kind === 'url'" :size="16" />
            <span v-else-if="sug.kind === 'shortcut'" class="m-search__sug-fav">
              <ItemIcon :title="sug.text" :url="sug.url" :icon="sug.icon" />
            </span>
            <Clock3 v-else-if="sug.kind === 'history'" :size="16" />
            <Search v-else :size="16" />
          </span>
          <span class="m-search__sug-text">{{
            sug.kind === 'url' ? t('search.openUrl', { url: sug.text }) : sug.text
          }}</span>
          <span v-if="sug.kind === 'shortcut'" class="m-search__sug-meta">{{
            hostnameOf(sug.url)
          }}</span>
          <button
            v-if="sug.kind === 'history'"
            type="button"
            class="m-icon-btn m-icon-btn--small m-search__sug-del"
            :aria-label="m.search.removeHistory"
            tabindex="-1"
            @click.stop="removeHistory(sug.text)"
          >
            <X :size="14" />
          </button>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped>
.m-search {
  position: relative;
  width: min(640px, 100%);
  margin: 0 auto;
  z-index: 20;
}
.m-search__bar {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 54px;
  padding: 0 6px 0 6px;
  border-radius: 999px;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}
.m-search.is-focused .m-search__bar {
  border-color: color-mix(in srgb, var(--blue) 60%, var(--border));
  box-shadow:
    0 10px 34px var(--shadow),
    0 0 0 4px color-mix(in srgb, var(--blue) 14%, transparent);
}
.m-search__engine {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 42px;
  padding: 0 8px 0 6px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
}
.m-search__engine:hover:not(:disabled) {
  background: var(--interactive-hover);
}
.m-search__engine:disabled {
  cursor: default;
}
.m-search__engine-icon,
.m-search__opt-icon,
.m-search__sug-fav {
  display: block;
  width: 28px;
  height: 28px;
  overflow: hidden;
  border-radius: 8px;
  --tile-icon: 28px;
}
.m-search__chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
  height: 28px;
  padding: 0 4px 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--blue) 16%, transparent);
  color: var(--blue);
  font-size: 12.5px;
  font-weight: 600;
}
.m-search__chip-x {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
}
.m-search__chip-x:hover {
  background: color-mix(in srgb, var(--blue) 18%, transparent);
}
.m-search__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 16px;
  outline: none;
}
.m-search__input::-webkit-search-cancel-button {
  display: none;
}
.m-search__input::placeholder {
  color: var(--muted);
}
.m-search__hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  margin-right: 6px;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.m-search__go {
  display: grid;
  place-items: center;
  flex: none;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--primary-action);
  color: var(--primary-action-text);
  transition: background-color 0.2s ease;
}
.m-search__go:hover {
  background: var(--primary-action-hover);
}

.m-search__menu,
.m-search__list {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  max-height: min(420px, 60vh);
  margin: 0;
  padding: 6px;
  overflow: auto;
  list-style: none;
  border-radius: 22px;
}
.m-search__menu {
  right: auto;
  width: 260px;
}
.m-search__option,
.m-search__sug {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 44px;
  padding: 6px 12px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.m-search__option:hover,
.m-search__option[aria-selected='true'],
.m-search__sug.is-active {
  background: var(--interactive-hover);
}
.m-search__option[aria-selected='true'] {
  font-weight: 600;
}
.m-search__opt-name {
  flex: 1;
}
.m-search__sug-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  color: var(--muted);
}
.m-search__sug-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.m-search__sug-meta {
  color: var(--muted);
  font-size: 12px;
}
.m-search__sug-del {
  opacity: 0;
}
.m-search__sug.is-active .m-search__sug-del {
  opacity: 1;
}
.m-pop-enter-active,
.m-pop-leave-active {
  transition:
    opacity 0.18s ease,
    translate 0.22s var(--motion-ease);
}
.m-pop-enter-from,
.m-pop-leave-to {
  opacity: 0;
  translate: 0 -6px;
}
@media (prefers-reduced-motion: reduce) {
  .m-pop-enter-active,
  .m-pop-leave-active {
    transition: none;
  }
}
</style>
