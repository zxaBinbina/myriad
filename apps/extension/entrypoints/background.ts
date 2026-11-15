import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'
import { setupReminders } from '../utils/reminders'
import { PREVIEW_RULE_BASE } from '../utils/preview'

// 首次安装时打开一个新标签页，直接进入引导
export default defineBackground(() => {
  setupReminders()
  const clearPreviewRules = (tabId: number) => {
    void (async () => {
      if (
        !(await browser.permissions.contains({
          permissions: ['declarativeNetRequestWithHostAccess'],
        }))
      )
        return
      const rules = await browser.declarativeNetRequest.getSessionRules()
      const ids = rules
        .filter((r) => r.id >= PREVIEW_RULE_BASE && r.condition.tabIds?.includes(tabId))
        .map((r) => r.id)
      if (ids.length) await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids })
    })().catch(() => {})
  }
  browser.tabs.onRemoved.addListener(clearPreviewRules)
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading') clearPreviewRules(tabId)
  })
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.tabs.create({})
  })
})
