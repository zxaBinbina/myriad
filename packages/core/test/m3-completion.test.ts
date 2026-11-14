import { describe, expect, it, vi } from 'vitest'
import {
  countdownConfig,
  countdownReminderJobs,
  fromLunar,
  githubConfig,
  parseGithub,
  resolveCountdown,
  translateStructured,
  type WidgetItem,
} from '../src'

describe('Structured translation', () => {
  it('preserves title, blank lines, all seven bullets, indentation and CRLF despite flattened output', async () => {
    const source =
      'feat: add translation widget\r\n\r\n' +
      Array.from({ length: 7 }, (_, i) => `- Change ${i}`).join('\r\n') +
      '\r\n  1. [x] Nested  \r\n'
    const translate = vi.fn(async (text: string) => ({ text: '译文 ' + text + '\nextra' }))
    const result = await translateStructured(source, translate, new AbortController().signal)
    expect(result.text.split('\r\n').length).toBe(source.split('\r\n').length)
    expect(result.text.split('\r\n')[1]).toBe('')
    expect(result.text.match(/^- /gm)).toHaveLength(7)
    expect(result.text).toContain('\r\n  1. [x] 译文 Nested extra  \r\n')
    expect(translate).toHaveBeenCalledTimes(9)
  })
  it('leaves fenced code and whitespace intact without sending them', async () => {
    const source = '# Heading\n\n```ts\nconst x = 1\n```\n\t\n> Quote\n---'
    const translate = vi.fn(async () => ({ text: '译文' }))
    const result = await translateStructured(source, translate, new AbortController().signal)
    expect(result.text).toBe('# 译文\n\n```ts\nconst x = 1\n```\n\t\n> 译文\n---')
    expect(translate).toHaveBeenCalledTimes(2)
  })
  it('bounds parallelism and starts no further segments after cancellation', async () => {
    const ctrl = new AbortController(),
      pending: (() => void)[] = []
    const translate = vi.fn(async () => {
      await new Promise<void>((resolve) => pending.push(resolve))
      return { text: '译文' }
    })
    const run = translateStructured('one\ntwo\nthree\nfour\nfive', translate, ctrl.signal)
    const rejected = expect(run).rejects.toThrow()
    expect(translate).toHaveBeenCalledTimes(3)
    ctrl.abort()
    pending.forEach((resolve) => resolve())
    await rejected
    expect(translate).toHaveBeenCalledTimes(3)
  })
  it('rejects partial failure instead of returning a mixture of original and translated lines', async () => {
    await expect(
      translateStructured(
        'one\ntwo\nthree\nfour',
        async (text) => {
          if (text === 'two') throw new Error('quota')
          return { text: '译文' }
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('quota')
  })
})
describe('Advanced countdowns', () => {
  it('converts fixed lunar new years and distinguishes leap months', () => {
    expect(fromLunar(2025, 1, 1)).toEqual({ year: 2025, month: 1, day: 29 })
    expect(fromLunar(2026, 1, 1)).toEqual({ year: 2026, month: 2, day: 17 })
    expect(fromLunar(2027, 1, 1)).toEqual({ year: 2027, month: 2, day: 6 })
    expect(fromLunar(2025, 6, 1, true)).toEqual({ year: 2025, month: 7, day: 25 })
    expect(fromLunar(2026, 6, 1, true)).toBeNull()
    expect(
      resolveCountdown(countdownConfig({ calendar: 'lunar' }), { year: 2026, month: 1, day: 1 })
        ?.date,
    ).toBe('2026-02-17')
  })
  it('uses published holiday starts and excludes makeup working days and continuation days', () => {
    const holidays = {
      '2026-12-31': { name: '元旦', off: true },
      '2027-01-01': { name: '元旦', off: true },
      '2027-01-02': { name: '元旦', off: false },
      '2027-02-06': { name: '春节', off: true },
    }
    expect(
      resolveCountdown(
        countdownConfig({ calendar: 'holiday' }),
        { year: 2027, month: 1, day: 1 },
        holidays,
      )?.date,
    ).toBe('2027-02-06')
    expect(
      resolveCountdown(
        countdownConfig({ calendar: 'holiday' }),
        { year: 2027, month: 3, day: 1 },
        holidays,
      ),
    ).toBeNull()
  })
  it('schedules independent recurring reminders in the selected timezone and removes disabled events', () => {
    const item: WidgetItem = {
      id: 'w-event',
      type: 'widget',
      kind: 'countdown',
      size: '2x2',
      config: { date: '2025-01-01', repeat: 'year', remind: true, reminderTime: '09:00' },
    }
    const jobs = countdownReminderJobs(
      [item],
      {},
      new Date('2026-01-01T00:00Z'),
      'Asia/Shanghai',
      'Event',
      'Today',
    )
    expect(jobs[0]?.at).toBe(Date.parse('2026-01-01T01:00Z'))
    expect(jobs[1]?.at).toBe(Date.parse('2027-01-01T01:00Z'))
    expect(jobs[0]?.id).toContain('countdown:w-event:2026-01-01')
    expect(
      countdownReminderJobs(
        [{ ...item, config: { ...item.config, remind: false } }],
        {},
        new Date(),
        'Asia/Shanghai',
        'Event',
        'Today',
      ),
    ).toEqual([])
  })
})
describe('GitHub config and hostile upstreams', () => {
  it('normalizes imported settings and never accepts credentials in configuration', () => {
    const cfg = githubConfig({
      user: '../private',
      repos: ['a/b', 'a/b', 'https://evil.test'],
      token: 'never-export',
      sections: ['tasks', 'evil'],
    })
    expect(cfg.user).toBe('zxaBinbina')
    expect(cfg.repos).toEqual(['a/b'])
    expect(cfg.sections).toEqual(['tasks'])
    expect(JSON.stringify(cfg)).not.toContain('never-export')
  })
  it('removes executable links and preserves unknown contribution counts as unknown', () => {
    const result = parseGithub(
      { section: 'contributions', days: [{ date: '2026-01-01', count: null, level: 4 }] },
      'contributions',
    )
    expect(result.days[0]?.count).toBeNull()
    expect(
      parseGithub(
        { section: 'tasks', tasks: [{ id: '1', title: '<script>', url: 'javascript:alert(1)' }] },
        'tasks',
      ).entries[0]?.url,
    ).toBe('')
  })
})
