import {
  canPlace,
  type ContainerRef,
  containerList,
  findContainer,
  type Id,
  type MyriadData,
  mergeIntoFolder,
  moveItem,
  sameContainer,
} from '@myriad/core'
import { inject, type InjectionKey, reactive } from 'vue'
import type { MyriadStore } from './store'

/**
 * 指针拖拽：排序、合并成文件夹、跨分组 / 文件夹 / Dock 移动。
 *
 * 可放置区域用 data 属性标记：
 * - `data-drop-item="<id>"`：条目本身（悬停中心区域合并、两侧插入）
 * - `data-drop-container="group:<id>" | "folder:<id>" | "dock"`：容器空白处（追加到末尾）
 * - `data-drop-group="<id>"`：分组标签（停留后切换到该分组）
 * - `data-folder-panel`：打开的文件夹面板；拖出面板时关闭文件夹，继续在网格中放置
 */

const START_DISTANCE = 6
const MERGE_DWELL = 380
const GROUP_DWELL = 520
/** 中心多大比例的区域视为「合并」 */
const MERGE_ZONE = 0.5

export interface DragState {
  id: Id | null
  /** 合并目标（高亮显示） */
  mergeTarget: Id | null
  /** 指针位置与幽灵元素 */
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  /** 拖动的条目从哪个容器开始 */
  origin: ContainerRef | null
  hoverGroup: Id | null
}

export type DragController = ReturnType<typeof createDragController>

export const DRAG_KEY: InjectionKey<DragController> = Symbol('myriad-drag')

export function useDrag(): DragController {
  const d = inject(DRAG_KEY)
  if (!d) throw new Error('Myriad drag controller is not provided')
  return d
}

export function parseContainer(raw: string | undefined): ContainerRef | null {
  if (!raw) return null
  if (raw === 'dock') return { kind: 'dock' }
  const [kind, id] = raw.split(':')
  if ((kind === 'group' || kind === 'folder') && id) return { kind, id }
  return null
}

export function containerKey(ref: ContainerRef): string {
  return ref.kind === 'dock' ? 'dock' : `${ref.kind}:${ref.id}`
}

