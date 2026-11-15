import type { BookmarkNode, StorageAdapter } from '@zxabinbina/myriad-core'

/** 宿主环境（扩展 / 网站）向界面提供的能力 */
export interface MyriadPlatform {
  kind: 'extension' | 'web'
  storage: StorageAdapter
  version: string
  repoUrl?: string
  /** 网站访客：禁止个人同步、私有 API 与服务密钥。 */
  guest?: boolean
  /** 公开免费 Worker 接口，独立于个人同步配置。 */
  publicApiBase?: string
  /** 嵌入现有网站时，主题和语言只作用于本组件。 */
  embedded?: boolean
  theme?: {
    get(): { palette: 'fufu-blue' | 'hutao-red'; theme: 'dark' | 'light' | 'auto' }
    set(value: { palette: 'fufu-blue' | 'hutao-red'; theme: 'dark' | 'light' | 'auto' }): void
    subscribe(listener: () => void): () => void
  }
  /** 宿主路由管理搜索地址，保留其 history state。 */
  navigate?: (url: URL) => void
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
  preview?: { prepare(url: string, origins: string[]): Promise<PreviewSession | null> }
}
export interface PreviewSession {
  close(): Promise<void>
  scroll(enabled: boolean): Promise<void>
}

export interface ReminderJob {
  id: string
  at: number
  title: string
  message: string
}
