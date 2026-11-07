<script setup lang="ts">
import { emptyData, presetData } from '@myriad/core'
import { BookMarked, LayoutGrid, Square } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import MDialog from './base/MDialog.vue'

const store = useStore()
const { m, lang } = useI18n()

const open = computed(
  () =>
    store.loaded.value &&
    store.firstRun.value &&
    !store.local.onboarded &&
    !store.ui.bookmarkImportOpen,
)

function finish() {
  store.local.onboarded = true
  store.firstRun.value = false
}

function usePreset() {
  store.replaceData(presetData(lang.value))
  finish()
}
function useBlank() {
  const d = emptyData()
  if (lang.value === 'en') d.groups[0]!.name = 'Home'
  store.replaceData(d)
  finish()
}
function useBookmarks() {
  store.ui.bookmarkImportOpen = true
}
</script>

<template>
  <MDialog :open="open" :title="m.onboarding.title" eyebrow="WELCOME" width="520px" @close="finish">
    <p class="m-onb__desc">{{ m.onboarding.desc }}</p>
    <div class="m-onb__options">
      <button
        v-if="store.platform.bookmarks"
        type="button"
        class="m-onb__option"
        autofocus
        @click="useBookmarks"
      >
        <span class="m-onb__icon"><BookMarked :size="22" /></span>
        <span
          ><b>{{ m.onboarding.bookmarks }}</b
          ><small>{{ m.onboarding.bookmarksDesc }}</small></span
        >
      </button>
      <button type="button" class="m-onb__option" @click="usePreset">
        <span class="m-onb__icon"><LayoutGrid :size="22" /></span>
        <span
          ><b>{{ m.onboarding.preset }}</b
          ><small>{{ m.onboarding.presetDesc }}</small></span
        >
      </button>
      <button type="button" class="m-onb__option" @click="useBlank">
        <span class="m-onb__icon"><Square :size="22" /></span>
        <span
          ><b>{{ m.onboarding.blank }}</b
          ><small>{{ m.onboarding.blankDesc }}</small></span
        >
      </button>
    </div>
  </MDialog>
</template>

<style scoped>
.m-onb__desc {
  margin: 0 0 18px;
  color: var(--muted);
}
.m-onb__options {
  display: grid;
  gap: 10px;
}
.m-onb__option {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--secondary-surface);
  color: var(--text);
  text-align: left;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    translate 0.24s var(--motion-ease);
}
.m-onb__option:hover {
  border-color: var(--project-hover-border);
  background: var(--panel-hover);
  translate: 0 -2px;
}
.m-onb__option b {
  display: block;
  font-size: 15px;
  font-weight: 650;
}
.m-onb__option small {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-size: 12.5px;
}
.m-onb__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 48px;
  height: 48px;
  border: 1px solid var(--project-icon-border);
  border-radius: 14px;
  background: var(--project-icon-surface);
  color: var(--blue);
}
</style>
