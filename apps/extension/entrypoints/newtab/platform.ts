import type { BookmarkNode, StorageAdapter } from '@myriad/core'
import type { MyriadPlatform } from '@myriad/ui'
import { browser } from 'wxt/browser'

/** chrome.storage.local 存储；其他标签页的修改通过 onChanged 通知 */
function createExtensionStorage(areaName: 'local' | 'sync' = 'local'): StorageAdapter {
  const area = browser.storage[areaName]
  return {
    async get<T>(key: string) {
      const r = await area.get(key)
      return r[key] as T | undefined
    },
    async set<T>(key: string, value: T) {
      await area.set({ [key]: value })
    },
    async remove(key: string) {
      await area.remove(key)
    },
    subscribe(listener) {
      const onChanged = (changes: Record<string, { newValue?: unknown }>, changedArea: string) => {
        if (changedArea !== areaName) return
        for (const [k, c] of Object.entries(changes)) listener(k, c.newValue)
      }
      browser.storage.onChanged.addListener(onChanged)
      return () => browser.storage.onChanged.removeListener(onChanged)
    },
  }
}

const FOCUS_PARAM = 'focus'

export function createExtensionPlatform(): MyriadPlatform {
  const focusRequested = new URLSearchParams(location.search).has(FOCUS_PARAM)
  return {
    kind: 'extension',
    storage: createExtensionStorage(),
    secrets: createExtensionStorage('sync'),
    reminders: {
      has: () => browser.permissions.contains({ permissions: ['notifications', 'alarms'] }),
      request: () => browser.permissions.request({ permissions: ['notifications', 'alarms'] }),
      replace: async (jobs) => {
        const result = await browser.runtime.sendMessage({ type: 'myriad-reminders', jobs })
        if (!result?.ok) throw new Error('reminder-scheduling-failed')
      },
    },
    version: browser.runtime.getManifest().version,
    repoUrl: 'https://github.com/zxaBinbina/myriad',
    focusRequested,
    bookmarks: {
      has: () => browser.permissions.contains({ permissions: ['bookmarks'] }),
      request: () => browser.permissions.request({ permissions: ['bookmarks'] }),
      getTree: async () => (await browser.bookmarks.getTree()) as BookmarkNode[],
    },
    // 同步服务地址由用户填写，连接时只申请那一个来源
    origins: {
      has: (origin) => browser.permissions.contains({ origins: [`${origin}/*`] }),
      request: (origin) => browser.permissions.request({ origins: [`${origin}/*`] }),
      requestMany: (origins) =>
        browser.permissions.request({ origins: origins.map((o) => `${o}/*`) }),
    },
    location: {
      // 权限已在 manifest 中声明；只在用户点击定位时读取位置。
      locate: () =>
        new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
            reject,
            { timeout: 10000, maximumAge: 300000 },
          ),
        ),
    },
    grabFocus: () => {
      // 由扩展发起的导航会把焦点交给页面而不是地址栏
      void browser.tabs.getCurrent().then((tab) => {
        if (tab?.id !== undefined)
          void browser.tabs.update(tab.id, {
            url: browser.runtime.getURL(`/newtab.html?${FOCUS_PARAM}`),
          })
      })
    },
  }
}
