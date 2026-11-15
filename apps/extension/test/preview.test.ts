import { describe, it, expect, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  browser: {
    permissions: { request: vi.fn(async (_options: unknown) => true) },
    tabs: { getCurrent: vi.fn(async () => ({ id: 12 })) },
    runtime: { id: 'extension-id', getURL: () => 'chrome-extension://extension-id/' },
    declarativeNetRequest: { updateSessionRules: vi.fn(async (_options: unknown) => {}) },
    scripting: { executeScript: vi.fn(async (_options: unknown) => []) },
    webNavigation: {
      getAllFrames: vi.fn(async () => [
        { frameId: 0, parentFrameId: -1, url: 'chrome-extension://extension-id/' },
        { frameId: 5, parentFrameId: 0, url: 'https://example.com/article' },
        { frameId: 6, parentFrameId: 5, url: 'https://example.com/article' },
      ]),
    },
  },
}))
vi.mock('wxt/browser', () => mock)
import { previewRule, preparePreview } from '../utils/preview'
describe('Preview optional capabilities', () => {
  it('scope header changes to the exact iframe URL, tab and extension initiator', () => {
    const url = 'https://example.com/p?q=a.b&x=1',
      rule = previewRule(1, 12, url, 'extension-id')
    expect(new RegExp(rule.condition.regexFilter).test(url)).toBe(true)
    expect(new RegExp(rule.condition.regexFilter).test(url + 'extra')).toBe(false)
    expect(rule.condition.tabIds).toEqual([12])
    expect(rule.condition.resourceTypes).toEqual(['sub_frame'])
    expect(rule.condition.initiatorDomains).toEqual(['extension-id'])
  })
  it('requests permission before any tab lookup; close removes its session rule', async () => {
    const session = await preparePreview('https://example.com/article', ['https://worker.example'])
    expect(mock.browser.permissions.request.mock.invocationCallOrder[0]).toBeLessThan(
      mock.browser.tabs.getCurrent.mock.invocationCallOrder[0]!,
    )
    expect(mock.browser.permissions.request).toHaveBeenCalledWith({
      permissions: ['declarativeNetRequestWithHostAccess', 'scripting', 'webNavigation'],
      origins: ['https://example.com/*', 'https://worker.example/*'],
    })
    await session!.scroll(true)
    expect(mock.browser.scripting.executeScript.mock.calls.at(-1)![0]).toMatchObject({
      target: { tabId: 12, frameIds: [5] },
    })
    await session!.close()
    expect(
      mock.browser.declarativeNetRequest.updateSessionRules.mock.calls.at(-1)![0],
    ).toHaveProperty('removeRuleIds')
  })
  it('falls back after stalled rule setup and removes a rule that completes late', async () => {
    vi.useFakeTimers()
    let finish!: () => void
    mock.browser.declarativeNetRequest.updateSessionRules.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    )
    try {
      const pending = preparePreview('https://example.com/stalled', [])
      const rejected = expect(pending).rejects.toThrow('preview-setup-timeout')
      await vi.advanceTimersByTimeAsync(5000)
      await rejected
      const call = mock.browser.declarativeNetRequest.updateSessionRules.mock.calls.at(-1)![0] as {
        addRules: { id: number }[]
      }
      finish()
      await vi.advanceTimersByTimeAsync(0)
      expect(mock.browser.declarativeNetRequest.updateSessionRules.mock.calls.at(-1)![0]).toEqual({
        removeRuleIds: [call.addRules[0]!.id],
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
