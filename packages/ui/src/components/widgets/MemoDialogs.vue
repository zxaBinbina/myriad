<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { createId, parsePlainDate, taskDeadline, todoTask, type TodoTask } from '@myriad/core'
import { useMemo } from '../../state/memo'
import { useStore } from '../../state/store'
import { useI18n } from '../../i18n'
import MDialog from '../base/MDialog.vue'
import MSwitch from '../base/MSwitch.vue'
const memo = useMemo(),
  store = useStore(),
  { m, t } = useI18n()
const taskFormId = `m-memo-task-${useId()}`
const draft = ref<TodoTask>(todoTask({}, '')),
  subtask = ref(''),
  busy = ref(false),
  error = ref('')
watch(
  () => memo.editing.value,
  (entry) => {
    draft.value = entry ? JSON.parse(JSON.stringify(entry.task)) : todoTask({}, '')
    subtask.value = ''
    error.value = ''
    busy.value = false
  },
)
async function saveTask() {
  const entry = memo.editing.value
  if (!entry || busy.value) return
  if (
    !draft.value.title.trim() ||
    (draft.value.due &&
      (!parsePlainDate(draft.value.due) ||
        taskDeadline(draft.value, store.timeZone.value) === null)) ||
    ((draft.value.reminder !== 'off' || draft.value.repeat !== 'none') && !draft.value.due)
  ) {
    error.value = m.value.memo.invalidTask
    return
  }
  const permission =
    draft.value.reminder !== 'off'
      ? (store.platform.reminders?.request() ?? Promise.resolve(false))
      : Promise.resolve(true)
  busy.value = true
  error.value = ''
  try {
    if (!(await permission)) store.toast(m.value.memo.permissionDenied)
    if (draft.value.due !== entry.task.due || draft.value.repeat !== entry.task.repeat) {
      draft.value.anchor = draft.value.due
      draft.value.series = draft.value.id
    }
    await memo.commit(
      entry.listId,
      draft.value.id,
      todoTask(draft.value, draft.value.id),
      entry.expected,
    )
    await memo.refreshReminders()
    memo.editing.value = null
  } catch (e) {
    error.value =
      e instanceof Error && e.message === 'changed' ? m.value.memo.changed : m.value.memo.failed
  } finally {
    busy.value = false
  }
}
async function removeTask() {
  const entry = memo.editing.value
  if (
    entry &&
    (await store.confirm(t('memo.deleteConfirm', { name: draft.value.title }), { danger: true }))
  ) {
    memo.remove(entry.listId, draft.value.id)
    memo.editing.value = null
  }
}
function addSubtask() {
  if (subtask.value.trim()) {
    draft.value.subtasks.push({ id: createId('sub'), title: subtask.value.trim(), done: false })
    subtask.value = ''
  }
}
const securityList = computed(() =>
  memo.security.value ? store.data.lists[memo.security.value] : undefined,
)
const locked = computed(() =>
  memo.security.value ? memo.views[memo.security.value]?.locked : false,
)
const usePassphrase = ref(false),
  passphrase = ref(''),
  confirmation = ref(''),
  keyText = ref(''),
  securityError = ref(''),
  securityBusy = ref(false)
