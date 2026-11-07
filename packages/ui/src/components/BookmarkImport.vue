<script setup lang="ts">
import {
  type BookmarkNode,
  bookmarkRoots,
  collectLinks,
  convertBookmarks,
  normalizeData,
} from '@myriad/core'
import { ChevronRight, Folder } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import MDialog from './base/MDialog.vue'

const store = useStore()
const { m, t } = useI18n()
const api = store.platform.bookmarks

const open = computed(() => store.ui.bookmarkImportOpen)
const granted = ref(false)
const tree = ref<BookmarkNode[]>([])
const selected = ref(new Set<string>())
const expanded = ref(new Set<string>())
const error = ref('')

async function load() {
  if (!api) return
  tree.value = bookmarkRoots(await api.getTree())
  // 默认全选，展开根文件夹
  selected.value = new Set(tree.value.flatMap((r) => collectLinks(r).map((n) => n.id)))
  expanded.value = new Set(tree.value.map((r) => r.id))
}

watch(open, async (o) => {
  if (!o || !api) return
  error.value = ''
  granted.value = await api.has()
  if (granted.value) await load()
})

async function grant() {
  if (!api) return
  // 必须在用户点击中直接调用
  granted.value = await api.request()
  if (!granted.value) {
    error.value = m.value.bookmarks.denied
    return
  }
  await load()
}

interface Row {
  node: BookmarkNode
  depth: number
  links: string[]
}

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const walk = (nodes: BookmarkNode[], depth: number) => {
    for (const n of nodes) {
      if (n.url) continue
      const links = collectLinks(n).map((x) => x.id)
      if (!links.length) continue
      out.push({ node: n, depth, links })
      if (expanded.value.has(n.id)) walk(n.children ?? [], depth + 1)
    }
  }
  walk(tree.value, 0)
  return out
})

function stateOf(row: Row): 'all' | 'some' | 'none' {
  const n = row.links.filter((id) => selected.value.has(id)).length
  return n === 0 ? 'none' : n === row.links.length ? 'all' : 'some'
}

function toggle(row: Row) {
  const next = new Set(selected.value)
  const on = stateOf(row) !== 'all'
  for (const id of row.links) on ? next.add(id) : next.delete(id)
  selected.value = next
}

function toggleExpand(id: string) {
  const next = new Set(expanded.value)
  next.has(id) ? next.delete(id) : next.add(id)
  expanded.value = next
}

function selectAll(on: boolean) {
  selected.value = on
    ? new Set(tree.value.flatMap((r) => collectLinks(r).map((n) => n.id)))
    : new Set()
}

const preview = computed(() => convertBookmarks(tree.value, selected.value))

function doImport() {
  const result = preview.value
  if (!result.count) return
  // 首次使用时直接替换预设，否则追加在现有分组后面
  if (!store.local.onboarded || store.firstRun.value) {
    store.replaceData(
      normalizeData({
        schema: 1,
        groups: result.groups,
        items: result.items,
        dock: [],
        updatedAt: Date.now(),
      }),
    )
  } else {
    Object.assign(store.data.items, result.items)
    store.data.groups.push(...result.groups)
  }
  store.local.onboarded = true
  store.firstRun.value = false
  store.switchGroup(store.data.groups.findIndex((g) => g.id === result.groups[0]!.id))
  store.ui.bookmarkImportOpen = false
  store.toast(t('bookmarks.imported', { count: result.count }), 'success')
}
</script>

<template>
  <MDialog
    :open="open"
    :title="m.bookmarks.title"
    eyebrow="BOOKMARKS"
    width="560px"
    @close="store.ui.bookmarkImportOpen = false"
  >
    <div v-if="!granted" class="m-bm__ask">
      <p>{{ m.bookmarks.permission }}</p>
      <button type="button" class="m-btn m-btn--primary" autofocus @click="grant">
        {{ m.bookmarks.grant }}
      </button>
      <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    </div>
    <template v-else>
      <p class="m-bm__desc">{{ m.settings.data.bookmarksDesc }}</p>
      <div class="m-bm__tools">
        <button type="button" class="m-btn m-btn--small" @click="selectAll(true)">
          {{ m.bookmarks.selectAll }}
        </button>
        <button type="button" class="m-btn m-btn--small" @click="selectAll(false)">
          {{ m.bookmarks.selectNone }}
        </button>
      </div>
      <ul v-if="rows.length" class="m-bm__tree" role="tree">
        <li
          v-for="row in rows"
          :key="row.node.id"
          role="treeitem"
          class="m-bm__row"
          :aria-expanded="
            row.node.children?.some((c) => !c.url) ? expanded.has(row.node.id) : undefined
          "
          :style="{ paddingLeft: `${row.depth * 22 + 6}px` }"
        >
          <button
            v-if="row.node.children?.some((c) => !c.url && collectLinks(c).length)"
            type="button"
            class="m-bm__expand"
            :class="{ 'is-open': expanded.has(row.node.id) }"
            :aria-label="row.node.title"
            @click="toggleExpand(row.node.id)"
          >
            <ChevronRight :size="14" />
          </button>
          <span v-else class="m-bm__expand" />
          <label class="m-bm__label">
            <input
              type="checkbox"
              :checked="stateOf(row) === 'all'"
              :indeterminate="stateOf(row) === 'some'"
              @change="toggle(row)"
            />
            <Folder :size="16" />
            <span class="m-bm__name">{{ row.node.title || '—' }}</span>
            <span class="m-bm__count"
              >{{ row.links.filter((id) => selected.has(id)).length }} /
              {{ row.links.length }}</span
            >
          </label>
        </li>
      </ul>
      <p v-else class="m-bm__desc">{{ m.bookmarks.empty }}</p>
    </template>
    <template v-if="granted" #footer>
      <span class="m-bm__summary">{{
        t('bookmarks.summary', { groups: preview.groups.length, count: preview.count })
      }}</span>
      <button type="button" class="m-btn" @click="store.ui.bookmarkImportOpen = false">
        {{ m.common.cancel }}
      </button>
      <button
        type="button"
        class="m-btn m-btn--primary"
        :disabled="!preview.count"
        @click="doImport"
      >
        {{ m.bookmarks.import }}
      </button>
    </template>
  </MDialog>
</template>

<style scoped>
.m-bm__ask {
  display: grid;
  justify-items: start;
  gap: 14px;
}
.m-bm__ask p {
  margin: 0;
}
.m-bm__desc {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 13px;
}
.m-bm__tools {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.m-bm__tree {
  max-height: 46vh;
  margin: 0;
  padding: 6px;
  overflow: auto;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--secondary-surface);
}
.m-bm__row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 38px;
  border-radius: 10px;
}
.m-bm__row:hover {
  background: var(--interactive-hover);
}
.m-bm__expand {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  transition: rotate 0.2s var(--motion-ease);
}
.m-bm__expand.is-open {
  rotate: 90deg;
}
.m-bm__label {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  cursor: pointer;
}
.m-bm__label input {
  width: 16px;
  height: 16px;
  accent-color: var(--blue);
}
.m-bm__label svg {
  flex: none;
  color: var(--blue);
}
.m-bm__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.m-bm__count {
  padding-right: 8px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}
.m-bm__summary {
  margin-right: auto;
  align-self: center;
  color: var(--muted);
  font-size: 12.5px;
}
</style>
