import * as Y from 'yjs'

/**
 * 普通 JSON 与 Yjs 共享类型之间的映射。
 *
 * - 对象 ↔ Y.Map，数组 ↔ Y.Array，其余值原样保存。
 * - `reconcile*` 只写入真正变化的部分：对象逐键比较；数组用 LCS 求最小编辑，
 *   元素是带 `id` 的对象时按 id 对齐并递归比较。这样两台设备分别修改不同字段、
 *   或在同一列表的不同位置增删时，合并后两边的修改都能保留。
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type JsonObject = { [key: string]: Json }

export const isObject = (v: unknown): v is JsonObject =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Y.AbstractType)

/** 键排序后的序列化，用于比较内容 */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (isObject(v)) {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  return stableStringify(a) === stableStringify(b)
}

/** 把 JSON 值转成可插入文档的（预备）共享类型 */
export function toY(v: Json): unknown {
  if (Array.isArray(v)) {
    const arr = new Y.Array<unknown>()
    arr.push(v.map(toY))
    return arr
  }
  if (isObject(v)) {
    const map = new Y.Map<unknown>()
    for (const [k, x] of Object.entries(v)) if (x !== undefined) map.set(k, toY(x))
    return map
  }
  return v
}

function yJson(x: unknown): unknown {
  return x instanceof Y.AbstractType ? x.toJSON() : x
}

function keyOfJson(v: unknown): string {
  if (isObject(v) && typeof v.id === 'string') return `id:${v.id}`
  return `v:${stableStringify(v)}`
}

function keyOfY(x: unknown): string {
  if (x instanceof Y.Map) {
    const id = x.get('id')
    if (typeof id === 'string') return `id:${id}`
  }
  return `v:${stableStringify(yJson(x))}`
}

/**
 * 在 Y.Map 中写入对象。`keys` 给出时只管理这些键（其余键保持原样），
 * 用于「部分设置只在本机生效」时不删除其他设备同步上来的值。
 */
export function reconcileMap(map: Y.Map<unknown>, obj: JsonObject, keys?: readonly string[]) {
  const managed = keys ? new Set(keys) : null
  for (const k of [...map.keys()]) {
    if (managed && !managed.has(k)) continue
    if (obj[k] === undefined) map.delete(k)
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || (managed && !managed.has(k))) continue
    writeValue(map, k, v)
  }
}

function writeValue(map: Y.Map<unknown>, k: string, v: Json) {
  const cur = map.get(k)
  if (isObject(v)) {
    if (cur instanceof Y.Map) reconcileMap(cur, v)
    else map.set(k, toY(v))
  } else if (Array.isArray(v)) {
    if (cur instanceof Y.Array) reconcileArray(cur, v)
    else map.set(k, toY(v))
  } else if (cur !== v || cur instanceof Y.AbstractType || !map.has(k)) {
    map.set(k, v)
  }
}

/** 最长公共子序列，返回匹配的下标对（升序） */
function lcs(a: string[], b: string[]): [number, number][] {
  const n = a.length
  const m = b.length
  // 先去掉公共前后缀，中间部分太大时只保留前后缀匹配
  let pre = 0
  while (pre < n && pre < m && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < n - pre && suf < m - pre && a[n - 1 - suf] === b[m - 1 - suf]) suf++
  const pairs: [number, number][] = []
  for (let i = 0; i < pre; i++) pairs.push([i, i])
  const an = n - pre - suf
  const bm = m - pre - suf
  if (an > 0 && bm > 0 && an * bm <= 250_000) {
    const dp: Uint32Array[] = Array.from({ length: an + 1 }, () => new Uint32Array(bm + 1))
    for (let i = an - 1; i >= 0; i--)
      for (let j = bm - 1; j >= 0; j--)
        dp[i]![j] =
          a[pre + i] === b[pre + j]
            ? dp[i + 1]![j + 1]! + 1
            : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    let i = 0
    let j = 0
    while (i < an && j < bm) {
      if (a[pre + i] === b[pre + j]) {
        pairs.push([pre + i, pre + j])
        i++
        j++
      } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++
      else j++
    }
  }
  for (let k = suf; k > 0; k--) pairs.push([n - k, m - k])
  return pairs
}

