import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { presetData } from '../src/defaults'
import { loadData } from '../src/io'
import { moveItem } from '../src/model'
import { createMemoryAdapter } from '../src/storage'
import {
  type ChannelLike,
  decodeSnapshot,
  type ExchangeRequest,
  type ExchangeResponse,
  SyncEngine,
  type SyncTransport,
} from '../src/sync/engine'
import { dataToJson, historyFromJson, historyToJson } from '../src/sync/scopes'
import { diff3, type JsonObject, reconcileMap } from '../src/sync/yjson'
import type { MyriadData } from '../src/types'

/** 与 myriad_api 相同语义的内存服务器 */
class FakeServer implements SyncTransport {
  rows: { id: number; data: Uint8Array }[] = []
  private nextId = 1
  offline = false
  async exchange(req: ExchangeRequest): Promise<ExchangeResponse> {
    if (this.offline) throw new Error('offline')
    let mine = 0
    if (req.update && req.update.length > 2) {
      mine = this.nextId++
      this.rows.push({ id: mine, data: req.update })
    }
    const parts = this.rows.filter((r) => r.id > req.after && r.id !== mine).map((r) => r.data)
    const seq = this.rows.at(-1)?.id ?? 0
    return {
      seq,
      update: parts.length ? Y.mergeUpdates(parts) : null,
      full: false,
    }
  }
}

/** 同一进程内模拟 BroadcastChannel */
function channelPair(): [ChannelLike, ChannelLike] {
  const listeners: [Set<(e: { data: unknown }) => void>, Set<(e: { data: unknown }) => void>] = [
    new Set(),
    new Set(),
  ]
  const make = (me: 0 | 1): ChannelLike => ({
    postMessage: (data) => listeners[1 - me]!.forEach((fn) => fn({ data })),
    addEventListener: (_t, fn) => listeners[me].add(fn),
    removeEventListener: (_t, fn) => listeners[me].delete(fn),
  })
  return [make(0), make(1)]
}

const ROOTS = ['data', 'settings', 'history'] as const

function device(
  opts: { channel?: ChannelLike; storage?: ReturnType<typeof createMemoryAdapter> } = {},
) {
  const remote: Set<string>[] = []
  const engine = new SyncEngine({
    storage: opts.storage ?? createMemoryAdapter(),
    storageKey: 'sync',
    roots: ROOTS,
    channel: opts.channel,
    lock: (fn) => fn(),
    onRemote: (r) => remote.push(r),
  })
  return { engine, remote, data: () => engine.read('data') as unknown as MyriadData }
}

function preset(): MyriadData {
  return presetData('zh-CN')
}

