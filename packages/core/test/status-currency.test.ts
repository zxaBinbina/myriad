import { describe, expect, it } from 'vitest'
import {
  convertCurrency,
  currencyConfig,
  currencyHistory,
  defaultCurrency,
  exchangeRate,
  minecraftConfig,
  motdRuns,
  parseMinecraft,
  parseMinecraftSnapshot,
  parseStatus,
  parseStatusHistory,
  sampledCurrencyDates,
  statusConfig,
} from '../src/index'
describe('状态与 Minecraft 数据', () => {
  it('Minecraft 支持独立或嵌套 JSON，不要求完整网站监控格式', () => {
    const raw = { online: true, players: { online: 0, max: 30 }, version: '1.21.1' }
    for (const value of [raw, { minecraft: raw, refreshAfterMs: 120000 }]) {
      expect(parseMinecraftSnapshot(value).reading).toMatchObject({
        online: true,
        status: 'operational',
        playersOnline: 0,
        version: '1.21.1',
      })
      expect(() => parseStatus(value)).toThrow('invalid-status')
    }
    expect(parseMinecraftSnapshot({ services: [], overall: 'operational' }).reading.status).toBe(
      'unknown',
    )
    expect(parseMinecraftSnapshot({ minecraft: { online: false } }).reading.status).toBe('outage')
    expect(
      parseMinecraft({ version: { name_clean: '1.21' }, motd: { raw: '§aWelcome' } }),
    ).toMatchObject({ version: '1.21', motd: '§aWelcome' })
  })
  it('旧状态接口配置默认使用 Java 备选，可切换版本或关闭；仅地址配置不带历史', () => {
    expect(minecraftConfig({}).servers[0]?.fallbackKind).toBe('java')
    expect(
      minecraftConfig({ servers: [{ address: '  mc.example.com  ', fallbackKind: 'bedrock' }] })
        .servers[0],
    ).toMatchObject({ fallbackKind: 'bedrock', address: 'mc.example.com', historyUrl: '' })
    expect(minecraftConfig({ servers: [{ fallbackKind: 'none' }] }).servers[0]?.fallbackKind).toBe(
      'none',
    )
    for (const kind of ['java', 'bedrock'])
      expect(
        minecraftConfig({ servers: [{ kind, address: 'mc.example.com' }] }).servers[0],
      ).toMatchObject({ kind, historyUrl: '', fallbackKind: 'none' })
  })
  it('未知状态和在线零人不会被当成离线或缺失', () => {
    expect(
      parseMinecraft({ online: false, status: 'unknown', playersOnline: null }).online,
    ).toBeNull()
    expect(parseMinecraft({ online: true, players: { online: 0, max: 20 } })).toMatchObject({
      online: true,
      playersOnline: 0,
      playersMax: 20,
      status: 'operational',
    })
    expect(parseMinecraft({ online: false }).status).toBe('outage')
    expect(
      parseMinecraft({ players: { list: [{ name_clean: 'Steve', uuid: '1234' }] } }).players,
    ).toEqual([{ name: 'Steve', id: '1234' }])
    const data = parseStatus({
      overall: 'degraded',
      services: [],
      refreshAfterMs: 120000,
      node: { cpuUsage: 0, memoryUsage: null },
    })
    expect(data.refreshAfterMs).toBe(120000)
    expect(data.node.cpu).toBe(0)
    expect(data.node.memory).toBeNull()
  })
  it('历史保留缺失人数，按时间排序并去重', () => {
    const data = parseStatusHistory({
      samples: [
        { capturedAt: 200, minecraft: { playersOnline: null } },
        { capturedAt: 100, minecraft: { playersOnline: 2 } },
        { capturedAt: 100, minecraft: { playersOnline: 0 } },
      ],
    })
    expect(data.map((p) => [p.time, p.players])).toEqual([
      [100, 0],
      [200, null],
    ])
  })
  it('默认历史来自现有服务，不添加默认快捷操作', () => {
    expect(statusConfig({}).historyUrl).toBe('https://status.mcyzw.top/api/status/history')
    expect(statusConfig({ historyUrl: '' }).historyUrl).toBe('')
    const config = minecraftConfig({})
    expect(config.servers[0]?.historyUrl).toBe('https://status.mcyzw.top/api/status/history')
    expect(config.servers[0]?.actions).toEqual([])
    expect(
      minecraftConfig({ servers: [{ kind: 'java', address: 'server.example.com' }] }).servers[0]
        ?.historyUrl,
    ).toBe('')
    const actions = minecraftConfig({
      servers: [
        {
          actions: [
            { label: 'copy', kind: 'copy' },
            { label: 'bad', url: 'javascript:alert(1)' },
          ],
        },
      ],
    }).servers[0]?.actions
    expect(actions).toHaveLength(1)
    expect(actions?.[0]?.kind).toBe('copy')
  })
  it('MOTD 传统颜色、RGB、样式复位与 JSON 子节点继承', () => {
    const runs = motdRuns('§a绿§l粗§r普通<img src=x>')
    expect(runs[0]?.color).toBe('#55ff55')
    expect(runs[1]?.bold).toBe(true)
    expect(runs[2]).toMatchObject({ color: '', bold: false, text: '普通<img src=x>' })
    expect(motdRuns('§x§1§2§3§4§5§6颜色')[0]?.color).toBe('#123456')
    const json = parseMinecraft({
      description: {
        text: 'A',
        color: 'gold',
        extra: [{ text: 'B', color: 'red' }, { text: 'C' }],
      },
    })
    expect(motdRuns(json.motd).map((r) => [r.text, r.color])).toEqual([
      ['A', '#ffaa00'],
      ['B', '#ff5555'],
      ['C', '#ffaa00'],
    ])
    expect(parseMinecraft({ favicon: 'data:image/svg+xml,evil' }).icon).toBe('')
  })
})
describe('汇率数据与计算', () => {
  it('浏览器时区默认币种，默认不选加密货币', () => {
    expect(defaultCurrency('Asia/Tokyo')).toBe('JPY')
    expect(defaultCurrency('Asia/Hong_Kong')).toBe('HKD')
    expect(defaultCurrency('unknown')).toBe('CNY')
    expect(currencyConfig({ base: 'btc' }, 'Asia/Shanghai').base).toBe('CNY')
    expect(currencyConfig({ base: 'btc', crypto: true }).base).toBe('BTC')
  })
  it('主备来源的零值、缺失与无效汇率不会显示为有效报价', () => {
    expect(
      exchangeRate({ date: '2026-11-13', rates: { USD: 0.14 } }, 'USD', 'frankfurter'),
    ).toEqual({ date: '2026-11-13', rate: 0.14 })
    expect(
      exchangeRate({ date: '2026-11-14', btc: { usd: 100 } }, 'USD', 'currency-api').rate,
    ).toBe(100)
    expect(() => exchangeRate({ rates: { USD: 0 } }, 'USD', 'er')).toThrow()
    expect(() => exchangeRate({ rates: { USD: null } }, 'USD', 'frankfurter')).toThrow()
    expect(convertCurrency(0, 0.14)).toBe(0)
    expect(convertCurrency(100, 0.14)).toBeCloseTo(14)
    expect(convertCurrency(NaN, 0.14)).toBeNull()
  })
  it('历史按日期排序，不把缺失日或零汇率补进走势', () => {
    const data = currencyHistory(
      {
        rates: {
          '2026-11-13': { USD: 0.14 },
          '2026-11-10': { USD: 0 },
          '2026-11-11': { USD: 0.13 },
        },
      },
      'USD',
    )
    expect(data).toEqual([
      { date: '2026-11-11', rate: 0.13 },
      { date: '2026-11-13', rate: 0.14 },
    ])
    expect(sampledCurrencyDates({ year: 2026, month: 3, day: 1 })).toEqual([
      '2026-01-30',
      '2026-02-04',
      '2026-02-09',
      '2026-02-14',
      '2026-02-19',
      '2026-02-24',
      '2026-03-01',
    ])
  })
})
