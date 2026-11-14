import {
  addGroup,
  canPlace,
  type ContainerRef,
  createId,
  deleteGroup,
  deleteItem,
  dissolveFolder,
  findContainer,
  type Id,
  insertItem,
  moveGroup,
  moveItem,
  type WidgetKind,
  type WidgetSize,
} from '@myriad/core'
import { inject, type InjectionKey } from 'vue'
import type { I18n } from '../i18n'
import type { ContextMenuItem, MyriadStore } from './store'
import { WIDGETS } from '../components/widgets/registry'

/** 右键菜单与对应操作 */
export function createActions(store: MyriadStore, i18n: I18n) {
  const { t, m } = i18n

  function openMenu(e: MouseEvent, items: ContextMenuItem[]) {
    e.preventDefault()
    e.stopPropagation()
    store.ui.contextMenu = { x: e.clientX, y: e.clientY, items }
  }

  function moveToGroupItems(id: Id): ContextMenuItem[] {
    const item = store.data.items[id]
    const from = findContainer(store.data, id)
    return store.data.groups.map((g) => ({
      label: g.name,
      icon: g.icon ?? 'folder',
      checked: from?.kind === 'group' && from.id === g.id,
      disabled:
        !item ||
        (from?.kind === 'group' && from.id === g.id) ||
        !canPlace(item, { kind: 'group', id: g.id }),
      action: () => moveItem(store.data, id, { kind: 'group', id: g.id }),
    }))
  }

  async function removeItem(id: Id) {
    const item = store.data.items[id]
    if (!item) return
    if (item.type === 'folder') {
      const ok = await store.confirm(
        t('items.deleteFolderConfirm', { name: item.title, n: item.children.length }),
        {
          okText: m.value.common.confirmDelete,
          danger: true,
        },
      )
      if (!ok) return
    }
    deleteItem(store.data, id)
  }

  function itemMenu(id: Id): ContextMenuItem[] {
    const item = store.data.items[id]
    if (!item) return []
    const ref = findContainer(store.data, id)
    const inDock = ref?.kind === 'dock'
    const msg = m.value
    if (item.type === 'shortcut') {
      return [
        {
          label: msg.items.open,
          icon: 'external-link',
          action: () => store.openUrl(item.url, false),
        },
        {
          label: msg.items.openNewTab,
          icon: 'app-window',
          action: () => store.openUrl(item.url, true),
        },
        {
          label: msg.items.edit,
          icon: 'pencil',
          action: () => (store.ui.editor = { itemId: id, target: null }),
        },
        { label: msg.items.moveTo, icon: 'folder-input', children: moveToGroupItems(id) },
        inDock
          ? {
              label: msg.items.unpinFromDock,
              icon: 'pin-off',
              action: () =>
                moveItem(store.data, id, { kind: 'group', id: store.activeGroup.value.id }),
            }
          : {
              label: msg.items.pinToDock,
              icon: 'pin',
              action: () => moveItem(store.data, id, { kind: 'dock' }),
            },
        {
          label: msg.items.deleteShortcut,
          icon: 'trash-2',
          danger: true,
          action: () => removeItem(id),
        },
      ]
    }
    if (item.type === 'folder') {
      return [
        { label: msg.items.open, icon: 'folder-open', action: () => (store.ui.openFolder = id) },
        { label: msg.items.renameFolder, icon: 'pencil', action: () => (store.ui.openFolder = id) },
        { label: msg.items.moveTo, icon: 'folder-input', children: moveToGroupItems(id) },
        inDock
          ? {
              label: msg.items.unpinFromDock,
              icon: 'pin-off',
              action: () =>
                moveItem(store.data, id, { kind: 'group', id: store.activeGroup.value.id }),
            }
          : {
              label: msg.items.pinToDock,
              icon: 'pin',
              action: () => moveItem(store.data, id, { kind: 'dock' }),
            },
        {
          label: msg.items.dissolve,
          icon: 'ungroup',
          action: () => dissolveFolder(store.data, id),
        },
        {
          label: msg.items.deleteFolder,
          icon: 'trash-2',
          danger: true,
          action: () => removeItem(id),
        },
      ]
    }
    const def = WIDGETS[item.kind]
    return [
      ...(def?.settings
        ? [
            {
              label: msg.widget.settings,
              icon: 'settings',
              action: () => (store.ui.widgetEditor = id),
            },
          ]
        : []),
      {
        label: msg.items.widgetSize,
        icon: 'scaling',
        children: (def?.sizes ?? []).map((size) => ({
          label: size.replace('x', ' × '),
          checked: item.size === size,
          action: () => (item.size = size),
        })),
      },
      { label: msg.items.moveTo, icon: 'folder-input', children: moveToGroupItems(id) },
      {
        label: msg.items.removeWidget,
        icon: 'trash-2',
        danger: true,
        action: () => deleteItem(store.data, id),
      },
    ]
  }

  function addShortcut(target: ContainerRef) {
    store.ui.editor = { itemId: null, target }
  }

  function addWidget(kind: WidgetKind, groupId: Id, size?: WidgetSize) {
    const def = WIDGETS[kind]
    insertItem(
      store.data,
      { id: createId('w'), type: 'widget', kind, size: size ?? def.defaultSize, config: {} },
      { kind: 'group', id: groupId },
      0,
    )
  }

  function widgetMenu(groupId: Id): ContextMenuItem[] {
    return (Object.keys(WIDGETS) as WidgetKind[]).map((kind) => ({
      label: t(`widgets.${kind}`),
      icon: WIDGETS[kind].icon,
      action: () => addWidget(kind, groupId),
    }))
  }

  function gridMenu(groupId: Id): ContextMenuItem[] {
    const msg = m.value
    return [
      {
        label: msg.items.addShortcut,
        icon: 'plus',
        action: () => addShortcut({ kind: 'group', id: groupId }),
      },
      { label: msg.items.addWidget, icon: 'layout-grid', children: widgetMenu(groupId) },
      { label: msg.groups.add, icon: 'folder-plus', action: () => createGroup() },
      { label: msg.settings.open, icon: 'settings', action: () => (store.ui.settingsOpen = true) },
    ]
  }

  function dockMenu(): ContextMenuItem[] {
    return [
      {
        label: m.value.items.addShortcut,
        icon: 'plus',
        action: () => addShortcut({ kind: 'dock' }),
      },
    ]
  }

  function createGroup() {
    const g = addGroup(store.data, m.value.groups.newName, 'folder', store.activeIndex.value + 1)
    store.switchGroup(g.id)
    store.ui.renamingGroup = g.id
  }

  async function removeGroup(id: Id) {
    const g = store.data.groups.find((x) => x.id === id)
    if (!g) return
    if (store.data.groups.length <= 1) {
      store.toast(m.value.groups.lastGroup, 'error')
      return
    }
    if (g.items.length) {
      const ok = await store.confirm(
        t('groups.deleteConfirm', { name: g.name, n: g.items.length }),
        {
          okText: m.value.common.confirmDelete,
          danger: true,
        },
      )
      if (!ok) return
    }
    const index = store.data.groups.indexOf(g)
    deleteGroup(store.data, id)
    if (store.local.activeGroup === id)
      store.local.activeGroup = store.data.groups[Math.max(0, index - 1)]!.id
  }

  function groupMenu(id: Id): ContextMenuItem[] {
    const msg = m.value
    const index = store.data.groups.findIndex((g) => g.id === id)
    return [
      { label: msg.groups.rename, icon: 'pencil', action: () => (store.ui.renamingGroup = id) },
      {
        label: msg.groups.moveLeft,
        icon: 'arrow-left',
        disabled: index <= 0,
        action: () => moveGroup(store.data, id, index - 1),
      },
      {
        label: msg.groups.moveRight,
        icon: 'arrow-right',
        disabled: index >= store.data.groups.length - 1,
        action: () => moveGroup(store.data, id, index + 1),
      },
      { label: msg.groups.add, icon: 'folder-plus', action: () => createGroup() },
      {
        label: msg.groups.delete,
        icon: 'trash-2',
        danger: true,
        disabled: store.data.groups.length <= 1,
        action: () => removeGroup(id),
      },
    ]
  }

  return {
    openMenu,
    itemMenu,
    gridMenu,
    dockMenu,
    groupMenu,
    addShortcut,
    addWidget,
    createGroup,
    removeGroup,
    removeItem,
  }
}

export type Actions = ReturnType<typeof createActions>

export const ACTIONS_KEY: InjectionKey<Actions> = Symbol('myriad-actions')

export function useActions(): Actions {
  const a = inject(ACTIONS_KEY)
  if (!a) throw new Error('Myriad actions are not provided')
  return a
}