describe('JSON ↔ Yjs 映射', () => {
  it('只写入变化的部分，数组移动只产生一次删除和一次插入', () => {
    const doc = new Y.Doc()
    const map = doc.getMap('m')
    const value = { list: ['a', 'b', 'c', 'd', 'e'], nested: { x: 1, y: [1, 2] } }
    doc.transact(() => reconcileMap(map, value))
    let ops = 0
    doc.on('update', () => ops++)
    doc.transact(() => reconcileMap(map, value))
    expect(ops).toBe(0)

    let inserted = 0
    let deleted = 0
    map.get('list') instanceof Y.Array &&
      (map.get('list') as Y.Array<string>).observe((e) => {
        for (const d of e.changes.delta) {
          if (d.insert) inserted += (d.insert as unknown[]).length
          if (d.delete) deleted += d.delete
        }
      })
    doc.transact(() => reconcileMap(map, { ...value, list: ['a', 'c', 'd', 'b', 'e'] }))
    expect(map.toJSON().list).toEqual(['a', 'c', 'd', 'b', 'e'])
    expect(inserted).toBe(1)
    expect(deleted).toBe(1)
  })

  it('两台设备分别修改不同字段、在列表不同位置插入，合并后都保留', () => {
    const a = new Y.Doc()
    const initial = { groups: [{ id: 'g1', name: '常用', items: ['x', 'y'] }], title: 't' }
    a.transact(() => reconcileMap(a.getMap('d'), initial))
    const b = new Y.Doc()
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))

    a.transact(() =>
      reconcileMap(a.getMap('d'), {
        ...initial,
        groups: [{ id: 'g1', name: '常用网站', items: ['x', 'y'] }],
      }),
    )
    b.transact(() =>
      reconcileMap(b.getMap('d'), {
        ...initial,
        groups: [{ id: 'g1', name: '常用', items: ['x', 'y', 'z'] }],
      }),
    )
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    expect(a.getMap('d').toJSON()).toEqual(b.getMap('d').toJSON())
    expect(a.getMap('d').toJSON().groups).toEqual([
      { id: 'g1', name: '常用网站', items: ['x', 'y', 'z'] },
    ])
  })

  it('部分键模式不删除其他键', () => {
    const doc = new Y.Doc()
    const map = doc.getMap('s')
    reconcileMap(map, { palette: 'fufu-blue', theme: 'dark' })
    reconcileMap(map, { palette: 'hutao-red' }, ['palette'])
    expect(map.toJSON()).toEqual({ palette: 'hutao-red', theme: 'dark' })
  })

  it('三方比较只报告两边都改且不同的字段', () => {
    const base = { a: 1, b: 1, c: 1, list: [{ id: 'x', name: 'X' }] } as JsonObject
    const local = { a: 2, b: 1, c: 3, list: [{ id: 'x', name: 'L' }] } as JsonObject
    const remote = { a: 1, b: 2, c: 4, list: [{ id: 'x', name: 'R' }] } as JsonObject
    const out = diff3(base, local, remote)
    expect(out.map((c) => c.path.join('.'))).toEqual(['c', 'list.#x.name'])
    expect(out[0]).toMatchObject({ local: 3, remote: 4 })
  })
})

