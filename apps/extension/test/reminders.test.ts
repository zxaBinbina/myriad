import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ browser: {} as Record<string, any> }))
vi.mock('wxt/browser', () => mock)

function event() {
  const listeners = new Set<(...args: any[]) => any>()
  return {
    addListener: vi.fn((fn: (...args: any[]) => any) => listeners.add(fn)),
    removeListener: vi.fn((fn: (...args: any[]) => any) => listeners.delete(fn)),
    emit: (...args: any[]) => [...listeners].map((fn) => fn(...args)),
    listeners,
  }
}
const flush = async () => {
  for (let i = 0; i < 80; i++) await Promise.resolve()
}

describe('扩展后台提醒', () => {
  let granted: boolean
  let values: Record<string, any>
  let alarms: Map<string, { name: string; scheduledTime: number }>
  let api: any
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-14T02:00:00Z'))
    granted = false
    values = {}
    alarms = new Map()
    api = {
      onAlarm: event(),
      getAll: vi.fn(async () => [...alarms.values()]),
      create: vi.fn(async (name: string, options: { when: number }) => {
        alarms.set(name, { name, scheduledTime: options.when })
      }),
      clear: vi.fn(async (name: string) => alarms.delete(name)),
    }
    mock.browser = {
      permissions: {
        contains: vi.fn(async () => granted),
        onAdded: event(),
        onRemoved: event(),
      },
      runtime: {
        id: 'own-extension',
        getURL: (path: string) => `chrome-extension://own-extension${path}`,
        onMessage: event(),
        onStartup: event(),
      },
      storage: {
        local: {
          get: vi.fn(async (keys: string | string[]) =>
            Object.fromEntries(
              (Array.isArray(keys) ? keys : [keys]).map((key) => [key, values[key]]),
            ),
          ),
          set: vi.fn(async (incoming: Record<string, unknown>) => {
            Object.assign(values, structuredClone(incoming))
          }),
        },
      },
      notifications: { create: vi.fn(async () => 'notification') },
      get alarms() {
        return granted ? api : undefined
      },
    }
  })
  afterEach(() => vi.useRealTimers())
  async function start() {
    const { setupReminders } = await import('../utils/reminders')
    setupReminders()
    await flush()
  }
  async function replace(jobs: unknown) {
    return new Promise((resolve) => {
      mock.browser.runtime.onMessage.emit(
        { type: 'myriad-reminders', jobs },
        { id: 'own-extension' },
        resolve,
      )
    })
  }
  const job = (id = 'memo:list_1:task_1:1794621660000') => ({
    id,
    at: Date.now() + 60000,
    title: 'Test task',
    message: 'Test list',
  })

  it('首次未授权时没有 alarms API；授权后恢复保存的任务，撤权安全解除监听', async () => {
    const saved = job()
    values['myriad.reminder.jobs'] = { [saved.id]: saved }
    await start()
    expect(api.onAlarm.listeners.size).toBe(0)
    expect(api.create).not.toHaveBeenCalled()
    granted = true
    mock.browser.permissions.onAdded.emit({ permissions: ['alarms', 'notifications'] })
    await flush()
    expect(api.onAlarm.listeners.size).toBe(1)
    expect(alarms.has(`myriad:${saved.id}`)).toBe(true)
    mock.browser.permissions.onRemoved.emit({ permissions: ['alarms'] })
    granted = false
    expect(api.onAlarm.listeners.size).toBe(0)
  })

  it('重排更新闹钟、完成清除，忽略其他扩展和无效数据；不影响其他闹钟', async () => {
    granted = true
    await start()
    const first = job(),
      second = job('memo:list_1:task_2:1794621660000')
    alarms.set('unrelated', { name: 'unrelated', scheduledTime: Date.now() + 5000 })
    expect(
      await replace([first, second, { ...first, id: '__proto__' }, { ...first, at: NaN }]),
    ).toEqual({ ok: true })
    expect(alarms.size).toBe(3)
    const updated = { ...second, at: second.at + 10000 }
    await replace([updated])
    expect(alarms.has(`myriad:${first.id}`)).toBe(false)
    expect(alarms.get(`myriad:${second.id}`)?.scheduledTime).toBe(updated.at)
    expect(alarms.has('unrelated')).toBe(true)
    const respond = vi.fn()
    expect(
      mock.browser.runtime.onMessage.emit(
        { type: 'myriad-reminders', jobs: [] },
        { id: 'other-extension' },
        respond,
      ),
    ).toEqual([false])
    expect(respond).not.toHaveBeenCalled()
    await replace([])
    expect([...alarms.keys()]).toEqual(['unrelated'])
  })

  it('到期通知只发一次，重启补建缺失闹钟，不复活已发送的任务', async () => {
    granted = true
    await start()
    const first = job()
    await replace([first])
    alarms.clear()
    mock.browser.runtime.onStartup.emit()
    await flush()
    expect(alarms.has(`myriad:${first.id}`)).toBe(true)
    vi.setSystemTime(first.at)
    api.onAlarm.emit({ name: `myriad:${first.id}` })
    api.onAlarm.emit({ name: `myriad:${first.id}` })
    await flush()
    expect(mock.browser.notifications.create).toHaveBeenCalledTimes(1)
    expect(values['myriad.reminder.jobs'][first.id]).toBeUndefined()
    expect(values['myriad.reminder.fired'][first.id]).toBe(first.at)
    await replace([first])
    expect(alarms.has(`myriad:${first.id}`)).toBe(false)
  })

  it('后台调度错误返回失败，便于界面降级', async () => {
    granted = true
    await start()
    api.create.mockRejectedValueOnce(new Error('alarm failure'))
    expect(await replace([job()])).toEqual({ ok: false })
  })
})
