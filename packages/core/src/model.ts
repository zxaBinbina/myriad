import { createId } from './id'
import { normalizeMemoList } from './widgets/memo'
import type { ContainerRef, FolderItem, Group, Id, Item, MyriadData } from './types'

/** 条目所在的容器；找不到时返回 null */
export function findContainer(data: MyriadData, id: Id): ContainerRef | null {
  if (data.dock.includes(id)) return { kind: 'dock' }
  for (const g of data.groups) if (g.items.includes(id)) return { kind: 'group', id: g.id }
  for (const item of Object.values(data.items)) {
    if (item.type === 'folder' && item.children.includes(id)) return { kind: 'folder', id: item.id }
  }
  return null
}

/** 容器内的 id 数组（直接返回原数组引用，便于原地修改） */
export function containerList(data: MyriadData, ref: ContainerRef): Id[] | null {
  if (ref.kind === 'dock') return data.dock
  if (ref.kind === 'group') return data.groups.find((g) => g.id === ref.id)?.items ?? null
  const folder = data.items[ref.id]
  return folder?.type === 'folder' ? folder.children : null
}

export function sameContainer(a: ContainerRef, b: ContainerRef): boolean {
  if (a.kind !== b.kind) return false
  return a.kind === 'dock' || a.id === (b as { id: Id }).id
}

/** 条目能否放进该容器：小组件只能在分组里；文件夹不能嵌套 */
export function canPlace(item: Item, ref: ContainerRef): boolean {
  if (item.type === 'widget') return ref.kind === 'group'
  if (item.type === 'folder') return ref.kind !== 'folder'
  return true
}

function detach(data: MyriadData, id: Id): ContainerRef | null {
  const ref = findContainer(data, id)
  if (!ref) return null
  const list = containerList(data, ref)
  if (list) {
    const i = list.indexOf(id)
    if (i >= 0) list.splice(i, 1)
  }
  return ref
}

function touch(data: MyriadData) {
  data.updatedAt = Date.now()
}

export function insertItem(
  data: MyriadData,
  item: Item,
  ref: ContainerRef,
  index?: number,
): boolean {
  if (!canPlace(item, ref)) return false
  const list = containerList(data, ref)
  if (!list) return false
  data.items[item.id] = item
  const at = index === undefined ? list.length : Math.max(0, Math.min(index, list.length))
  list.splice(at, 0, item.id)
  touch(data)
  return true
}

/**
 * 把条目移到容器的指定位置。同容器内移动时，index 是移除自身之后的位置。
 * 离开文件夹后会整理文件夹（空了删除，只剩一个时解散）。
 */
export function moveItem(data: MyriadData, id: Id, ref: ContainerRef, index?: number): boolean {
  const item = data.items[id]
  if (!item || !canPlace(item, ref)) return false
  const target = containerList(data, ref)
  if (!target) return false
  const from = detach(data, id)
  const at = index === undefined ? target.length : Math.max(0, Math.min(index, target.length))
  target.splice(at, 0, id)
  if (from?.kind === 'folder' && !(ref.kind === 'folder' && ref.id === from.id))
    tidyFolder(data, from.id)
  touch(data)
  return true
}

/**
 * 把 dragId 合并到 targetId：目标是文件夹时追加进去；
 * 目标是快捷方式时，在目标位置新建文件夹，包含两者。返回文件夹 id。
 */
export function mergeIntoFolder(
  data: MyriadData,
  dragId: Id,
  targetId: Id,
  title = '文件夹',
): Id | null {
  if (dragId === targetId) return null
  const drag = data.items[dragId]
  const target = data.items[targetId]
  if (!drag || !target || drag.type !== 'shortcut') return null
  if (target.type === 'folder') {
    const from = detach(data, dragId)
    target.children.push(dragId)
    if (from?.kind === 'folder' && from.id !== target.id) tidyFolder(data, from.id)
    touch(data)
    return target.id
  }
  if (target.type !== 'shortcut') return null
  const ref = findContainer(data, targetId)
  if (!ref || ref.kind === 'folder') return null
  const from = detach(data, dragId)
  const list = containerList(data, ref)!
  const at = list.indexOf(targetId)
  const folder: FolderItem = {
    id: createId('f'),
    type: 'folder',
    title,
    children: [targetId, dragId],
  }
  data.items[folder.id] = folder
  list.splice(at, 1, folder.id)
  if (from?.kind === 'folder') tidyFolder(data, from.id)
  touch(data)
  return folder.id
}