describe('同步引擎', () => {
  it('两台设备通过服务器收敛，快捷方式改名双方可见', async () => {
    const server = new FakeServer()
    const a = device()
    const b = device()
    const data = preset()
    a.engine.applyLocal('data', dataToJson(data))
    await a.engine.sync(server)
    const r = await b.engine.sync(server)
    expect(r.received).toBe(true)
    expect(b.data().groups.map((g) => g.name)).toEqual(data.groups.map((g) => g.name))

    const id = data.groups[0]!.items[0]!
    const renamed = loadData({ ...b.data(), updatedAt: 1 })!
    ;(renamed.items[id] as { title: string }).title = '新名字'
    b.engine.applyLocal('data', dataToJson(renamed))
    await b.engine.sync(server)
    await a.engine.sync(server)
    expect((a.data().items[id] as { title: string }).title).toBe('新名字')
    expect(a.remote.length).toBeGreaterThan(0)
  })

  it('离线时修改排队，恢复后补传', async () => {
    const server = new FakeServer()
    const a = device()
    a.engine.applyLocal('settings', { palette: 'fufu-blue' })
    await a.engine.sync(server)
    server.offline = true
    a.engine.applyLocal('settings', { palette: 'hutao-red' })
    await expect(a.engine.sync(server)).rejects.toThrow()
    expect(a.engine.dirty).toBe(true)
    server.offline = false
    const r = await a.engine.sync(server)
    expect(r.pushed).toBe(true)
    expect(a.engine.dirty).toBe(false)
    const b = device()
    await b.engine.sync(server)
    expect(b.engine.read('settings')).toEqual({ palette: 'hutao-red' })
  })

  it('同一字段两边离线改成不同值时报告冲突', async () => {
    const server = new FakeServer()
    const a = device()
    const b = device()
    a.engine.applyLocal('settings', { palette: 'fufu-blue', theme: 'auto' })
    await a.engine.sync(server)
    await b.engine.sync(server)

    a.engine.applyLocal('settings', { palette: 'hutao-red', theme: 'auto' })
    b.engine.applyLocal('settings', { palette: 'fufu-blue', theme: 'dark' })
    await b.engine.sync(server)
    // 只改了不同字段：没有冲突
    const r1 = await a.engine.sync(server)
    expect(r1.conflicts).toEqual([])
    expect(a.engine.read('settings')).toEqual({ palette: 'hutao-red', theme: 'dark' })

    await b.engine.sync(server)
    a.engine.applyLocal('settings', { palette: 'hutao-red', theme: 'light' })
    b.engine.applyLocal('settings', { palette: 'hutao-red', theme: 'auto' })
    await a.engine.sync(server)
    const r2 = await b.engine.sync(server)
    expect(r2.conflicts).toHaveLength(1)
    expect(r2.conflicts[0]).toMatchObject({
      path: ['settings', 'theme'],
      base: 'dark',
      local: 'auto',
      remote: 'light',
    })
    expect(['auto', 'light']).toContain(r2.conflicts[0]!.current)
  })

  it('并发拖动：两边把同一图标移到不同位置，合并后不会重复', async () => {
    const server = new FakeServer()
    const a = device()
    const b = device()
    const data = preset()
    a.engine.applyLocal('data', dataToJson(data))
    await a.engine.sync(server)
    await b.engine.sync(server)
    const g = data.groups[0]!
    const id = g.items[0]!

    const da = loadData({ ...a.data(), updatedAt: 1 })!
    moveItem(da, id, { kind: 'group', id: g.id }, 3)
    a.engine.applyLocal('data', dataToJson(da))
    const db = loadData({ ...b.data(), updatedAt: 1 })!
    moveItem(db, id, { kind: 'dock' }, 0)
    b.engine.applyLocal('data', dataToJson(db))
    await a.engine.sync(server)
    await b.engine.sync(server)
    await a.engine.sync(server)
    // CRDT 层可能出现两份引用，规范化后每个条目只属于一个容器
    const merged = loadData({ ...a.data(), updatedAt: 1 })!
    const refs = [...merged.dock, ...merged.groups.flatMap((x) => x.items)].filter((x) => x === id)
    expect(refs).toHaveLength(1)
    expect(a.engine.read('data')).toEqual(b.engine.read('data'))
  })

  it('进度保存在存储里，重新打开后继续增量同步', async () => {
    const server = new FakeServer()
    const storage = createMemoryAdapter()
    const a = device({ storage })
    a.engine.applyLocal('settings', { theme: 'dark' })
    await a.engine.sync(server)
    a.engine.applyLocal('settings', { theme: 'light' })
    await a.engine.save()
    a.engine.dispose()

    const again = device({ storage })
    await again.engine.load()
    expect(again.engine.read('settings')).toEqual({ theme: 'light' })
    expect(again.engine.dirty).toBe(true)
    const r = await again.engine.sync(server)
    expect(r.pushed).toBe(true)
    expect(server.rows).toHaveLength(2)
  })

  it('同一浏览器的标签页之间即时互通', () => {
    const [c1, c2] = channelPair()
    const t1 = device({ channel: c1 })
    const t2 = device({ channel: c2 })
    t1.engine.applyLocal('settings', { palette: 'hutao-red' })
    expect(t2.engine.read('settings')).toEqual({ palette: 'hutao-red' })
    expect(t2.remote).toHaveLength(1)
  })

  it('备份快照可以还原成 JSON', () => {
    const a = device()
    a.engine.applyLocal('data', dataToJson(preset()))
    a.engine.applyLocal('history', historyToJson([{ q: 'vue', engine: 'google', at: 2 }]))
    const snap = decodeSnapshot(Y.encodeStateAsUpdate(a.engine.doc), ROOTS)
    expect(loadData({ ...snap.data, updatedAt: 1 })?.groups.length).toBe(preset().groups.length)
    expect(historyFromJson(snap.history)).toEqual([{ q: 'vue', engine: 'google', at: 2 }])
    expect(snap.settings).toBeNull()
  })
})
