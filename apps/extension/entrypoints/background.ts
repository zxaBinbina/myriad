import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'

// 首次安装时打开一个新标签页，直接进入引导
export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.tabs.create({})
  })
})
