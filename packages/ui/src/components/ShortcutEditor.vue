<script setup lang="ts">
import {
  type ContainerRef,
  createShortcut,
  hostnameOf,
  type IconSource,
  type IconSpec,
  insertItem,
  isSafeUrl,
  type LibraryIcon,
  normalizeUrl,
  TEXT_ICON_COLORS,
  textIconColor,
  textIconLabel,
} from '@myriad/core'
import { ImageUp } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import {
  brandToIcon,
  type BrandEntry,
  type LucideEntry,
  lucideToIcon,
  searchLibrary,
} from '../icons/library'
import { useStore } from '../state/store'
import MDialog from './base/MDialog.vue'
import MSeg from './base/MSeg.vue'
import ItemIcon from './ItemIcon.vue'

const store = useStore()
const { m } = useI18n()

const open = computed(() => !!store.ui.editor)
const editing = computed(() => {
  const id = store.ui.editor?.itemId
  const item = id ? store.data.items[id] : undefined
  return item?.type === 'shortcut' ? item : null
})

const title = ref('')
const url = ref('')
const urlError = ref(false)
const target = ref('')
const source = ref<IconSource>('auto')
const library = ref<LibraryIcon | undefined>()
const image = ref('')
const textLabel = ref('')
const textBg = ref('')
const imageError = ref(false)

const targets = computed(() => [
  ...store.data.groups.map((g) => ({ value: `group:${g.id}`, label: g.name })),
  { value: 'dock', label: m.value.editor.dock },
])

watch(open, (o) => {
  if (!o) return
  const it = editing.value
  title.value = it?.title ?? ''
  url.value = it?.url ?? ''
  urlError.value = false
  imageError.value = false
  const t = store.ui.editor?.target
  target.value = t
    ? t.kind === 'dock'
      ? 'dock'
      : `${t.kind}:${t.id}`
    : `group:${store.activeGroup.value.id}`
  if (t?.kind === 'folder') target.value = `folder:${t.id}`
  const icon = it?.icon ?? { source: 'auto' }
  source.value = icon.source === 'favicon' ? 'auto' : icon.source
  library.value = icon.library
  image.value = icon.image ?? ''
  textLabel.value = icon.text?.label ?? ''
  textBg.value = icon.text?.background ?? ''
  libQuery.value = ''
})

function fillTitle() {
  if (title.value.trim() || !url.value.trim()) return
  const host = hostnameOf(normalizeUrl(url.value))
  if (host)
    title.value =
      host
        .split('.')
        .slice(-2, -1)[0]
        ?.replace(/^./, (c) => c.toUpperCase()) ?? host
}

/* ---------------- 图标库 ---------------- */
const libQuery = ref('')
const libLoading = ref(false)
const libResult = ref<{ brands: BrandEntry[]; general: LucideEntry[] }>({ brands: [], general: [] })
let libSeq = 0
watch([libQuery, source], async () => {
  if (source.value !== 'library') return
  const seq = ++libSeq
  libLoading.value = true
  const q =
    libQuery.value ||
    (url.value ? (hostnameOf(normalizeUrl(url.value)).split('.').slice(-2, -1)[0] ?? '') : '')
  const r = await searchLibrary(q, 48)
  if (seq !== libSeq) return
  libResult.value = r.brands.length || r.general.length || !q ? r : await searchLibrary('', 48)
  libLoading.value = false
})

const iconColor = computed({
  get: () => `#${library.value?.color || (library.value?.set === 'lucide' ? '4ea4ef' : 'ffffff')}`,
  set: (v: string) => library.value && (library.value = { ...library.value, color: v.slice(1) }),
})
const iconBg = computed({
  get: () =>
    `#${library.value?.background || (library.value?.set === 'simple-icons' ? library.value.color || '4ea4ef' : 'ffffff')}`,
  set: (v: string) =>
    library.value && (library.value = { ...library.value, background: v.slice(1) }),
})

/* ---------------- 上传图片：缩放到 128px 并压缩 ---------------- */
async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  imageError.value = false
  try {
    const bitmap = await createImageBitmap(file)
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    const scale = Math.max(size / bitmap.width, size / bitmap.height)
    const w = bitmap.width * scale
    const h = bitmap.height * scale
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h)
    image.value = canvas.toDataURL('image/webp', 0.86)
  } catch {
    imageError.value = true
  }
  ;(e.target as HTMLInputElement).value = ''
}

