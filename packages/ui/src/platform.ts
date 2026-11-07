import type { BookmarkNode, StorageAdapter } from '@myriad/core'

/** 宿主环境（扩展 / 网站）向界面提供的能力 */
export interface MyriadPlatform {
  kind: 'extension' | 'web'
  storage: StorageAdapter
  version: string
  repoUrl?: string
  /** 浏览器书签（仅扩展） */
  bookmarks?: {
    /** 是否已有权限 */
    has(): Promise<boolean>
    /** 申请权限（需在用户操作中调用） */
    request(): Promise<boolean>
    getTree(): Promise<BookmarkNode[]>
  }
  /** 扩展：让页面从地址栏取得焦点（会重新加载一次页面） */
  grabFocus?: () => void
  /** 页面是否由 grabFocus 重新加载而来 */
  focusRequested?: boolean
}
