import { browser } from 'wxt/browser'
import type { ReminderJob } from '@myriad/ui'
const JOBS = 'myriad.reminder.jobs',
  FIRED = 'myriad.reminder.fired',
  PREFIX = 'myriad:'
let queue = Promise.resolve()
const serial = (fn: () => Promise<void>) => {
  const next = queue.catch(() => undefined).then(fn)
  queue = next
  return next
}
async function allowed() {
  return browser.permissions.contains({ permissions: ['alarms', 'notifications'] })
}
function valid(jobs: unknown): ReminderJob[] {
  return (Array.isArray(jobs) ? jobs : [])
    .filter(
      (j): j is ReminderJob =>
        j &&
        typeof j.id === 'string' &&
        /^(memo|countdown):[\w:.-]+$/.test(j.id) &&
        typeof j.at === 'number' &&
        Number.isFinite(j.at) &&
        j.at > Date.now() - 86400000 &&
        typeof j.title === 'string' &&
        typeof j.message === 'string',
    )
    .slice(0, 2000)
    .map((j) => ({ ...j, title: j.title.slice(0, 1000), message: j.message.slice(0, 2000) }))
}
async function replace(jobs: unknown) {
  if (!(await allowed())) return
  const list = valid(jobs),
    fired = (await browser.storage.local.get(FIRED))[FIRED] as Record<string, number> | undefined
  const map = Object.fromEntries(list.filter((j) => !fired?.[j.id]).map((j) => [j.id, j]))
  await browser.storage.local.set({ [JOBS]: map })
  const alarms = await browser.alarms.getAll()
  for (const alarm of alarms)
    if (alarm.name.startsWith(PREFIX) && !map[alarm.name.slice(PREFIX.length)])
      await browser.alarms.clear(alarm.name)
  for (const job of Object.values(map)) {
    const when = Math.max(Date.now() + 1000, job.at),
      name = PREFIX + job.id
    const old = alarms.find((a) => a.name === name)
    if (!old || Math.abs(old.scheduledTime - when) > 1000)
      await browser.alarms.create(name, { when })
  }
}
async function fire(name: string) {
  if (!(await allowed())) return
  const saved = await browser.storage.local.get([JOBS, FIRED])
  const jobs = (saved[JOBS] ?? {}) as Record<string, ReminderJob>,
    fired = (saved[FIRED] ?? {}) as Record<string, number>
  const id = name.slice(PREFIX.length),
    job = jobs[id]
  if (!job || fired[id] || job.at > Date.now() + 1000) return
  await browser.notifications.create(name, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: job.title || '万象 Myriad',
    message: job.message || ' ',
  })
  fired[id] = Date.now()
  delete jobs[id]
  const recent = Object.fromEntries(
    Object.entries(fired)
      .filter(([, at]) => at > Date.now() - 30 * 86400000)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5000),
  )
  await browser.storage.local.set({ [JOBS]: jobs, [FIRED]: recent })
}
export function setupReminders() {
  let attached = false
  const onAlarm = (alarm: { name: string }) => {
    if (alarm.name.startsWith(PREFIX)) void serial(() => fire(alarm.name)).catch(() => undefined)
  }
  function attach() {
    if (!attached && browser.alarms?.onAlarm) {
      browser.alarms.onAlarm.addListener(onAlarm)
      attached = true
    }
  }
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== browser.runtime.id || message?.type !== 'myriad-reminders') return false
    attach()
    void serial(() => replace(message.jobs)).then(
      () => respond({ ok: true }),
      () => respond({ ok: false }),
    )
    return true
  })
  attach()
  browser.permissions.onAdded.addListener(() => {
    attach()
    void restore()
  })
  browser.permissions.onRemoved.addListener((removed) => {
    if (removed.permissions?.includes('alarms')) {
      browser.alarms?.onAlarm.removeListener(onAlarm)
      attached = false
    }
  })
  const restore = () =>
    serial(async () => {
      const values = (await browser.storage.local.get(JOBS))[JOBS] as
        Record<string, ReminderJob> | undefined
      await replace(Object.values(values ?? {}))
    }).catch(() => undefined)
  browser.runtime.onStartup.addListener(() => {
    attach()
    void restore()
  })
  void restore()
}
