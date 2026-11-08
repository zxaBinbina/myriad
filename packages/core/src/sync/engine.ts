import * as Y from 'yjs'
import type { StorageAdapter } from '../storage'
import { type Conflict, diff3, type Json, type JsonObject, reconcileMap } from './yjson'

/**
 * 同步引擎（与界面、传输方式无关）。
 *
 * 维护两份 Yjs 文档：
 * - `doc`：本机当前状态（含尚未上传的修改）
 * - `base`：最近一次与服务器一致的状态
 * 两者之差就是待上传的修改，断网时自然排队，恢复后一次补传。
 *
 * 收到其他设备的更新时，用 base / 本机 / 远端做三方比较，
 * 同一字段两边都改了且值不同就记为冲突，交给界面让用户选择。
 *
 * 同一浏览器的多个标签页通过 BroadcastChannel 互发 Yjs 更新，
 * 网络同步用 Web Locks 串行化，并在每次同步前合并其他标签页保存的进度。
 */

export interface ExchangeRequest {
  after: number
  update: Uint8Array | null
}

export interface ExchangeResponse {
  seq: number
  update: Uint8Array | null
  full: boolean
}

/** 可替换的同步传输层（默认是 myriad_api 的 HTTP 接口） */
export interface SyncTransport {
  exchange(req: ExchangeRequest): Promise<ExchangeResponse>
}

/** 与 BroadcastChannel 兼容的最小接口 */
export interface ChannelLike {
  postMessage(msg: unknown): void
  addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void
  removeEventListener(type: 'message', fn: (e: { data: unknown }) => void): void
  close?(): void
}

export interface ResolvedConflict extends Conflict {
  /** 合并后实际生效的值 */
  current: Json | undefined
}

export interface SyncResult {
  pushed: boolean
  received: boolean
  conflicts: ResolvedConflict[]
}

export interface SyncEngineOptions {
  storage: StorageAdapter
  /** 保存同步进度的存储键 */
  storageKey: string
  /** 文档的顶层分区，如 data / settings / history */
  roots: readonly string[]
  /** 远端（服务器或其他标签页）修改了这些分区 */
  onRemote?: (roots: Set<string>) => void
  /** 同步前、合并远端更新前调用，让界面把尚未写入文档的修改先写进去 */
  flushLocal?: () => void
  channel?: ChannelLike | null
  /** 跨标签页互斥；默认使用 navigator.locks */
  lock?: <T>(fn: () => Promise<T>) => Promise<T>
}

interface PersistedState {
  v: 1
  doc: string
  base: string
  after: number
  dirty: boolean
}

export const ORIGIN_LOCAL = 'myriad-local'
const ORIGIN_REMOTE = 'myriad-remote'
const ORIGIN_TAB = 'myriad-tab'

export function toBase64(u8: Uint8Array): string {
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000)
    s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function defaultLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks
  return locks ? (locks.request('myriad-sync', fn) as Promise<T>) : fn()
}

export class SyncEngine {
  doc = new Y.Doc()
  base = new Y.Doc()
  after = 0
  /** 有尚未上传的本机修改 */
  dirty = false
  private localVersion = 0
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private readonly opts: SyncEngineOptions
  private readonly lock: <T>(fn: () => Promise<T>) => Promise<T>
  private readonly onChannel = (e: { data: unknown }) => this.receiveTab(e.data)
  private disposed = false

  constructor(opts: SyncEngineOptions) {
    this.opts = opts
    this.lock = opts.lock ?? defaultLock
    this.attach()
    opts.channel?.addEventListener('message', this.onChannel)
  }

