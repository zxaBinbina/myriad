/**
 * 键值存储接口。扩展使用 chrome.storage.local，网站版使用 localStorage，
 * 将来的同步服务也通过它接入。值必须可以 JSON 序列化。
 */
export interface StorageAdapter {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  /** 其他标签页修改了某个键时回调；返回取消订阅函数 */
  subscribe?(listener: (key: string, value: unknown) => void): () => void
}

export const STORAGE_KEYS = {
  data: 'myriad.data',
  settings: 'myriad.settings',
  local: 'myriad.local',
} as const

/** localStorage 实现（网站版、开发预览） */
export function createLocalStorageAdapter(prefix = ''): StorageAdapter {
  const k = (key: string) => prefix + key
  return {
    async get<T>(key: string) {
      const raw = localStorage.getItem(k(key))
      if (raw === null) return undefined
      try {
        return JSON.parse(raw) as T
      } catch {
        return undefined
      }
    },
    async set<T>(key: string, value: T) {
      localStorage.setItem(k(key), JSON.stringify(value))
    },
    async remove(key: string) {
      localStorage.removeItem(k(key))
    },
    subscribe(listener) {
      const onStorage = (e: StorageEvent) => {
        if (!e.key || !e.key.startsWith(prefix)) return
        let value: unknown
        try {
          value = e.newValue === null ? undefined : JSON.parse(e.newValue)
        } catch {
          return
        }
        listener(e.key.slice(prefix.length), value)
      }
      addEventListener('storage', onStorage)
      return () => removeEventListener('storage', onStorage)
    },
  }
}

/** 内存实现（测试用） */
export function createMemoryAdapter(initial: Record<string, unknown> = {}): StorageAdapter {
  const map = new Map(Object.entries(initial))
  return {
    async get<T>(key: string) {
      const v = map.get(key)
      return v === undefined ? undefined : (structuredClone(v) as T)
    },
    async set<T>(key: string, value: T) {
      map.set(key, structuredClone(value))
    },
    async remove(key: string) {
      map.delete(key)
    },
  }
}
