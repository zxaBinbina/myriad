<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { GripVertical, LockKeyhole, Pencil, Plus } from '@lucide/vue'
import {
  memoConfig,
  reminderTime,
  taskDeadline,
  ymd,
  zonedParts,
  type TodoTask,
  type WidgetItem,
} from '@myriad/core'
import { useMemo } from '../../state/memo'
import { useStore } from '../../state/store'
import { useI18n } from '../../i18n'
import { useNow } from '../../composables/useNow'
import WidgetHeader from './WidgetHeader.vue'
import MarkdownText from './MarkdownText.vue'
const props = defineProps<{ item: WidgetItem }>(),
  memo = useMemo(),
  store = useStore(),
  { m, t } = useI18n(),
  now = useNow()
watch(
  () => props.item.config,
  () => memo.ensure(props.item, m.value.memo.defaultList),
  { immediate: true },
)
const config = computed(() => memoConfig(props.item.config)),
  id = computed(() => config.value.listId),
  list = computed(() => store.data.lists[id.value]),
  view = computed(() => memo.views[id.value])
const tasks = computed(() => view.value?.content?.tasks ?? []),
  active = computed(() => tasks.value.filter((t) => !t.done && !t.archived)),
  finished = computed(() => tasks.value.filter((t) => t.done && !t.archived)),
  archived = computed(() => tasks.value.filter((t) => t.archived))
const today = computed(() => ymd(zonedParts(now.value, store.timeZone.value))),
  pending = ref(false),
  error = ref(''),
  editingNote = ref(false),
  note = ref(''),
  expectedNote = ref<string | undefined>()
