<script setup lang="ts">
import { memoConfig } from '@myriad/core'
import { ref, watch } from 'vue'
import { useMemo } from '../../state/memo'
import { useStore } from '../../state/store'
import { useI18n } from '../../i18n'
import MSwitch from '../base/MSwitch.vue'
const props = defineProps<{ initial: Record<string, unknown> }>(),
  memo = useMemo(),
  store = useStore(),
  { m } = useI18n()
const config = ref(memoConfig(props.initial)),
  title = ref('')
watch(
  () => memo.replacements[config.value.listId],
  (id) => {
    if (id) config.value.listId = id
  },
)
watch(
  () => config.value.listId,
  (id) => {
    title.value = memo.views[id]?.content?.title ?? m.value.memo.defaultList
  },
  { immediate: true },
)
async function save() {
  let id = config.value.listId
  if (memo.views[id]?.content && !title.value.trim()) throw new Error('invalid-task')
  if (id === 'new' || !store.data.lists[id]) {
    if (!title.value.trim()) throw new Error('invalid-task')
    id = memo.create(title.value.trim())
  } else if (memo.views[id]?.content && title.value !== memo.views[id]?.content?.title)
    await memo.commit(id, 'title', title.value.trim())
  return { ...config.value, listId: id }
}
defineExpose({ save })
</script>
<template>
  <div class="m-memo-settings">
    <label class="m-field"
      ><span>{{ m.memo.list }}</span
      ><select v-model="config.listId" class="m-select">
        <option v-for="(list, id) in store.data.lists" :key="id" :value="id">
          {{
            memo.views[id]?.content?.title ||
            (list.protection === 'encrypted' ? m.memo.encrypted : m.memo.defaultList)
          }}
        </option>
        <option value="new">{{ m.memo.newList }}</option>
      </select></label
    >
    <label class="m-field"
      ><span>{{ m.memo.listName }}</span
      ><input v-model="title" class="m-input" :disabled="!!memo.views[config.listId]?.locked"
    /></label>
    <label class="m-field"
      ><span>{{ m.memo.completedBehavior }}</span
      ><select v-model="config.completed" class="m-select">
        <option value="fold">{{ m.memo.fold }}</option>
        <option value="archive">{{ m.memo.archiveDone }}</option>
      </select></label
    >
    <label class="m-memo-settings__toggle"
      ><span>{{ m.memo.calendar }}</span
      ><MSwitch v-model="config.calendar" :label="m.memo.calendar"
    /></label>
    <button
      v-if="store.data.lists[config.listId]"
      type="button"
      class="m-btn"
      @click="memo.security.value = config.listId"
    >
      {{ m.memo.security }}
    </button>
  </div>
</template>
<style scoped>
.m-memo-settings {
  display: grid;
  gap: 16px;
}
.m-memo-settings__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}
</style>
