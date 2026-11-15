import { describe, it, expect } from 'vitest'
import {
  parseFeed,
  parseArticle,
  plainText,
  canonicalUrl,
  feedConfig,
  feedPeriod,
  subscriptionUrl,
  parseHot,
  HOT_REQUESTS,
  parseSearchHtml,
  parseSearchJson,
  mergeSearchResults,
  searchApiUrl,
  loadSettings,
  canHoverRead,
} from '../src'

const fixtures: Record<string, unknown> = {
  zhihu: {
    data: [
      {
        target: { title: '题目', url: 'https://api.zhihu.com/questions/1', excerpt: '内容' },
        detail_text: '1 万热度',
      },
    ],
  },
  weibo: {
    data: {
      realtime: [
        { word: '新闻', num: 10 },
        { word: '广告', is_ad: 1 },
      ],
    },
  },
  bilibili: { data: { list: [{ title: '视频', bvid: 'BV1', stat: { view: 42 } }] } },
  v2ex: [{ title: '话题', url: 'https://v2ex.com/t/1', replies: 2 }],
  hackernews: { hits: [{ title: 'Story', objectID: '1', points: 5 }] },
  github:
    '<article class="Box-row"><h2><a href="/vuejs/core"> vuejs / core </a></h2><p>Vue</p></article>',
  sspai: { data: [{ title: '文章', id: 1, summary: '摘要' }] },
  ithome: '<a href="https://www.ithome.com/0/123/456.htm">科技新闻</a>',
  juejin: {
    data: [
      { item_info: { article_info: { title: '开发', article_id: '1', brief_content: '文章' } } },
    ],
  },
  '36kr': { data: { hotRankList: [{ itemId: 1, templateMaterial: { widgetTitle: '科技' } }] } },
  baidu:
    '<a href="https://www.baidu.com/s?wd=news"><div class="c-single-text-ellipsis">新闻</div></a>',
  douyin: { data: { word_list: [{ word: '话题', hot_value: 123 }] } },
}
describe('M4 信息流和搜索', () => {
  it('reader preserves ordered text, lazy images, video, audio and captions without active markup', () => {
    const a = parseArticle(
      '<article><p>Before <b>image</b><img data-src="/photo.jpg" src="data:image/gif;base64,x" alt="Photo">after image</p><figure><video poster="/poster.jpg"><source src="/movie.webm"></video><figcaption>Caption</figcaption></figure><audio src="/sound.mp3"></audio><picture><source srcset="/responsive.webp 2x"><img></picture><iframe title="Embedded player" src="https://video.example/player"></iframe><p>End</p></article>',
      'https://example.com/post',
    )
    expect(a.paragraphs).toEqual(['Before image', 'after image', 'Caption', 'End'])
    expect(a.blocks).toEqual([
      { type: 'text', text: 'Before image' },
      { type: 'image', url: 'https://example.com/photo.jpg', alt: 'Photo' },
      { type: 'text', text: 'after image' },
      {
        type: 'video',
        url: 'https://example.com/movie.webm',
        poster: 'https://example.com/poster.jpg',
        label: 'video',
      },
      { type: 'text', text: 'Caption' },
      { type: 'audio', url: 'https://example.com/sound.mp3', label: 'audio' },
      { type: 'image', url: 'https://example.com/responsive.webp', alt: '' },
      { type: 'unavailable', label: 'Embedded player', url: 'https://video.example/player' },
      { type: 'text', text: 'End' },
    ])
  })
  it('reader rejects unsafe media URLs and limits large mixed documents', () => {
    const a = parseArticle(
      '<article><img src="javascript:alert(1)" alt="bad"><video src="https://user:password@example.com/v"></video><audio src="blob:x"></audio><object data="javascript:bad()"></object></article>',
      'https://example.com',
    )
    expect(a.blocks).toHaveLength(4)
    expect(a.blocks!.every((b) => b.type === 'unavailable' && !b.url)).toBe(true)
    expect(
      parseArticle(
        '<article>' + '<p>Text</p><img src="/x">'.repeat(200) + '</article>',
        'https://example.com',
      ).blocks!.length,
    ).toBeLessThanOrEqual(160)
  })
  it('component source choices survive config normalization independently across modes', () => {
    const raw = {
      sources: ['v2ex', 'hackernews'],
      selectedSource: 'hackernews',
      selectedSubscription: 'b',
      subscriptions: [
        { id: 'a', title: 'A', url: 'https://example.com/a' },
        { id: 'b', title: 'B', url: 'https://example.com/b' },
      ],
      hoverPreview: false,
    }
    const hot = feedConfig(raw),
      rss = feedConfig({ ...hot, mode: 'rss' })
    expect(hot.selectedSource).toBe('hackernews')
    expect(rss.selectedSource).toBe('hackernews')
    expect(rss.selectedSubscription).toBe('b')
    expect(rss.hoverPreview).toBe(false)
    expect(feedConfig({ ...rss, sources: ['v2ex'], subscriptions: [] }).selectedSource).toBe('v2ex')
    expect(feedConfig({ ...rss, subscriptions: [] }).selectedSubscription).toBe('')
    expect(feedConfig().hoverPreview).toBe(true)
  })
  it('hover supports article destinations and excludes video platforms in RSS and favorites too', () => {
    for (const url of [
      'https://bilibili.com/video/BV1',
      'https://b23.tv/x',
      'https://www.douyin.com/video/1',
      'https://youtu.be/x',
      'https://m.youtube.com/watch?v=x',
      'https://v.qq.com/x',
      'https://example.com/video.mp4',
      'javascript:bad()',
      'https://github.com/vuejs/core',
      'https://www.baidu.com/s?wd=x',
    ])
      expect(canHoverRead({ url })).toBe(false)
    for (const url of [
      'https://example.com/article',
      'https://v2ex.com/t/1',
      'https://news.ycombinator.com/item?id=1',
      'https://news.qq.com/rain/a/test',
    ])
      expect(canHoverRead({ url })).toBe(true)
  })
  for (const source of Object.keys(HOT_REQUESTS))
    it(`${source} adapter parses a source fixture`, () => {
      const r = parseHot(source, fixtures[source])
      expect(r.items).toHaveLength(1)
      expect(r.items[0]!.url).toMatch(/^https:\/\//)
    })
  it('RSS/Atom preserve text, resolve links, deduplicate and reject active URLs/DTD', () => {
    const rss = parseFeed(
      '<rss><channel><title>Example</title><item><title><![CDATA[<b>Hello</b>]]></title><link>/post</link><description><![CDATA[<script>bad()</script>safe<img src=x onerror=bad()>]]></description></item><item><title>Duplicate</title><link>/post?utm_source=x</link></item><item><title>Bad</title><link>javascript:bad()</link></item></channel></rss>',
      'https://example.com/feed',
    )
    expect(rss.items).toHaveLength(1)
    expect(rss.items[0]).toMatchObject({
      title: 'Hello',
      url: 'https://example.com/post',
      description: 'safe',
    })
    const atom = parseFeed(
      '<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><title>Post</title><link rel="self" href="/api"/><link rel="alternate" href="/post"/><updated>2026-11-15T00:00:00Z</updated></entry></feed>',
      'https://example.com/',
    )
    expect(atom.items[0]!.url).toBe('https://example.com/post')
    expect(atom.items[0]!.published).toBe('2026-11-15T00:00:00.000Z')
    expect(() =>
      parseFeed(
        '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>',
        'https://example.com',
      ),
    ).toThrow()
  })
  it('extracts plain article blocks and removes navigation, scripts, styles and embedded markup', () => {
    const a = parseArticle(
      '<title>Example</title><body><nav>Menu</nav><article><h2>Heading</h2><p>Content <b>bold</b></p><script>alert(1)</script><iframe src="https://bad.test">bad</iframe></article></body>',
      'https://example.com',
    )
    expect(a.paragraphs).toEqual(['Heading', 'Content bold'])
    expect(plainText('<style>bad</style>Good &amp; safe')).toBe('Good & safe')
  })
  it('daily schedule crosses midnight and DST using local calendar dates', () => {
    const now = new Date(2026, 10, 15, 7, 59),
      period = feedPeriod(now, '08:00')
    expect(new Date(period).getDate()).toBe(14)
    expect(new Date(feedPeriod(new Date(2026, 10, 15, 8, 0), '08:00')).getDate()).toBe(15)
  })
  it('config migration uses defaults and accepts explicit empty sources', () => {
    expect(
      loadSettings({ schema: 1, search: { openIn: 'current' } }).search.aggregate.enabled,
    ).toBe(false)
    expect(feedConfig({ sources: [], refreshTime: '99:99', privateKey: 'never' }).sources).toEqual(
      [],
    )
    expect(feedConfig({ refreshTime: '99:99' }).refreshTime).toBe('08:00')
    expect(
      subscriptionUrl(
        { id: '1', title: 'RSS', url: '/github/issue/vuejs/core', rsshub: true },
        'https://rsshub.app',
      ),
    ).toBe('https://rsshub.app/github/issue/vuejs/core')
  })
  for (const [engine, html] of [
    [
      'google',
      '<div><a href="/url?q=https%3A%2F%2Fexample.com%2Fp"><h3>Google result</h3></a><p>Description</p></div>',
    ],
    [
      'bing',
      '<li class="b_algo"><h2><a href="https://example.com/p">Bing result</a></h2><p>Description</p></li>',
    ],
    [
      'baidu',
      '<div class="result c-container"><h3><a href="https://example.com/p">Baidu result</a></h3><p>Description</p></div>',
    ],
    [
      'duckduckgo',
      '<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fp">DDG result</a></div>',
    ],
  ])
    it(`${engine} parses inert HTML and unwraps outbound links`, () => {
      expect(parseSearchHtml(engine!, html!, 0).items[0]!.url).toBe('https://example.com/p')
    })
  it('blocked general HTML is a failure, never a fabricated empty success', () =>
    expect(() => parseSearchHtml('google', '<h1>CAPTCHA</h1>', 0)).toThrow())
  it('official JSON pagination, backoff and tracking-free deduplication', () => {
    const page = parseSearchJson(
      'npm',
      {
        objects: [
          {
            package: {
              name: 'test',
              links: { npm: 'https://npmjs.com/package/test' },
              description: '<b>Safe</b>',
            },
          },
        ],
        total: 21,
      },
      0,
    )
    expect(page.next).toBe(1)
    expect(page.items[0]!.description).toBe('Safe')
    expect(
      parseSearchJson('stackoverflow', { items: [], has_more: false, backoff: 60 }, 0).backoff,
    ).toBe(60)
    const result = mergeSearchResults([
      {
        title: 'A',
        url: 'https://example.com/p?utm_source=google',
        description: 'a',
        engines: ['google'],
      },
      { title: 'B', url: 'https://example.com/p#section', description: 'b', engines: ['bing'] },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.engines).toEqual(['google', 'bing'])
    expect(canonicalUrl('javascript:bad()')).toBe('')
    expect(searchApiUrl('unknown', 'test')).toBe('')
  })
})