function overdue(task: TodoTask) {
  return (
    task.due < today.value ||
    (!!task.time && (taskDeadline(task, store.timeZone.value) ?? Infinity) <= now.value.getTime())
  )
}
function reminded(task: TodoTask) {
  return (reminderTime(task, store.timeZone.value) ?? Infinity) <= now.value.getTime()
}
async function run(fn: () => Promise<void>) {
  pending.value = true
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value =
      e instanceof Error && e.message === 'changed' ? m.value.memo.changed : m.value.memo.failed
  } finally {
    pending.value = false
  }
}
function complete(task: TodoTask) {
  void run(() => memo.complete(id.value, task, config.value.completed === 'archive'))
}
function child(task: TodoTask, subId: string) {
  void run(() =>
    memo.updateTask(id.value, task.id, (latest) => {
      const s = latest.subtasks.find((s) => s.id === subId)
      if (s) s.done = !s.done
    }),
  )
}
function editNote() {
  note.value = view.value?.content?.note ?? ''
  expectedNote.value = list.value?.fields.note
  editingNote.value = true
  error.value = ''
}
function saveNote() {
  void run(async () => {
    await memo.commit(id.value, 'note', note.value, expectedNote.value)
    editingNote.value = false
  })
}
function drag(event: DragEvent, task: TodoTask) {
  event.stopPropagation()
  event.dataTransfer?.setData(
    'application/x-myriad-task',
    JSON.stringify({ listId: id.value, taskId: task.id }),
  )
}
function drop(event: DragEvent, task: TodoTask) {
  event.preventDefault()
  event.stopPropagation()
  try {
    const value = JSON.parse(event.dataTransfer?.getData('application/x-myriad-task') || '{}')
    if (value.listId === id.value && typeof value.taskId === 'string')
      memo.move(id.value, value.taskId, task.id)
  } catch {}
}
</script>
<template>
  <div class="m-memo" data-widget="memo" :aria-busy="pending">
    <WidgetHeader :item="item"
      ><button
        v-if="view?.content && config.view === 'tasks'"
        type="button"
        class="m-icon-btn m-icon-btn--small m-memo__advanced"
        :aria-label="m.memo.addTask"
        :title="m.memo.addTask"
        aria-haspopup="dialog"
        :disabled="pending"
        @click="memo.edit(id)"
      >
        <Plus :size="14" aria-hidden="true" /></button
      ><button
        v-if="list"
        type="button"
        class="m-icon-btn m-icon-btn--small"
        :aria-label="m.memo.security"
        @click="memo.security.value = id"
      >
        <LockKeyhole :size="14" /></button
    ></WidgetHeader>
    <template v-if="view?.content">
      <div class="m-memo__title">
        <strong>{{ view.content.title }}</strong
        ><span>{{ active.length }}</span>
      </div>
      <div class="m-memo__tabs">
        <button
          type="button"
          :class="{ 'is-active': config.view === 'tasks' }"
          @click="item.config.view = 'tasks'"
        >
          {{ m.memo.tasks }}</button
        ><button
          type="button"
          :class="{ 'is-active': config.view === 'note' }"
          @click="item.config.view = 'note'"
        >
          {{ m.memo.note }}
        </button>
      </div>
      <template v-if="config.view === 'tasks'">
        <ul class="m-memo__tasks">
          <li
            v-for="task in active"
            :key="task.id"
            :class="[
              `is-${task.color}`,
              { 'is-overdue': task.due && overdue(task), 'is-reminded': reminded(task) },
            ]"
            @dragover.prevent
            @drop="drop($event, task)"
          >
            <div class="m-memo__task">
              <span
                class="m-memo__grip"
                draggable="true"
                data-no-drag
                :aria-label="m.memo.reorder"
                @dragstart="drag($event, task)"
                ><GripVertical :size="12" /></span
              ><input
                type="checkbox"
                :checked="task.done"
                :disabled="pending"
                :aria-label="t('memo.complete', { name: task.title })"
                @change="complete(task)"
              /><button
                type="button"
                class="m-memo__task-title"
                :aria-label="t('memo.edit', { name: task.title })"
                @click="memo.edit(id, task)"
              >
                {{ task.title }}</button
              ><b v-if="task.priority" :class="`is-priority-${task.priority}`">{{
                t(`memo.priority${task.priority}`)
              }}</b>
            </div>
            <span v-if="task.due" class="m-memo__due"
              >{{ task.due }} {{ task.time
              }}<span v-if="overdue(task)"> · {{ m.memo.overdue }}</span></span
            >
            <ul v-if="task.subtasks.length" class="m-memo__subtasks">
              <li v-for="s in task.subtasks" :key="s.id">
                <label
                  ><input
                    type="checkbox"
                    :checked="s.done"
                    :disabled="pending"
                    @change="child(task, s.id)"
                  />{{ s.title }}</label
                >
              </li>
            </ul>
          </li>
        </ul>
        <p v-if="!active.length" class="m-memo__hint">{{ m.memo.empty }}</p>
        <details v-for="(group, i) in [finished, archived]" :key="i" class="m-memo__completed">
          <summary>{{ i === 0 ? m.memo.done : m.memo.archive }} · {{ group.length }}</summary>
          <label v-for="task in group" :key="task.id"
            ><input
              type="checkbox"
              checked
              :disabled="pending"
              :aria-label="t('memo.restore', { name: task.title })"
              @change="complete(task)" /><span>{{ task.title }}</span
            ><button
              type="button"
              class="m-icon-btn m-icon-btn--small"
              :aria-label="t('memo.edit', { name: task.title })"
              @click="memo.edit(id, task)"
            >
              <Pencil :size="12" /></button
          ></label>
        </details>
      </template>
      <template v-else
        ><template v-if="editingNote">
          <textarea
            v-model="note"
            class="m-input m-memo__note-input"
            :aria-label="m.memo.noteText"
            maxlength="100000"
            @keydown.ctrl.enter.prevent="saveNote"
            @keydown.meta.enter.prevent="saveNote"
          />
          <div class="m-memo__note-actions">
            <button type="button" class="m-btn m-btn--small" @click="editingNote = false">
              {{ m.common.cancel }}</button
            ><button type="button" class="m-btn m-btn--small" :disabled="pending" @click="saveNote">
              {{ m.common.save }}
            </button>
          </div></template
        ><template v-else
          ><MarkdownText v-if="view.content.note" :text="view.content.note" />
          <p v-else class="m-memo__hint">{{ m.memo.noNote }}</p>
          <button type="button" class="m-btn m-btn--small" @click="editNote">
            {{ m.memo.editNote }}
          </button></template
        ></template
      >
    </template>
    <template v-else-if="view?.locked"
      ><p class="m-memo__hint">{{ m.memo.locked }}</p>
      <button type="button" class="m-btn m-btn--small" @click="memo.security.value = id">
        {{ m.memo.importKey }}
      </button></template
    >
    <p v-else-if="view?.loading" class="m-memo__hint">{{ m.widget.loading }}</p>
    <p v-else class="m-memo__hint">{{ list ? m.memo.failed : m.memo.missing }}</p>
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.m-memo {
  height: 100%;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
}
.m-memo__title {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}
.m-memo__title strong {
  font-weight: 500;
  overflow-wrap: anywhere;
}
.m-memo__title > span {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.m-memo__tabs {
  display: flex;
  gap: 3px;
  background: var(--secondary-surface);
  border-radius: 9px;
  padding: 3px;
}
.m-memo__tabs button {
  flex: 1;
  border: 0;
  background: transparent;
  border-radius: 7px;
  padding: 5px;
  color: var(--muted);
  font-size: 11px;
}
.m-memo__tabs button.is-active {
  color: var(--blue);
  background: var(--panel);
}
.m-memo__tasks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.m-memo__tasks > li {
  border-left: 2px solid transparent;
  padding-left: 4px;
}
.m-memo__tasks > li.is-reminded {
  background: var(--tag-surface);
  border-radius: 6px;
}
.m-memo__task {
  display: flex;
  gap: 5px;
  align-items: flex-start;
}
.m-memo input[type='checkbox'] {
  accent-color: var(--blue);
  flex: none;
  margin: 2px 0;
}
.m-memo__grip {
  cursor: grab;
  color: var(--muted);
  flex: none;
  opacity: 0.5;
}
.m-memo__task-title {
  text-align: left;
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  line-height: 1.4;
  padding: 0;
  overflow-wrap: anywhere;
}
.m-memo__task-title:hover {
  color: var(--blue);
}
.m-memo__task b {
  font-size: 9px;
  white-space: nowrap;
  color: var(--muted);
  font-weight: 400;
}
.m-memo__task b.is-priority-3 {
  color: var(--status-danger);
}
.m-memo__task b.is-priority-2 {
  color: var(--status-warning);
}
.m-memo__due {
  display: block;
  padding: 3px 0 0 21px;
  font-size: 9px;
  color: var(--muted);
}
.is-overdue .m-memo__due {
  color: var(--status-danger);
}
.m-memo__tasks > li.is-blue {
  border-color: var(--blue);
}
.m-memo__tasks > li.is-red {
  border-color: var(--status-danger);
}
.m-memo__tasks > li.is-green {
  border-color: var(--status-success);
}
.m-memo__tasks > li.is-yellow {
  border-color: var(--status-warning);
}
.m-memo__subtasks {
  list-style: none;
  padding: 4px 0 0 21px;
  margin: 0;
  display: grid;
  gap: 5px;
}
.m-memo__subtasks label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--muted);
}
.m-memo__completed summary {
  font-size: 10px;
  color: var(--muted);
  cursor: pointer;
}
.m-memo__completed > label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding-top: 6px;
  color: var(--muted);
}
.m-memo__completed > label span {
  flex: 1;
}
.m-memo__hint {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
  margin: 6px 0;
}
.m-memo__advanced {
  min-block-size: 24px;
  min-inline-size: 24px;
}
.m-memo__note-input {
  resize: vertical;
  min-height: 90px;
  flex: 1;
  font-size: 12px;
  line-height: 1.6;
}
.m-memo__note-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.m-memo .m-error {
  font-size: 11px;
  margin: 0;
}
</style>
