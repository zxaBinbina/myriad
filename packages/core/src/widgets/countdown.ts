import { addDays, zonedParts } from '../calendar/dates'
import type { HolidayMap } from '../calendar/holidays'
import { countdownConfig, dateDistance, parsePlainDate, resolveCountdown } from '../widgets'
import { taskDeadline, todoTask } from './memo'
import type { WidgetItem } from '../types'

/** Schedule a year ahead so recurring events still notify while all new tabs are closed. */
export function countdownReminderJobs(
  items: WidgetItem[],
  holidays: HolidayMap,
  now: Date,
  zone: string,
  defaultTitle: string,
  message: string,
) {
  const today = zonedParts(now, zone)
  return items.flatMap((item) => {
    const config = countdownConfig(item.config)
    if (!config.remind) return []
    const jobs: { id: string; at: number; title: string; message: string }[] = []
    let cursor = today
    for (let i = 0; i < 60; i++) {
      const event = resolveCountdown(config, cursor, holidays)
      if (!event || event.remaining < 0) break
      const date = parsePlainDate(event.date)!
      if (dateDistance(today, date) > 400) break
      const at = taskDeadline(
        todoTask({ due: event.date, time: config.reminderTime }, item.id),
        zone,
      )
      if (at !== null && at >= now.getTime() - 86400000)
        jobs.push({
          id: `countdown:${item.id}:${event.date}:${at}`,
          at,
          title: event.title || defaultTitle,
          message,
        })
      if (config.calendar !== 'holiday' && config.repeat === 'none') break
      cursor = { ...cursor, ...addDays(date, 1) }
    }
    return jobs
  })
}
