import type { StorageAdapter } from '@myriad/core'

/** 带过期时间的缓存，保存在宿主存储中（不同步） */
export function createCache(storage: StorageAdapter) {
  return {
    async get<T>(key: string, maxAgeMs: number): Promise<T | undefined> {
      const entry = await storage.get<{ at: number; value: T }>(`myriad.cache.${key}`)
      if (!entry || Date.now() - entry.at > maxAgeMs) return undefined
      return entry.value
    },
    /** 不论是否过期都返回（离线时用旧数据兜底） */
    async peek<T>(key: string): Promise<T | undefined> {
      return (await storage.get<{ at: number; value: T }>(`myriad.cache.${key}`))?.value
    },
    async set<T>(key: string, value: T) {
      await storage.set(`myriad.cache.${key}`, { at: Date.now(), value })
    },
  }
}
