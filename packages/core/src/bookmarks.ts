import { createShortcut } from './defaults'
import { createId } from './id'
import type { FolderItem, Group, Id, Item } from './types'

/** 与 chrome.bookmarks.BookmarkTreeNode 兼容的最小结构 */
export interface BookmarkNode {
  id: string
  title: string
  url?: string
  children?: BookmarkNode[]
}

export interface BookmarkImportResult {
  groups: Group[]
  items: Record<Id, Item>
  /** 导入的快捷方式数量 */
  count: number
}

const IMPORTABLE = /^(https?|ftp|file):/i

export function isImportableUrl(url: string | undefined): url is string {
  return !!url && IMPORTABLE.test(url)
}

/** 收集节点下全部可导入的链接（深度优先，保持顺序） */
export function collectLinks(node: BookmarkNode, selected?: Set<string>): BookmarkNode[] {
  if (node.url)
    return isImportableUrl(node.url) && (!selected || selected.has(node.id)) ? [node] : []
  return (node.children ?? []).flatMap((c) => collectLinks(c, selected))
}

/** 浏览器书签树的根（id 为 0 的虚拟根）展开为「书签栏」「其他书签」等根文件夹 */
export function bookmarkRoots(tree: BookmarkNode[]): BookmarkNode[] {
  if (tree.length === 1 && !tree[0]!.url && !tree[0]!.title) return tree[0]!.children ?? []
  return tree
}

function titleOf(node: BookmarkNode): string {
  if (node.title.trim()) return node.title.trim()
  try {
    return new URL(node.url!).hostname.replace(/^www\./, '')
  } catch {
    return node.url ?? ''
  }
}

/**
 * 把书签转换成分组：
 * - 根文件夹（书签栏 / 其他书签…）下的每个文件夹 → 一个分组；
 * - 根文件夹里直接放的链接 → 以根文件夹命名的分组；
 * - 分组文件夹里的子文件夹 → 网格文件夹，更深层的链接合并到这一层。
 *
 * `selected` 为勾选的书签 id（只看链接节点）；不传表示全部导入。
 */
export function convertBookmarks(
  tree: BookmarkNode[],
  selected?: Set<string>,
): BookmarkImportResult {
  const items: Record<Id, Item> = {}
  const groups: Group[] = []
  let count = 0

  const shortcut = (node: BookmarkNode): Id => {
    const s = createShortcut(titleOf(node), node.url!)
    items[s.id] = s
    count++
    return s.id
  }

  const buildGroup = (name: string, children: BookmarkNode[]): Group | null => {
    const ids: Id[] = []
    for (const child of children) {
      if (child.url) {
        if (isImportableUrl(child.url) && (!selected || selected.has(child.id)))
          ids.push(shortcut(child))
        continue
      }
      const links = collectLinks(child, selected)
      if (!links.length) continue
      if (links.length === 1) {
        ids.push(shortcut(links[0]!))
        continue
      }
      const folder: FolderItem = {
        id: createId('f'),
        type: 'folder',
        title: child.title.trim() || '文件夹',
        children: links.map(shortcut),
      }
      items[folder.id] = folder
      ids.push(folder.id)
    }
    return ids.length ? { id: createId('g'), name, icon: 'bookmark', items: ids } : null
  }

  for (const root of bookmarkRoots(tree)) {
    if (root.url) {
      // 树里直接给了链接（不常见），归入「书签」分组
      const g = buildGroup('书签', [root])
      if (g) groups.push(g)
      continue
    }
    const looseLinks = (root.children ?? []).filter((c) => c.url)
    const loose = buildGroup(root.title.trim() || '书签', looseLinks)
    if (loose) groups.push(loose)
    for (const folder of root.children ?? []) {
      if (folder.url) continue
      const g = buildGroup(folder.title.trim() || '书签', folder.children ?? [])
      if (g) groups.push(g)
    }
  }
  return { groups, items, count }
}