const iconSpec = computed<IconSpec>(() => {
  switch (source.value) {
    case 'library':
      return library.value ? { source: 'library', library: library.value } : { source: 'auto' }
    case 'image':
      return image.value ? { source: 'image', image: image.value } : { source: 'auto' }
    case 'text':
      return {
        source: 'text',
        text: { label: textLabel.value.trim(), background: textBg.value || undefined },
      }
    default:
      return { source: 'auto' }
  }
})

const sourceOptions = computed(() =>
  (['auto', 'library', 'image', 'text'] as const).map((v) => ({
    value: v as IconSource,
    label: m.value.editor.iconSources[v],
  })),
)

function parseTarget(v: string): ContainerRef {
  if (v === 'dock') return { kind: 'dock' }
  const [kind, id] = v.split(':') as ['group' | 'folder', string]
  return { kind, id }
}

function save() {
  const normalized = normalizeUrl(url.value)
  if (!normalized || !isSafeUrl(normalized)) {
    urlError.value = true
    return
  }
  fillTitle()
  const name = title.value.trim() || hostnameOf(normalized) || normalized
  const it = editing.value
  if (it) {
    it.title = name
    it.url = normalized
    it.icon = iconSpec.value
  } else {
    const s = createShortcut(name, normalized)
    s.icon = iconSpec.value
    insertItem(store.data, s, parseTarget(target.value))
  }
  store.ui.editor = null
}

const previewTitle = computed(() => title.value || hostnameOf(normalizeUrl(url.value)) || '?')
</script>

<template>
  <MDialog
    :open="open"
    :title="editing ? m.editor.editTitle : m.editor.addTitle"
    eyebrow="SHORTCUT"
    width="560px"
    @close="store.ui.editor = null"
  >
    <form id="m-shortcut-form" class="m-editor" @submit.prevent="save">
      <div class="m-editor__top">
        <div class="m-editor__preview" :aria-label="m.editor.preview">
          <span class="m-editor__preview-icon">
            <ItemIcon
              :title="previewTitle"
              :url="normalizeUrl(url) || undefined"
              :icon="iconSpec"
            />
          </span>
          <span class="m-editor__preview-name">{{ previewTitle }}</span>
        </div>
        <div class="m-editor__fields">
          <label class="m-field">
            <span>{{ m.editor.url }}</span>
            <input
              v-model="url"
              class="m-input"
              type="text"
              inputmode="url"
              :placeholder="m.editor.urlPlaceholder"
              autofocus
              required
              @blur="fillTitle"
              @input="urlError = false"
            />
            <span v-if="urlError" class="m-error" role="alert">{{ m.editor.urlInvalid }}</span>
          </label>
          <label class="m-field">
            <span>{{ m.editor.name }}</span>
            <input
              v-model="title"
              class="m-input"
              type="text"
              :placeholder="m.editor.namePlaceholder"
              maxlength="40"
            />
          </label>
          <label v-if="!editing && store.ui.editor?.target?.kind !== 'folder'" class="m-field">
            <span>{{ m.editor.group }}</span>
            <select v-model="target" class="m-select">
              <option v-for="o in targets" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
        </div>
      </div>

      <div class="m-field">
        <span>{{ m.editor.icon }}</span>
        <MSeg v-model="source" :options="sourceOptions" :label="m.editor.icon" />
      </div>

      <p v-if="source === 'auto'" class="m-editor__desc">{{ m.editor.iconAutoDesc }}</p>

      <div v-else-if="source === 'library'" class="m-editor__lib">
        <input
          v-model="libQuery"
          class="m-input"
          type="search"
          :placeholder="m.editor.librarySearch"
        />
        <p v-if="libLoading && !libResult.brands.length" class="m-editor__desc">
          {{ m.editor.libraryLoading }}
        </p>
        <template v-else>
          <p v-if="libResult.brands.length" class="m-eyebrow">{{ m.editor.libraryBrands }}</p>
          <div class="m-editor__lib-grid">
            <button
              v-for="b in libResult.brands"
              :key="b.slug"
              type="button"
              class="m-editor__lib-item"
              :class="{ 'is-selected': library?.set === 'simple-icons' && library.name === b.slug }"
              :title="b.title"
              :aria-label="b.title"
              @click="library = brandToIcon(b)"
            >
              <svg viewBox="0 0 24 24" :fill="`#${b.hex}`"><path :d="b.path" /></svg>
            </button>
          </div>
          <p v-if="libResult.general.length" class="m-eyebrow">{{ m.editor.libraryGeneral }}</p>
          <div class="m-editor__lib-grid">
            <button
              v-for="l in libResult.general"
              :key="l.name"
              type="button"
              class="m-editor__lib-item"
              :class="{ 'is-selected': library?.set === 'lucide' && library.name === l.name }"
              :title="l.name"
              :aria-label="l.name"
              @click="library = lucideToIcon(l)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <component :is="n[0]" v-for="(n, i) in l.nodes" :key="i" v-bind="n[1]" />
              </svg>
            </button>
          </div>
          <p v-if="!libResult.brands.length && !libResult.general.length" class="m-editor__desc">
            {{ m.editor.libraryEmpty }}
          </p>
        </template>
        <div v-if="library" class="m-editor__colors">
          <label class="m-editor__color">
            <input v-model="iconColor" type="color" />
            <span>{{ m.editor.iconColor }}</span>
          </label>
          <label class="m-editor__color">
            <input v-model="iconBg" type="color" />
            <span>{{ m.editor.iconBackground }}</span>
          </label>
        </div>
      </div>

      <div v-else-if="source === 'image'" class="m-editor__image">
        <label class="m-btn">
          <ImageUp :size="16" />{{ m.editor.upload }}
          <input type="file" accept="image/*" class="visually-hidden" @change="onFile" />
        </label>
        <input
          :value="image.startsWith('data:') ? '' : image"
          class="m-input"
          type="url"
          :placeholder="m.editor.imageUrl"
          @change="image = ($event.target as HTMLInputElement).value.trim()"
        />
        <p v-if="imageError" class="m-error" role="alert">{{ m.editor.imageTooLarge }}</p>
      </div>

      <div v-else class="m-editor__text">
        <label class="m-field">
          <span>{{ m.editor.textLabel }}</span>
          <input
            v-model="textLabel"
            class="m-input"
            type="text"
            maxlength="3"
            :placeholder="textIconLabel(previewTitle)"
          />
        </label>
        <div class="m-field">
          <span>{{ m.editor.textColor }}</span>
          <div class="m-editor__swatches">
            <button
              v-for="c in TEXT_ICON_COLORS"
              :key="c"
              type="button"
              class="m-editor__swatch"
              :class="{ 'is-selected': (textBg || textIconColor(previewTitle)) === c }"
              :style="{ background: `#${c}` }"
              :aria-label="`#${c}`"
              @click="textBg = c"
            />
          </div>
        </div>
      </div>
    </form>
    <template #footer>
      <button type="button" class="m-btn" @click="store.ui.editor = null">
        {{ m.common.cancel }}
      </button>
      <button type="submit" form="m-shortcut-form" class="m-btn m-btn--primary">
        {{ m.common.save }}
      </button>
    </template>
  </MDialog>
