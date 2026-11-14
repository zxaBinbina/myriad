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
  /**
   * 访问同步服务所需的主机权限（扩展）。网站版不需要，省略即可。
   * request 必须在用户操作（点击）中、任何 await 之前调用。
   */
  origins?: {
    has(origin: string): Promise<boolean>
    request(origin: string): Promise<boolean>
    requestMany?(origins: string[]): Promise<boolean>
  }
  location?: { locate(): Promise<{ latitude: number; longitude: number }> }
  /** 加密清单的密钥：扩展使用 storage.sync，网站版省略时存本机。 */
  secrets?: StorageAdapter
  reminders?: {
    has(): Promise<boolean>
    request(): Promise<boolean>
    replace(jobs: ReminderJob[]): Promise<void>
  }
  /** 扩展：让页面从地址栏取得焦点（会重新加载一次页面） */
  grabFocus?: () => void
  /** 页面是否由 grabFocus 重新加载而来 */
  focusRequested?: boolean
}

export interface ReminderJob {
  id: string
  at: number
  title: string
  message: string
}
