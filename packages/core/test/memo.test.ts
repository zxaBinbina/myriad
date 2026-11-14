import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  appendData,
  createMemoList,
  dataToJson,
  decodeMemoField,
  deriveMemoKey,
  encodeMemoField,
  generateMemoKey,
  generateMemoSalt,
  loadData,
  memoKeyBackup,
  nextTask,
  normalizeMemoList,
  parseMemoKeyBackup,
  presetData,
  protectMemoList,
  readMemoList,
  reconcileMap,
  reminderTime,
  taskDeadline,
  todoTask,
  type MemoList,
  type JsonObject,
} from '../src/index'
describe('待办清单迁移与重复任务', () => {
  it('旧数据迁移到 schema 2，保留条目并新增空清单表', () => {
    const old = { ...presetData('zh-CN'), schema: 1, lists: undefined }
    const migrated = loadData(old)!
    expect(migrated.schema).toBe(2)
    expect(migrated.lists).toEqual({})
    expect(migrated.items).toEqual(old.items)
  })
  it('合并导入重新映射共享清单引用，保留密钥上下文', async () => {
    const incoming = presetData('en'),
      key = generateMemoKey()
    incoming.lists.shared = await protectMemoList(
      createMemoList('shared', 'secret list'),
      'key_1',
      key,
    )
    for (const id of ['memo-a', 'memo-b']) {
      incoming.items[id] = {
        id,
        type: 'widget',
        kind: 'memo',
        size: '2x2',
        config: { listId: 'shared' },
      }
      incoming.groups[0]!.items.push(id)
    }
    const target = presetData('en')
    appendData(target, incoming)
    const widgets = Object.values(target.items).filter(
      (i) => i.type === 'widget' && i.kind === 'memo',
    )
    expect(widgets).toHaveLength(2)
    const ids = widgets.map((i) => (i.type === 'widget' ? i.config.listId : ''))
    expect(ids[0]).toBe(ids[1])
    expect(ids[0]).not.toBe('shared')
    const list = target.lists[ids[0] as string]!
    expect(list.keyId).toBe('key_1')
    expect((await readMemoList(list, key)).title).toBe('secret list')
  })
  it('重复任务保留原始日号，跳过遗漏日期，生成稳定 ID 和未完成子任务', () => {
    const original = todoTask(
      {
        title: 'Monthly',
        due: '2026-03-31',
        repeat: 'month',
        subtasks: [{ id: 's1', title: 'Check', done: true }],
      },
      'task_1',
    )
    const april = nextTask(original, { year: 2026, month: 3, day: 31 })!
    expect(april.due).toBe('2026-04-30')
    expect(april.subtasks[0]?.done).toBe(false)
    const may = nextTask(april, { year: 2026, month: 4, day: 30 })!
    expect(may.due).toBe('2026-05-31')
    expect(nextTask(april, { year: 2026, month: 6, day: 10 })?.due).toBe('2026-06-30')
    expect(nextTask(original, { year: 2026, month: 3, day: 31 })?.id).toBe(april.id)
    expect(original.due).toBe('2026-03-31')
  })
  it('提醒使用主时区与提前量，跳过完成任务和不存在的 DST 时间', () => {
    const task = todoTask({ due: '2026-11-14', time: '10:00', reminder: '1h' }, 'task_1')
    expect(taskDeadline(task, 'Asia/Shanghai')).toBe(Date.parse('2026-11-14T02:00:00Z'))
    expect(reminderTime(task, 'Asia/Shanghai')).toBe(Date.parse('2026-11-14T01:00:00Z'))
    expect(reminderTime({ ...task, done: true }, 'Asia/Shanghai')).toBeNull()
    expect(
      taskDeadline({ ...task, due: '2026-03-08', time: '02:30' }, 'America/New_York'),
    ).toBeNull()
    expect(taskDeadline({ ...task, time: '' }, 'Asia/Shanghai')).toBe(
      Date.parse('2026-11-14T01:00:00Z'),
    )
  })
})
describe('清单端到端加密', () => {
  it('每次写入使用独立 IV，支持中文与换行，错误密钥 / 字段 / 改动密文无法通过验证', async () => {
    const key = generateMemoKey(),
      list = { ...createMemoList('list', ''), protection: 'encrypted' as const, keyId: 'key_1' }
    const a = await encodeMemoField(list, 'note', '秘密便签\n第二行', key),
      b = await encodeMemoField(list, 'note', '秘密便签\n第二行', key)
    expect(a).not.toBe(b)
    expect(a).not.toContain('秘密')
    expect(await decodeMemoField(list, 'note', a, key)).toBe('秘密便签\n第二行')
    await expect(decodeMemoField(list, 'note', a, generateMemoKey())).rejects.toThrow()
    await expect(decodeMemoField(list, 'title', a, key)).rejects.toThrow()
    const tampered = a.slice(0, -4) + 'AAAA'
    await expect(decodeMemoField(list, 'note', tampered, key)).rejects.toThrow()
    await expect(decodeMemoField(list, 'note', JSON.stringify('plaintext'), key)).rejects.toThrow()
  })
  it('口令派生使用持久化盐，密钥导出有版本与长度校验', async () => {
    const salt = generateMemoSalt(),
      key = await deriveMemoKey('a good 密钥 passphrase', salt)
    expect(await deriveMemoKey('a good 密钥 passphrase', salt)).toBe(key)
    expect(await deriveMemoKey('another passphrase', salt)).not.toBe(key)
    expect(parseMemoKeyBackup(JSON.stringify(memoKeyBackup('key_1', key)))).toEqual({
      keyId: 'key_1',
      key,
    })
    expect(() =>
      parseMemoKeyBackup('{"format":"myriad-memo-key","version":1,"keyId":"key_1","key":"YWJj"}'),
    ).toThrow()
  })
  it('不同加密字段离线并发修改经 Yjs 合并后仍可解密，上传更新没有明文或密钥', async () => {
    const secret = generateMemoKey(),
      data = presetData('en'),
      plain = createMemoList('list_1', 'Encrypted list')
    plain.order = ['task_1']
    plain.fields.task_1 = JSON.stringify(todoTask({ title: 'Private task text' }, 'task_1'))
    data.lists.list_1 = await protectMemoList(plain, 'key_1', secret)
    const root = new Y.Doc()
    reconcileMap(root.getMap('data'), dataToJson(data))
    const a = new Y.Doc(),
      b = new Y.Doc(),
      initial = Y.encodeStateAsUpdate(root)
    Y.applyUpdate(a, initial)
    Y.applyUpdate(b, initial)
    const jsonA = a.getMap('data').toJSON() as unknown as typeof data,
      jsonB = b.getMap('data').toJSON() as unknown as typeof data
    jsonA.lists.list_1!.fields.note = await encodeMemoField(
      jsonA.lists.list_1!,
      'note',
      'Private note text',
      secret,
    )
    jsonB.lists.list_1!.fields.task_1 = await encodeMemoField(
      jsonB.lists.list_1!,
      'task_1',
      todoTask({ title: 'Changed private task' }, 'task_1'),
      secret,
    )
    reconcileMap(a.getMap('data'), jsonA as unknown as JsonObject)
    reconcileMap(b.getMap('data'), jsonB as unknown as JsonObject)
    const merged = Y.mergeUpdates([Y.encodeStateAsUpdate(a), Y.encodeStateAsUpdate(b)]),
      server = new Y.Doc()
    const bytes = new TextDecoder().decode(merged)
    for (const plain of ['Private note text', 'Changed private task', 'Private task text', secret])
      expect(bytes).not.toContain(plain)
    Y.applyUpdate(server, merged)
    const value = (server.getMap('data').toJSON().lists as Record<string, MemoList>).list_1!
    const decoded = await readMemoList(value, secret)
    expect(decoded.note).toBe('Private note text')
    expect(decoded.tasks[0]?.title).toBe('Changed private task')
    root.destroy()
    a.destroy()
    b.destroy()
    server.destroy()
  })
  it('整理清单顺序时去重，并补齐并发新增的任务', () => {
    const list = createMemoList('list_1', 'List')
    list.fields.task_1 = '{}'
    list.fields.task_2 = '{}'
    list.order = ['task_1', 'task_1', 'missing']
    expect(normalizeMemoList(list, 'list_1')?.order).toEqual(['task_1', 'task_2'])
  })
})