  private attach() {
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === ORIGIN_LOCAL) {
        this.dirty = true
        this.localVersion++
        this.opts.channel?.postMessage({ type: 'update', update })
        this.scheduleSave()
      } else if (origin === ORIGIN_REMOTE || origin === ORIGIN_TAB) {
        if (origin === ORIGIN_TAB) this.dirty = true
        this.scheduleSave()
        this.opts.onRemote?.(new Set(this.opts.roots))
      }
    })
  }

  private receiveTab(msg: unknown) {
    if (this.disposed || !msg || typeof msg !== 'object') return
    const m = msg as { type?: string; update?: unknown }
    if (m.type === 'update' && m.update instanceof Uint8Array) {
      this.opts.flushLocal?.()
      Y.applyUpdate(this.doc, m.update, ORIGIN_TAB)
    }
  }

  /* ---------------- 读写 ---------------- */

  /** 读取某个分区的 JSON；从未写入过时返回 null */
  read(root: string): JsonObject | null {
    const map = this.doc.getMap(root)
    return map.size ? (map.toJSON() as JsonObject) : null
  }

  isEmpty(): boolean {
    return this.opts.roots.every((r) => this.doc.getMap(r).size === 0)
  }

  /** 把本机的最新内容写入文档（只写变化部分）；返回是否有变化 */
  applyLocal(root: string, value: JsonObject, keys?: readonly string[]): boolean {
    const before = this.localVersion
    this.doc.transact(() => reconcileMap(this.doc.getMap(root), value, keys), ORIGIN_LOCAL)
    return this.localVersion !== before
  }

  /* ---------------- 持久化 ---------------- */

  private scheduleSave() {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.save(), 400)
  }

  async save() {
    clearTimeout(this.saveTimer)
    if (this.disposed) return
    const state: PersistedState = {
      v: 1,
      doc: toBase64(Y.encodeStateAsUpdate(this.doc)),
      base: toBase64(Y.encodeStateAsUpdate(this.base)),
      after: this.after,
      dirty: this.dirty,
    }
    await this.opts.storage.set(this.opts.storageKey, state)
  }

  /** 读取保存的进度（含其他标签页保存的），合并进当前文档 */
  async load(): Promise<void> {
    const s = await this.opts.storage.get<PersistedState>(this.opts.storageKey)
    if (!s || s.v !== 1) return
    try {
      Y.applyUpdate(this.base, fromBase64(s.base))
      Y.applyUpdate(this.doc, fromBase64(s.doc), ORIGIN_TAB)
    } catch {
      return
    }
    // base 取并集后，序号取较大者仍然成立：较新的 base 已包含该序号之前的全部更新
    if (s.after > this.after) this.after = s.after
    this.dirty = this.dirty || s.dirty
  }

  /** 清空进度（断开同步、换服务器时） */
  async reset() {
    this.doc.destroy()
    this.base.destroy()
    this.doc = new Y.Doc()
    this.base = new Y.Doc()
    this.attach()
    this.after = 0
    this.dirty = false
    this.localVersion = 0
    await this.opts.storage.remove(this.opts.storageKey)
  }

  /* ---------------- 同步 ---------------- */

  /** 与服务器交换一次：上传本机修改，取回其他设备的修改 */
  sync(transport: SyncTransport): Promise<SyncResult> {
    return this.lock(async () => {
      await this.load()
      this.opts.flushLocal?.()
      const version = this.localVersion
      const pending = this.dirty
        ? Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(this.base))
        : null
      const res = await transport.exchange({ after: this.after, update: pending })

      let conflicts: ResolvedConflict[] = []
      if (res.update) {
        // 网络请求期间的新修改也要先写进文档，再合并远端
        this.opts.flushLocal?.()
        const found = this.detectConflicts(res.update)
        Y.applyUpdate(this.doc, res.update, ORIGIN_REMOTE)
        conflicts = found.map((c) => ({ ...c, current: this.valueAt(c.path) }))
        this.opts.channel?.postMessage({ type: 'update', update: res.update })
      }
      if (pending) Y.applyUpdate(this.base, pending)
      if (res.update) Y.applyUpdate(this.base, res.update)
      this.after = res.seq
      if (this.localVersion === version) this.dirty = false
      await this.save()
      return { pushed: !!pending, received: !!res.update, conflicts }
    })
  }

  private detectConflicts(update: Uint8Array): Conflict[] {
    if (!this.dirty) return []
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(this.base))
    Y.applyUpdate(remote, update)
    const out: Conflict[] = []
    for (const r of this.opts.roots) {
      diff3(
        this.base.getMap(r).toJSON() as Json,
        this.doc.getMap(r).toJSON() as Json,
        remote.getMap(r).toJSON() as Json,
        [r],
        out,
      )
    }
    remote.destroy()
    return out
  }

  private valueAt(path: string[]): Json | undefined {
    const [root, ...rest] = path
    let cur: unknown = this.doc.getMap(root!).toJSON()
    for (const seg of rest) {
      if (cur === undefined || cur === null) return undefined
      if (seg.startsWith('#') && Array.isArray(cur))
        cur = cur.find((x) => x && typeof x === 'object' && (x as JsonObject).id === seg.slice(1))
      else cur = (cur as Record<string, unknown>)[seg]
    }
    return cur as Json | undefined
  }

  dispose() {
    this.disposed = true
    clearTimeout(this.saveTimer)
    this.opts.channel?.removeEventListener('message', this.onChannel)
    this.doc.destroy()
    this.base.destroy()
  }
}

/** 从备份快照（完整 Yjs 状态）还原出各分区的 JSON */
export function decodeSnapshot<R extends string>(
  state: Uint8Array,
  roots: readonly R[],
): Record<R, JsonObject | null> {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, state)
  const out = {} as Record<R, JsonObject | null>
  for (const r of roots) {
    const map = doc.getMap(r)
    out[r] = map.size ? (map.toJSON() as JsonObject) : null
  }
  doc.destroy()
  return out
}