watch(
  () => memo.security.value,
  () => {
    usePassphrase.value = false
    passphrase.value = ''
    confirmation.value = ''
    keyText.value = ''
    securityError.value = ''
    securityBusy.value = false
  },
)
async function protect(encrypted: boolean) {
  const id = memo.security.value
  if (!id || securityBusy.value) return
  if (
    encrypted &&
    usePassphrase.value &&
    (passphrase.value.length < 8 || passphrase.value !== confirmation.value)
  ) {
    securityError.value = m.value.memo.invalidPassphrase
    return
  }
  if (!encrypted && !(await store.confirm(m.value.memo.disableHint, { danger: true }))) return
  securityBusy.value = true
  securityError.value = ''
  try {
    await memo.changeProtection(
      id,
      encrypted,
      encrypted && usePassphrase.value ? passphrase.value : '',
    )
    store.toast(encrypted ? m.value.memo.savedEncryption : m.value.memo.savedPlain, 'success')
    memo.security.value = null
  } catch (e) {
    securityError.value =
      e instanceof Error && e.message === 'changed' ? m.value.memo.changed : m.value.memo.failed
  } finally {
    securityBusy.value = false
  }
}
async function unlock() {
  const id = memo.security.value
  if (!id) return
  securityBusy.value = true
  securityError.value = ''
  try {
    await memo.unlock(
      id,
      usePassphrase.value ? passphrase.value : keyText.value,
      usePassphrase.value,
    )
    memo.security.value = null
  } catch {
    securityError.value = m.value.memo.invalidKey
  } finally {
    securityBusy.value = false
  }
}
async function keyFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) keyText.value = await file.text()
}
async function exportKey() {
  const id = memo.security.value
  if (!id) return
  try {
    const text = await memo.exportKey(id),
      url = URL.createObjectURL(new Blob([text], { type: 'application/json' })),
      a = document.createElement('a')
    a.href = url
    a.download = `myriad-memo-key-${id}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    store.toast(m.value.memo.keyExported, 'success')
  } catch {
    securityError.value = m.value.memo.invalidKey
  }
}
</script>
<template>
  <MDialog
    :open="!!memo.editing.value"
    :title="memo.editing.value?.expected ? m.memo.editTask : m.memo.addTask"
    width="600px"
    @close="!busy && (memo.editing.value = null)"
  >
    <form
      v-if="memo.editing.value"
      :id="taskFormId"
      class="m-memo-dialog"
      @submit.prevent="saveTask"
    >
      <label class="m-field"
        ><span>{{ m.memo.taskTitle }}</span
        ><input v-model="draft.title" class="m-input" maxlength="1000" autofocus
      /></label>
      <div class="m-memo-dialog__row">
        <label class="m-field"
          ><span>{{ m.memo.due }}</span
          ><input
            v-model="draft.due"
            type="date"
            class="m-input"
            min="1000-01-01"
            max="9999-12-31" /></label
        ><label class="m-field"
          ><span>{{ m.memo.time }}</span
          ><input v-model="draft.time" type="time" class="m-input"
        /></label>
      </div>
      <p class="m-memo-dialog__hint">{{ t('memo.dateHint', { zone: store.timeZone.value }) }}</p>
      <div class="m-memo-dialog__row">
        <label class="m-field"
          ><span>{{ m.memo.priority }}</span
          ><select v-model.number="draft.priority" class="m-select">
            <option v-for="n in [0, 1, 2, 3]" :key="n" :value="n">
              {{ t(`memo.priority${n}`) }}
            </option>
          </select></label
        ><label class="m-field"
          ><span>{{ m.memo.color }}</span
          ><select v-model="draft.color" class="m-select">
            <option
              v-for="c in ['None', 'Blue', 'Red', 'Green', 'Yellow']"
              :key="c"
              :value="c.toLowerCase()"
            >
              {{ t(`memo.color${c}`) }}
            </option>
          </select></label
        >
      </div>
      <div class="m-memo-dialog__row">
        <label class="m-field"
          ><span>{{ m.memo.reminder }}</span
          ><select v-model="draft.reminder" class="m-select">
            <option value="off">{{ m.memo.reminderOff }}</option>
            <option value="at">{{ m.memo.reminderAt }}</option>
            <option value="10m">{{ m.memo.reminder10m }}</option>
            <option value="1h">{{ m.memo.reminder1h }}</option>
            <option value="1d">{{ m.memo.reminder1d }}</option>
          </select></label
        ><label class="m-field"
          ><span>{{ m.memo.repeat }}</span
          ><select v-model="draft.repeat" class="m-select">
            <option
              v-for="r in ['None', 'Day', 'Week', 'Month', 'Year']"
              :key="r"
              :value="r.toLowerCase()"
            >
              {{ t(`memo.repeat${r}`) }}
            </option>
          </select></label
        >
      </div>
      <fieldset class="m-memo-dialog__subtasks">
        <legend>{{ m.memo.subtasks }}</legend>
        <div v-for="(s, i) in draft.subtasks" :key="s.id" class="m-memo-dialog__row">
          <input
            v-model="s.done"
            type="checkbox"
            :aria-label="t('memo.complete', { name: s.title })"
          /><input v-model="s.title" class="m-input" :aria-label="m.memo.subtasks" /><button
            type="button"
            class="m-btn m-btn--small"
            @click="draft.subtasks.splice(i, 1)"
          >
            {{ m.common.delete }}
          </button>
        </div>
        <div class="m-memo-dialog__row">
          <input
            v-model="subtask"
            class="m-input"
            :aria-label="m.memo.addSubtask"
            @keydown.enter.prevent="addSubtask"
          /><button type="button" class="m-btn" @click="addSubtask">{{ m.memo.addSubtask }}</button>
        </div>
      </fieldset>
      <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    </form>
    <template #footer
      ><button
        v-if="memo.editing.value?.expected"
        type="button"
        class="m-btn m-btn--danger"
        :disabled="busy"
        @click="removeTask"
      >
        {{ m.memo.deleteTask }}</button
      ><button type="button" class="m-btn" :disabled="busy" @click="memo.editing.value = null">
        {{ m.common.cancel }}</button
      ><button type="submit" :form="taskFormId" class="m-btn m-btn--primary" :disabled="busy">
        {{ m.common.save }}
      </button></template
    >
  </MDialog>
  <MDialog
    :open="!!securityList"
    :title="m.memo.security"
    width="560px"
    @close="!securityBusy && (memo.security.value = null)"
  >
    <div v-if="securityList" class="m-memo-dialog">
      <strong>{{
        securityList.protection === 'encrypted' ? m.memo.encrypted : m.memo.plain
      }}</strong>
      <p class="m-memo-dialog__hint">{{ m.memo.encryptionHint }}</p>
      <template v-if="securityList.protection === 'plain'">
        <p class="m-memo-dialog__hint">{{ m.memo.encryptionLegacy }}</p>
        <label class="m-memo-dialog__row"
          ><span>{{ m.memo.usePassphrase }}</span
          ><MSwitch v-model="usePassphrase" :label="m.memo.usePassphrase"
        /></label>
        <template v-if="usePassphrase"
          ><label class="m-field"
            ><span>{{ m.memo.passphrase }}</span
            ><input
              v-model="passphrase"
              type="password"
              class="m-input"
              autocomplete="new-password" /></label
          ><label class="m-field"
            ><span>{{ m.memo.confirmPassphrase }}</span
            ><input
              v-model="confirmation"
              type="password"
              class="m-input"
              autocomplete="new-password"
          /></label>
          <p class="m-memo-dialog__hint">{{ m.memo.passphraseHint }}</p></template
        >
        <button
          type="button"
          class="m-btn m-btn--primary"
          :disabled="securityBusy"
          @click="protect(true)"
        >
          {{ m.memo.enableEncryption }}
        </button>
      </template>
      <template v-else-if="locked">
        <p>{{ m.memo.locked }}</p>
        <label v-if="securityList.salt" class="m-memo-dialog__row"
          ><span>{{ m.memo.usePassphrase }}</span
          ><MSwitch v-model="usePassphrase" :label="m.memo.usePassphrase"
        /></label>
        <label v-if="usePassphrase" class="m-field"
          ><span>{{ m.memo.passphrase }}</span
          ><input
            v-model="passphrase"
            type="password"
            class="m-input"
            autocomplete="current-password"
        /></label>
        <template v-else
          ><label class="m-field"
            ><span>{{ m.memo.keyText }}</span
            ><textarea v-model="keyText" class="m-input" rows="5" /></label
          ><label class="m-field"
            ><span>{{ m.memo.keyFile }}</span
            ><input type="file" accept=".json,application/json" @change="keyFile" /></label
        ></template>
        <button type="button" class="m-btn m-btn--primary" :disabled="securityBusy" @click="unlock">
          {{ m.memo.unlock }}
        </button>
      </template>
      <div v-else class="m-memo-dialog__row">
        <button type="button" class="m-btn" @click="exportKey">{{ m.memo.exportKey }}</button
        ><button type="button" class="m-btn" :disabled="securityBusy" @click="protect(false)">
          {{ m.memo.disableEncryption }}
        </button>
      </div>
      <p v-if="securityError" class="m-error" role="alert">{{ securityError }}</p>
    </div>
  </MDialog>
</template>
<style scoped>
.m-memo-dialog {
  display: grid;
  gap: 14px;
}
.m-memo-dialog__row {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: space-between;
}
.m-memo-dialog__row .m-field {
  flex: 1;
  min-width: 0;
}
.m-memo-dialog__hint {
  font-size: 12px;
  line-height: 1.7;
  color: var(--muted);
  margin: 0;
}
.m-memo-dialog__subtasks {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 10px;
}
.m-memo-dialog__subtasks legend {
  font-size: 12px;
  color: var(--muted);
}
.m-memo-dialog__subtasks input[type='checkbox'] {
  accent-color: var(--blue);
  flex: none;
}
.m-memo-dialog__subtasks .m-input {
  flex: 1;
  min-width: 0;
}
</style>