export function createDragController(store: MyriadStore) {
  const state = reactive<DragState>({
    id: null,
    mergeTarget: null,
    x: 0,
    y: 0,
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
    origin: null,
    hoverGroup: null,
  })

  let pending: { id: Id; x: number; y: number; el: HTMLElement; pointerId: number } | null = null
  let snapshot: MyriadData | null = null
  let mergeTimer: ReturnType<typeof setTimeout> | undefined
  let mergeCandidate: Id | null = null
  let groupTimer: ReturnType<typeof setTimeout> | undefined
  let lastReorderKey = ''
  /** 刚结束一次拖动时吞掉随后触发的 click */
  let suppressClick = false

  function clearMerge() {
    clearTimeout(mergeTimer)
    mergeCandidate = null
    state.mergeTarget = null
  }

  function clearGroupHover() {
    clearTimeout(groupTimer)
    state.hoverGroup = null
  }

  function onPointerDown(e: PointerEvent, id: Id) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (
      (e.target as HTMLElement).closest('button, input, select, textarea, a, [data-no-drag]') &&
      store.data.items[id]?.type === 'widget'
    )
      return
    const el = e.currentTarget as HTMLElement
    pending = { id, x: e.clientX, y: e.clientY, el, pointerId: e.pointerId }
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
    addEventListener('pointercancel', onCancel)
  }

  function begin(e: PointerEvent) {
    if (!pending) return
    const { id, el } = pending
    const item = store.data.items[id]
    if (!item) return
    const rect = el.getBoundingClientRect()
    snapshot = structuredClone(JSON.parse(JSON.stringify(store.data))) as MyriadData
    state.id = id
    state.origin = findContainer(store.data, id)
    state.offsetX = pending.x - rect.left
    state.offsetY = pending.y - rect.top
    state.width = rect.width
    state.height = rect.height
    state.x = e.clientX
    state.y = e.clientY
    store.ui.dragging = id
    store.ui.contextMenu = null
    document.documentElement.classList.add('myriad-dragging')
    addEventListener('keydown', onKey, true)
  }

  function onMove(e: PointerEvent) {
    if (!pending) return
    if (!state.id) {
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < START_DISTANCE) return
      begin(e)
      if (!state.id) return
    }
    e.preventDefault()
    state.x = e.clientX
    state.y = e.clientY
    hitTest(e.clientX, e.clientY)
  }

  function hitTest(x: number, y: number) {
    const id = state.id!
    const item = store.data.items[id]
    if (!item) return
    const stack = document.elementsFromPoint(x, y) as HTMLElement[]

    // 拖出文件夹面板：关闭文件夹，回到网格
    if (store.ui.openFolder) {
      const inPanel = stack.some((el) => el.hasAttribute('data-folder-panel'))
      const inFolder = findContainer(store.data, id)
      if (!inPanel && inFolder?.kind === 'folder' && inFolder.id === store.ui.openFolder) {
        store.ui.openFolder = null
      }
    }

    // 分组标签：停留后切换
    const groupEl = stack.find((el) => el.dataset.dropGroup)
    const groupId = groupEl?.dataset.dropGroup ?? null
    if (groupId !== state.hoverGroup) {
      clearGroupHover()
      if (groupId) {
        state.hoverGroup = groupId
        groupTimer = setTimeout(() => {
          store.switchGroup(groupId)
          // 切换后把条目带到新分组末尾，继续拖动排序
          const ref: ContainerRef = { kind: 'group', id: groupId }
          const from = findContainer(store.data, id)
          if (from && !sameContainer(from, ref) && canPlace(item, ref))
            moveItem(store.data, id, ref)
          lastReorderKey = ''
        }, GROUP_DWELL)
      }
    }
    if (groupId) {
      clearMerge()
      return
    }

    const tile = stack.find((el) => el.dataset.dropItem && el.dataset.dropItem !== id)
    if (tile) {
      const targetId = tile.dataset.dropItem!
      const target = store.data.items[targetId]
      const ref = parseContainer(tile.dataset.container)
      if (!target || !ref) return
      const rect = tile.getBoundingClientRect()
      const cx = (x - rect.left) / rect.width
      const cy = (y - rect.top) / rect.height
      const inCenter = Math.abs(cx - 0.5) < MERGE_ZONE / 2 && Math.abs(cy - 0.5) < MERGE_ZONE / 2
      const canMerge =
        item.type === 'shortcut' &&
        (target.type === 'shortcut' || target.type === 'folder') &&
        ref.kind !== 'folder'
      if (inCenter && canMerge) {
        if (mergeCandidate !== targetId) {
          clearMerge()
          mergeCandidate = targetId
          mergeTimer = setTimeout(() => (state.mergeTarget = targetId), MERGE_DWELL)
        }
        return
      }
      clearMerge()
      if (!canPlace(item, ref)) return
      // 插到目标之前或之后
      const list = containerList(store.data, ref)
      if (!list) return
      const horizontal = (tile.dataset.axis ?? 'x') === 'x'
      const after = horizontal ? cx > 0.5 : cy > 0.5
      const from = findContainer(store.data, id)
      const withoutSelf = list.filter((i) => i !== id)
      let index = withoutSelf.indexOf(targetId) + (after ? 1 : 0)
      if (index < 0) index = withoutSelf.length
      const key = `${containerKey(ref)}@${index}`
      const currentIndex = from && sameContainer(from, ref) ? list.indexOf(id) : -1
      if (key === lastReorderKey || currentIndex === index) return
      lastReorderKey = key
      moveItem(store.data, id, ref, index)
      return
    }

    clearMerge()
    const zone = stack.find((el) => el.dataset.dropContainer)
    const ref = parseContainer(zone?.dataset.dropContainer)
    if (!ref || !canPlace(item, ref)) return
    const from = findContainer(store.data, id)
    if (from && sameContainer(from, ref)) return
    const key = `${containerKey(ref)}@end`
    if (key === lastReorderKey) return
    lastReorderKey = key
    moveItem(store.data, id, ref)
  }

  function finish(commit: boolean) {
    removeEventListener('pointermove', onMove)
    removeEventListener('pointerup', onUp)
    removeEventListener('pointercancel', onCancel)
    removeEventListener('keydown', onKey, true)
    const id = state.id
    if (id) {
      suppressClick = true
      setTimeout(() => (suppressClick = false), 0)
      if (commit && state.mergeTarget) {
        mergeIntoFolder(
          store.data,
          id,
          state.mergeTarget,
          store.lang.value === 'en' ? 'Folder' : '文件夹',
        )
      } else if (!commit && snapshot) {
        store.replaceData(snapshot)
      }
    }
    clearMerge()
    clearGroupHover()
    pending = null
    snapshot = null
    lastReorderKey = ''
    state.id = null
    state.origin = null
    store.ui.dragging = null
    document.documentElement.classList.remove('myriad-dragging')
  }

  function onUp() {
    finish(true)
  }
  function onCancel() {
    finish(false)
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      finish(false)
    }
  }

  /** 条目点击处理：拖动结束后的那次点击不打开链接 */
  function shouldSuppressClick() {
    return suppressClick
  }

  return { state, onPointerDown, shouldSuppressClick }
}