/** 文件夹为空时删除；只剩一个快捷方式时解散，用它替代文件夹 */
export function tidyFolder(data: MyriadData, folderId: Id) {
  const folder = data.items[folderId]
  if (folder?.type !== 'folder') return
  if (folder.children.length > 1) return
  const ref = findContainer(data, folderId)
  const list = ref ? containerList(data, ref) : null
  if (!list) return
  const at = list.indexOf(folderId)
  if (folder.children.length === 1) list.splice(at, 1, folder.children[0]!)
  else list.splice(at, 1)
  delete data.items[folderId]
}

/** 删除条目；删除文件夹时一起删除其中的快捷方式 */
export function deleteItem(data: MyriadData, id: Id) {
  const item = data.items[id]
  if (!item) return
  const from = detach(data, id)
  if (item.type === 'folder') for (const c of item.children) delete data.items[c]
  delete data.items[id]
  if (from?.kind === 'folder') tidyFolder(data, from.id)
  touch(data)
}

/** 解散文件夹：子项按顺序放回文件夹原来的位置 */
export function dissolveFolder(data: MyriadData, folderId: Id) {
  const folder = data.items[folderId]
  if (folder?.type !== 'folder') return
  const ref = findContainer(data, folderId)
  const list = ref ? containerList(data, ref) : null
  if (!list) return
  const at = list.indexOf(folderId)
  list.splice(at, 1, ...folder.children)
  delete data.items[folderId]
  touch(data)
}

export function addGroup(data: MyriadData, name: string, icon?: string, index?: number): Group {
  const group: Group = { id: createId('g'), name, icon, items: [] }
  const at = index === undefined ? data.groups.length : index
  data.groups.splice(at, 0, group)
  touch(data)
  return group
}

/** 删除分组及其中的全部条目；至少保留一个分组 */
export function deleteGroup(data: MyriadData, groupId: Id): boolean {
  if (data.groups.length <= 1) return false
  const i = data.groups.findIndex((g) => g.id === groupId)
  if (i < 0) return false
  const [group] = data.groups.splice(i, 1)
  for (const id of group!.items) {
    const item = data.items[id]
    if (item?.type === 'folder') for (const c of item.children) delete data.items[c]
    delete data.items[id]
  }
  touch(data)
  return true
}

export function moveGroup(data: MyriadData, groupId: Id, index: number) {
  const i = data.groups.findIndex((g) => g.id === groupId)
  if (i < 0) return
  const [group] = data.groups.splice(i, 1)
  data.groups.splice(Math.max(0, Math.min(index, data.groups.length)), 0, group!)
  touch(data)
}

/** 全部快捷方式（含文件夹与 Dock 内），用于搜索建议等 */
export function allShortcuts(data: MyriadData) {
  return Object.values(data.items).filter((i) => i.type === 'shortcut')
}

/**
 * 修复数据：去掉悬空引用、重复引用与非法嵌套，删除没有被任何容器引用的条目。
 * 导入数据和读取存储时调用。
 */
export function normalizeData(data: MyriadData): MyriadData {
  data.schema = 2
  data.lists ??= {}
  for (const [id, value] of Object.entries(data.lists)) {
    const list = normalizeMemoList(value, id)
    if (list) data.lists[id] = list
    else delete data.lists[id]
  }
  const seen = new Set<Id>()
  const keep = (ref: ContainerRef) => (id: Id) => {
    const item = data.items[id]
    if (!item || seen.has(id) || !canPlace(item, ref)) return false
    seen.add(id)
    return true
  }
  if (!data.groups.length)
    data.groups.push({ id: createId('g'), name: '常用', icon: 'star', items: [] })
  for (const g of data.groups) g.items = g.items.filter(keep({ kind: 'group', id: g.id }))
  data.dock = data.dock.filter(keep({ kind: 'dock' }))
  for (const id of [...seen]) {
    const item = data.items[id]
    if (item?.type === 'folder') {
      item.children = item.children.filter(keep({ kind: 'folder', id: item.id }))
    }
  }
  for (const id of Object.keys(data.items)) if (!seen.has(id)) delete data.items[id]
  // 文件夹不能为空
  for (const id of [...seen]) {
    const item = data.items[id]
    if (item?.type === 'folder' && item.children.length === 0) {
      const ref = findContainer(data, id)
      const list = ref ? containerList(data, ref) : null
      if (list) list.splice(list.indexOf(id), 1)
      delete data.items[id]
    }
  }
  return data
}
