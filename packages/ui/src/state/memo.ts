import {
  createId,
  createMemoList,
  decodeMemoField,
  deriveMemoKey,
  encodeMemoField,
  generateMemoKey,
  generateMemoSalt,
  memoConfig,
  memoKeyBackup,
  nextTask,
  parseMemoKeyBackup,
  readMemoList,
  reminderTime,
  todoTask,
  zonedParts,
  type MemoContent,
  type MemoList,
  type TodoTask,
  type WidgetItem,
} from '@myriad/core'
import { computed, inject, reactive, ref, watch, type InjectionKey } from 'vue'
import type { MyriadStore } from './store'
import type { ReminderJob } from '../platform'
export const MEMO_KEY: InjectionKey<MemoController> = Symbol('myriad-memo')
export type MemoController = ReturnType<typeof createMemoController>
export function useMemo() {
  const m = inject(MEMO_KEY)
  if (!m) throw new Error('Memo not provided')
  return m
}
interface MemoView {
  content?: MemoContent
  locked: boolean
  failed: boolean
  loading: boolean
}
export function createMemoController(store: MyriadStore) {
  const views = reactive<Record<string, MemoView>>({})
  const editing = ref<{ listId: string; task: TodoTask; expected: string | undefined } | null>(null)
  const security = ref<string | null>(null)
  const replacements = reactive<Record<string, string>>({})
  const vault = store.platform.secrets ?? store.platform.storage
  const keyName = (id: string) => `myriad.memo.key.${id}`
  const key = (list: MemoList) =>
    list.protection === 'encrypted'
      ? vault.get<string>(keyName(list.keyId))
      : Promise.resolve(undefined)
  let generation = 0,
    stopped = false,
    reminderGeneration = 0
  const snapshots = new Map<string, string>()
  async function refresh() {
    const version = ++generation
    const ids = Object.keys(store.data.lists)
    for (const id of Object.keys(views))
      if (!ids.includes(id)) {
        delete views[id]
        snapshots.delete(id)
      }
    await Promise.all(
      ids.map(async (id) => {
        const list = JSON.parse(JSON.stringify(store.data.lists[id])) as MemoList
        const serialized = JSON.stringify(list)
        if (snapshots.get(id) === serialized && views[id]?.content) return
        views[id] = { ...views[id], locked: false, failed: false, loading: true }
        try {
          const secret = await key(list)
          if (list.protection === 'encrypted' && !secret) throw new Error('locked')
          const content = await readMemoList(list, secret)
          if (version !== generation || stopped) return
          views[id] = { content, locked: false, failed: false, loading: false }
          snapshots.set(id, serialized)
        } catch (e) {
          if (version !== generation || stopped) return
          views[id] = {
            locked: list.protection === 'encrypted',
            failed: list.protection === 'plain',
            loading: false,
          }
        }
      }),
    )
  }
  const stopWatch = watch(
    [() => store.loaded.value, () => store.data.lists],
    () => {
      if (store.loaded.value) void refresh()
    },
    { deep: true },
  )
  const unsubscribe = vault.subscribe?.((name) => {
    if (name.startsWith('myriad.memo.key.')) {
      snapshots.clear()
      void refresh()
    }
  })
  function ensure(item: WidgetItem, title: string) {
    const c = memoConfig(item.config)
    if (!c.listId) {
      const id = `list-${item.id}`
      store.data.lists[id] ??= createMemoList(id, title)
      item.config = { ...item.config, listId: id }
    }
    return memoConfig(item.config).listId
  }
  function create(title: string) {
    const id = createId('list')
    store.data.lists[id] = createMemoList(id, title)
    return id
  }
  const list = (id: string) => {
    const l = store.data.lists[id]
    if (!l) throw new Error('missing-list')
    return l
  }
  async function commit(id: string, field: string, value: unknown, expected?: string) {
    const original = list(id),
      before = original.fields[field]
    if (expected !== undefined && before !== expected) throw new Error('changed')
    const protection = original.protection,
      keyId = original.keyId
    const body = await encodeMemoField(original, field, value, await key(original))
    const current = list(id)
    if (
      current.protection !== protection ||
      current.keyId !== keyId ||
      current.fields[field] !== before
    )
      throw new Error('changed')
    current.fields[field] = body
    if (field !== 'title' && field !== 'note' && !current.order.includes(field))
      current.order.push(field)
  }
  function edit(id: string, task?: TodoTask) {
    const original = list(id)
    editing.value = {
      listId: id,
      task: task ? JSON.parse(JSON.stringify(task)) : todoTask({}, createId('task')),
      expected: task ? original.fields[task.id] : undefined,
    }
  }
  async function complete(id: string, task: TodoTask, archive = false) {
    const original = list(id),
      before = original.fields[task.id],
      secret = await key(original)
    if (before === undefined) throw new Error('changed')
    const latest = todoTask(await decodeMemoField(original, task.id, before, secret), task.id)
    const updated = {
      ...latest,
      done: !latest.done,
      archived: !latest.done && archive,
      subtasks: latest.subtasks.map((s) => ({ ...s, done: !latest.done })),
    }
    const next = updated.done
      ? nextTask(latest, zonedParts(new Date(), store.timeZone.value))
      : null
    const encoded = await encodeMemoField(original, task.id, updated, secret)
    const upcoming =
      next && !(next.id in original.fields)
        ? await encodeMemoField(original, next.id, next, secret)
        : null
    const current = list(id)
    if (current !== original || current.fields[task.id] !== before) throw new Error('changed')
    current.fields[task.id] = encoded
    if (next && upcoming && !(next.id in current.fields)) {
      current.fields[next.id] = upcoming
      current.order.splice(current.order.indexOf(task.id) + 1, 0, next.id)
    }
  }
  async function updateTask(id: string, taskId: string, change: (task: TodoTask) => void) {
    const l = list(id),
      before = l.fields[taskId]
    if (before === undefined) throw new Error('changed')
    const value = todoTask(await decodeMemoField(l, taskId, before, await key(l)), taskId)
    change(value)
    await commit(id, taskId, value, before)
  }
  function remove(id: string, taskId: string) {
    const l = list(id)
    delete l.fields[taskId]
    l.order = l.order.filter((i) => i !== taskId)
  }
  function move(id: string, taskId: string, beforeId: string) {
    const l = list(id),
      order = l.order.filter((i) => i !== taskId),
      index = order.indexOf(beforeId)
    if (index < 0 || !(taskId in l.fields)) return
    order.splice(index, 0, taskId)
    l.order = order
  }
  async function changeProtection(id: string, encrypted: boolean, passphrase = '') {
    const current = list(id),
      snapshot = JSON.stringify(current)
    const content = await readMemoList(current, await key(current))
    const next = createMemoList(createId('list'), content.title)
    next.order = [...current.order]
    if (encrypted) {
      next.protection = 'encrypted'
      next.keyId = createId('key')
      next.salt = passphrase ? generateMemoSalt() : ''
    }
    const secret = encrypted
      ? passphrase
        ? await deriveMemoKey(passphrase, next.salt)
        : generateMemoKey()
      : undefined
    for (const [field, value] of [
      ['title', content.title],
      ['note', content.note],
      ...content.tasks.map((t) => [t.id, t]),
    ] as [string, unknown][])
      next.fields[field] = await encodeMemoField(next, field, value, secret)
    if (JSON.stringify(list(id)) !== snapshot) throw new Error('changed')
    if (secret) await vault.set(keyName(next.keyId), secret)
    if (JSON.stringify(list(id)) !== snapshot) {
      if (secret) await vault.remove(keyName(next.keyId))
      throw new Error('changed')
    }
    // 一次替换：明文不作为中间状态写入 store 或 Yjs。
    store.data.lists[next.id] = next
    for (const item of Object.values(store.data.items))
      if (item.type === 'widget' && item.kind === 'memo' && memoConfig(item.config).listId === id)
        item.config = { ...item.config, listId: next.id }
    delete store.data.lists[id]
    replacements[id] = next.id
  }
  async function unlock(id: string, text: string, passphrase = false) {
    const l = list(id)
    const incoming = passphrase
      ? { keyId: l.keyId, key: await deriveMemoKey(text, l.salt) }
      : parseMemoKeyBackup(text)
    if (incoming.keyId !== l.keyId) throw new Error('invalid-key')
    await readMemoList(l, incoming.key)
    await vault.set(keyName(l.keyId), incoming.key)
    snapshots.delete(id)
    await refresh()
  }
  async function exportKey(id: string) {
    const l = list(id),
      secret = await key(l)
    if (!secret) throw new Error('locked')
    return JSON.stringify(memoKeyBackup(l.keyId, secret), null, 2)
  }
  const calendarTasks = computed(() => {
    const linked = new Set(
      Object.values(store.data.items)
        .filter(
          (i): i is WidgetItem =>
            i.type === 'widget' && i.kind === 'memo' && memoConfig(i.config).calendar,
        )
        .map((i) => memoConfig(i.config).listId),
    )
    return [...linked].flatMap((id) =>
      (views[id]?.content?.tasks ?? [])
        .filter((t) => !t.done && !t.archived && !!t.due)
        .map((t) => ({ listId: id, task: t })),
    )
  })
  const jobs = computed<ReminderJob[]>(() =>
    Object.entries(views).flatMap(([id, view]) =>
      (view.content?.tasks ?? []).flatMap((t) => {
        const at = reminderTime(t, store.timeZone.value)
        return at === null || at < Date.now() - 86400000
          ? []
          : [
              {
                id: `memo:${id}:${t.id}:${at}`,
                at,
                title: t.title,
                message: view.content?.title ?? '',
              },
            ]
      }),
    ),
  )
  async function refreshReminders() {
    if (
      !store.loaded.value ||
      Object.keys(store.data.lists).some((id) => !views[id] || views[id]?.loading)
    )
      return
    const values = jobs.value
    const g = ++reminderGeneration,
      api = store.platform.reminders
    if (!api || !(await api.has()) || g !== reminderGeneration || stopped) return
    await api.replace(JSON.parse(JSON.stringify(values))).catch(() => undefined)
  }
  const stopJobs = watch(jobs, () => void refreshReminders(), { deep: true })
  async function conflictValue(id: string, field: string, value: unknown) {
    if (typeof value !== 'string') return undefined
    const l = list(id)
    const decoded = await decodeMemoField(l, field, value, await key(l))
    return typeof decoded === 'string' ? decoded : JSON.stringify(decoded)
  }
  function dispose() {
    stopped = true
    generation++
    stopWatch()
    stopJobs()
    unsubscribe?.()
  }
  return {
    views,
    editing,
    security,
    replacements,
    ensure,
    create,
    commit,
    edit,
    complete,
    updateTask,
    remove,
    move,
    changeProtection,
    unlock,
    exportKey,
    calendarTasks,
    refresh,
    refreshReminders,
    conflictValue,
    dispose,
  }
}
