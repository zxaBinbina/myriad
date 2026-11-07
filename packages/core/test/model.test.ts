import { describe, expect, it } from 'vitest'
import {
  appendData,
  convertBookmarks,
  createBackup,
  findContainer,
  iconSlugCandidates,
  matchAny,
  matchPrefix,
  mergeIntoFolder,
  moveItem,
  parseBackup,
  presetData,
  resolveEngines,
  defaultSettings,
  loadSettings,
} from '../src'

describe('条目操作', () => {
  it('合并成文件夹、拖出后自动解散', () => {
    const data = presetData()
    const group = data.groups[0]!
    const [a, b] = group.items.filter((id) => data.items[id]!.type === 'shortcut')
    const folderId = mergeIntoFolder(data, b!, a!)!
    expect(data.items[folderId]!.type).toBe('folder')
    expect(group.items).toContain(folderId)
    expect(group.items).not.toContain(a)
    moveItem(data, b!, { kind: 'group', id: group.id }, 0)
    // 文件夹只剩一个快捷方式，解散
    expect(data.items[folderId]).toBeUndefined()
    expect(group.items).toContain(a)
    expect(group.items[0]).toBe(b)
  })
  it('小组件不能放进 Dock，文件夹不能嵌套', () => {
    const data = presetData()
    const widget = Object.values(data.items).find((i) => i.type === 'widget')!
    expect(moveItem(data, widget.id, { kind: 'dock' })).toBe(false)
    const folder = Object.values(data.items).find((i) => i.type === 'folder')!
    expect(moveItem(data, folder.id, { kind: 'folder', id: folder.id })).toBe(false)
    expect(findContainer(data, widget.id)?.kind).toBe('group')
  })
})

describe('书签导入', () => {
  it('按层级转换', () => {
    const tree = [
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: '书签栏',
            children: [
              { id: '10', title: 'GitHub', url: 'https://github.com' },
              {
                id: '11',
                title: '开发',
                children: [
                  { id: '110', title: 'MDN', url: 'https://developer.mozilla.org' },
                  {
                    id: '111',
                    title: '前端',
                    children: [
                      { id: '1110', title: 'Vue', url: 'https://vuejs.org' },
                      { id: '1111', title: '', url: 'https://vite.dev' },
                      {
                        id: '1112',
                        title: 'deep',
                        children: [
                          { id: '11120', title: 'TS', url: 'https://www.typescriptlang.org' },
                        ],
                      },
                    ],
                  },
                  { id: '112', title: 'JS', url: 'javascript:alert(1)' },
                ],
              },
            ],
          },
        ],
      },
    ]
    const r = convertBookmarks(tree)
    expect(r.groups.map((g) => g.name)).toEqual(['书签栏', '开发'])
    const dev = r.groups[1]!
    expect(dev.items).toHaveLength(2)
    const folder = r.items[dev.items[1]!]!
    expect(folder.type === 'folder' && folder.children.length).toBe(3)
    expect(r.count).toBe(5)
    const partial = convertBookmarks(tree, new Set(['110']))
    expect(partial.groups.map((g) => g.name)).toEqual(['开发'])
  })
})

describe('导入导出', () => {
  it('往返并追加', () => {
    const data = presetData()
    const settings = defaultSettings()
    settings.palette = 'hutao-red'
    const parsed = parseBackup(JSON.stringify(createBackup({ data, settings })))
    expect(parsed.settings!.palette).toBe('hutao-red')
    const target = presetData()
    const before = target.groups.length
    appendData(target, parsed.data!)
    expect(target.groups.length).toBe(before * 2)
    expect(Object.keys(target.items).length).toBe(Object.keys(data.items).length * 2)
    expect(() => parseBackup('{"a":1}')).toThrow()
  })
  it('设置与默认值合并', () => {
    const s = loadSettings({ palette: 'hutao-red', icons: { size: 72 }, bogus: 1 })
    expect(s.palette).toBe('hutao-red')
    expect(s.icons.size).toBe(72)
    expect(s.icons.showLabels).toBe(true)
    expect('bogus' in s).toBe(false)
  })
})

describe('搜索', () => {
  it('前缀匹配', () => {
    const engines = resolveEngines(defaultSettings().search, 'zh-CN')
    expect(matchPrefix(engines, 'gh vue core')?.engine.id).toBe('github')
    expect(matchPrefix(engines, 'gh')).toBeNull()
    expect(matchPrefix(engines, 'so x')).toBeNull() // 默认停用
  })
  it('快捷键匹配', () => {
    const e = {
      key: '\\',
      code: 'Backslash',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    }
    expect(matchAny(['\\'], e)).toBe(true)
    expect(matchAny(['Alt+1'], { ...e, key: '¡', code: 'Digit1', altKey: true })).toBe(true)
    expect(matchAny(['Alt+ArrowRight'], { ...e, key: 'ArrowRight', code: 'ArrowRight' })).toBe(
      false,
    )
  })
  it('图标 slug 推测', () => {
    expect(iconSlugCandidates('https://www.bilibili.com')[0]).toBe('bilibili')
    expect(iconSlugCandidates('https://music.163.com')).toContain('163')
  })
})
