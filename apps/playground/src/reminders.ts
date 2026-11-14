import type { MyriadPlatform, ReminderJob } from '@myriad/ui'
/** 网页仅在页面打开时运行；Web Locks 防止多个标签页重复通知。 */
export function webReminders(): NonNullable<MyriadPlatform['reminders']> {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const FIRED = 'myriad.web.reminders.fired'
  async function notify(job: ReminderJob) {
    const task = async () => {
      let fired: Record<string, number> = {}
      try {
        fired = JSON.parse(localStorage.getItem(FIRED) || '{}')
      } catch {}
      if (fired[job.id] || !('Notification' in window) || Notification.permission !== 'granted')
        return
      new Notification(job.title, { body: job.message, tag: job.id })
      fired[job.id] = Date.now()
      localStorage.setItem(
        FIRED,
        JSON.stringify(
          Object.fromEntries(
            Object.entries(fired)
              .filter(([, at]) => at > Date.now() - 30 * 86400000)
              .slice(-5000),
          ),
        ),
      )
    }
    if (navigator.locks) await navigator.locks.request('myriad.web.reminders', task)
    else await task()
  }
  return {
    has: async () => 'Notification' in window && Notification.permission === 'granted',
    request: () =>
      'Notification' in window
        ? Notification.requestPermission().then((p) => p === 'granted')
        : Promise.resolve(false),
    replace: async (jobs) => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      for (const job of jobs) {
        const delay = job.at - Date.now()
        const schedule = () => {
          const left = job.at - Date.now()
          if (left > 2147483647) {
            timers.set(job.id, setTimeout(schedule, 2147483647))
            return
          }
          timers.set(
            job.id,
            setTimeout(() => void notify(job).catch(() => undefined), Math.max(0, left)),
          )
        }
        if (delay > -86400000) schedule()
      }
    },
  }
}
