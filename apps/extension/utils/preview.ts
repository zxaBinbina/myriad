import { browser } from 'wxt/browser'
import type { PreviewSession } from '@myriad/ui'
export const PREVIEW_RULE_BASE = 1000000
export function previewRule(id: number, tabId: number, url: string, extensionId: string) {
  return {
    id,
    priority: 1,
    action: {
      type: 'modifyHeaders' as const,
      responseHeaders: [
        { header: 'x-frame-options', operation: 'remove' as const },
        { header: 'content-security-policy', operation: 'remove' as const },
      ],
    },
    condition: {
      regexFilter: `^${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      isUrlFilterCaseSensitive: true,
      tabIds: [tabId],
      initiatorDomains: [extensionId],
      resourceTypes: ['sub_frame' as const],
    },
  }
}
/** Invoke the permission API before any await so the click retains user activation. */
export async function preparePreview(
  url: string,
  origins: string[],
): Promise<PreviewSession | null> {
  const permission = browser.permissions.request({
    permissions: ['declarativeNetRequestWithHostAccess', 'scripting', 'webNavigation'],
    origins: [...new Set([new URL(url).origin, ...origins])].map((o) => `${o}/*`),
  })
  if (!(await permission)) return null
  const tab = await browser.tabs.getCurrent()
  if (tab?.id === undefined) return null
  const id = PREVIEW_RULE_BASE + (crypto.getRandomValues(new Uint32Array(1))[0]! % 1000000000),
    tabId = tab.id
  const installed = browser.declarativeNetRequest.updateSessionRules({
    addRules: [previewRule(id, tab.id, url, new URL(browser.runtime.getURL('/')).hostname)],
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      installed,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('preview-setup-timeout')), 5000)
      }),
    ])
  } catch (error) {
    // A stalled browser API must not block reading. Remove a rule that completes late.
    void (async () => {
      try {
        await installed
        await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] })
      } catch {}
    })()
    throw error
  } finally {
    clearTimeout(timer)
  }
  let closed = false
  return {
    async close() {
      closed = true
      await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] })
    },
    async scroll(enabled) {
      if (closed) return
      // Chrome forbids scripting the extension's main frame. Target only its preview child.
      const frames = await browser.webNavigation.getAllFrames({ tabId })
      const frameIds = (frames || [])
        .filter((frame) => frame.parentFrameId === 0 && frame.url === url)
        .map((frame) => frame.frameId)
      if (!frameIds.length) throw new Error('preview-frame-unavailable')
      if (closed) return
      await browser.scripting.executeScript({
        target: { tabId, frameIds },
        args: [url, enabled],
        func: (expected: string, scrolling: boolean) => {
          if (window === window.top || location.href !== expected) return
          const scope = window as unknown as { __myriadPreviewStop?: () => void }
          scope.__myriadPreviewStop?.()
          let hovered = false,
            raf = 0,
            last = 0
          const pause = () => {
              hovered = true
            },
            resume = () => {
              hovered = false
              last = 0
            }
          const open = (event: MouseEvent) => {
            if (event.button !== 0 || window.getSelection()?.toString()) return
            event.preventDefault()
            event.stopPropagation()
            window.parent.postMessage({ type: 'myriad-preview-open', url: expected }, '*')
          }
          const tick = (time: number) => {
            if (scrolling && !hovered && document.visibilityState === 'visible') {
              if (!last) last = time
              if (time - last >= 50) {
                window.scrollBy(0, Math.min(4, (time - last) * 0.02))
                last = time
              }
            } else last = 0
            raf = requestAnimationFrame(tick)
          }
          document.addEventListener('mouseenter', pause)
          document.addEventListener('mouseleave', resume)
          document.addEventListener('click', open, true)
          if (scrolling) raf = requestAnimationFrame(tick)
          scope.__myriadPreviewStop = () => {
            cancelAnimationFrame(raf)
            document.removeEventListener('mouseenter', pause)
            document.removeEventListener('mouseleave', resume)
            document.removeEventListener('click', open, true)
          }
        },
      })
    },
  }
}