export function reconcileArray(arr: Y.Array<unknown>, next: Json[]) {
  const cur = arr.toArray()
  const a = cur.map(keyOfY)
  const b = next.map(keyOfJson)
  const pairs = lcs(a, b)
  pairs.push([cur.length, next.length])
  let pos = 0
  let i = 0
  let j = 0
  for (const [mi, mj] of pairs) {
    if (mi > i) arr.delete(pos, mi - i)
    if (mj > j) {
      arr.insert(pos, next.slice(j, mj).map(toY))
      pos += mj - j
    }
    if (mi < cur.length) {
      const el = arr.get(pos)
      const v = next[mj]!
      // 按 id 对齐的对象：递归比较字段
      if (el instanceof Y.Map && isObject(v)) reconcileMap(el, v)
      pos++
    }
    i = mi + 1
    j = mj + 1
  }
}

/* ------------------------------------------------------------------ */
/* 三方比较：找出两边都改了、且改得不一样的字段                         */
/* ------------------------------------------------------------------ */

export interface Conflict {
  /** 路径；数组中带 id 的元素用 `#id` 表示 */
  path: string[]
  base: Json | undefined
  /** 本机的值 */
  local: Json | undefined
  /** 其他设备的值 */
  remote: Json | undefined
}

function byId(list: Json[]): Map<string, JsonObject> | null {
  const map = new Map<string, JsonObject>()
  for (const x of list) {
    if (!isObject(x) || typeof x.id !== 'string') return null
    map.set(x.id, x)
  }
  return map
}

export function diff3(
  base: Json | undefined,
  local: Json | undefined,
  remote: Json | undefined,
  path: string[] = [],
  out: Conflict[] = [],
): Conflict[] {
  if (deepEqual(local, remote) || deepEqual(base, local) || deepEqual(base, remote)) return out
  // 一边删除、一边修改：按合并结果处理，不询问
  if (local === undefined || remote === undefined) return out
  if (isObject(local) && isObject(remote)) {
    const b = isObject(base) ? base : {}
    for (const k of new Set([...Object.keys(local), ...Object.keys(remote)]))
      diff3(b[k], local[k], remote[k], [...path, k], out)
    return out
  }
  if (Array.isArray(local) && Array.isArray(remote)) {
    // 列表本身（顺序、增删）由 CRDT 合并；只比较两边都有的同 id 元素
    const l = byId(local)
    const r = byId(remote)
    if (!l || !r) return out
    const b = Array.isArray(base) ? byId(base) : null
    for (const [id, lv] of l) {
      const rv = r.get(id)
      if (rv) diff3(b?.get(id), lv, rv, [...path, `#${id}`], out)
    }
    return out
  }
  out.push({ path, base, local, remote })
  return out
}

/** 按 diff3 的路径读取值 */
export function getAtPath(root: unknown, path: readonly string[]): unknown {
  let cur: unknown = root
  for (const seg of path) {
    if (cur === undefined || cur === null) return undefined
    if (seg.startsWith('#') && Array.isArray(cur)) {
      cur = cur.find((x) => isObject(x) && x.id === seg.slice(1))
    } else cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

/** 按 diff3 的路径写入值；路径不存在时返回 false */
export function setAtPath(root: unknown, path: readonly string[], value: unknown): boolean {
  if (!path.length) return false
  const parent = getAtPath(root, path.slice(0, -1))
  if (!parent || typeof parent !== 'object') return false
  const last = path[path.length - 1]!
  if (last.startsWith('#') && Array.isArray(parent)) {
    const i = parent.findIndex((x) => isObject(x) && x.id === last.slice(1))
    if (i < 0) return false
    parent[i] = value
    return true
  }
  if (value === undefined) delete (parent as Record<string, unknown>)[last]
  else (parent as Record<string, unknown>)[last] = value
  return true
}