</template>

<style scoped>
.m-editor {
  display: grid;
  gap: 18px;
}
.m-editor__top {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 20px;
  align-items: start;
}
.m-editor__preview {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding-top: 22px;
}
.m-editor__preview-icon {
  display: block;
  width: 64px;
  height: 64px;
  overflow: hidden;
  border-radius: var(--icon-radius);
  box-shadow:
    0 6px 16px var(--shadow),
    0 0 0 1px var(--border);
  --tile-icon: 64px;
}
.m-editor__preview-name {
  max-width: 96px;
  overflow: hidden;
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.m-editor__fields {
  display: grid;
  gap: 12px;
}
.m-editor__desc {
  margin: 0;
  color: var(--muted);
  font-size: 12.5px;
}
.m-editor__lib {
  display: grid;
  gap: 10px;
}
.m-editor__lib .m-eyebrow {
  margin: 4px 0 0;
}
.m-editor__lib-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 6px;
  max-height: 180px;
  overflow: auto;
}
.m-editor__lib-item {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--secondary-surface);
  color: var(--text);
}
.m-editor__lib-item svg {
  width: 22px;
  height: 22px;
}
.m-editor__lib-item:hover {
  background: var(--interactive-hover);
}
.m-editor__lib-item.is-selected {
  border-color: var(--blue);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--blue) 30%, transparent);
}
.m-editor__colors {
  display: flex;
  gap: 20px;
}
.m-editor__color {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 12.5px;
}
.m-editor__color input {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: none;
  cursor: pointer;
}
.m-editor__image {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: center;
}
.m-editor__image .m-error {
  grid-column: 1 / -1;
}
.m-editor__text {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 16px;
}
.m-editor__swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.m-editor__swatch {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
}
.m-editor__swatch.is-selected {
  border-color: var(--text);
  box-shadow: 0 0 0 2px var(--panel) inset;
}
</style>
