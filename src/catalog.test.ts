import { describe, expect, it } from 'vitest'
import { parsePortalSource, summarizeEntryTags, type BookmarkEntry } from './catalog.ts'
import {
  sampleIdentity as identity,
  samplePortalSource as portalSource,
} from './portal-fixture.ts'

describe('parsePortalSource', () => {
  it('通过 interface 规范化身份和书签', () => {
    const parsed = parsePortalSource(
      portalSource(
        [
          {
            title: '  Cafe\u0301  ',
            url: 'HTTPS://Example.COM:443/path/#section',
            tags: [' 文档 ', '文档'],
            description: '  示例说明  ',
          },
        ],
        { ...identity, wordmark: '  试厅  ' },
      ),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.catalog.identity.wordmark).toBe('试厅')
    expect(parsed.catalog.identity.monument).toEqual(['甲', '乙'])
    expect(parsed.catalog.entries[0]).toEqual({
      title: 'Café',
      url: 'https://example.com/path',
      displayUrl: 'example.com/path',
      tags: ['文档'],
      description: '示例说明',
    })
    expect(parsed.catalog.tags).toEqual([{ name: '文档', count: 1 }])
  })

  it.each([
    ['根数组', JSON.stringify([{ title: '旧', url: 'https://old.example/', tags: ['工具'] }])],
    ['entries', JSON.stringify({ identity, entries: [] })],
    [
      '字符串 tags',
      portalSource([{ title: '旧', url: 'https://old.example/', tags: '工具' }]),
    ],
    [
      'category',
      portalSource([{ title: '旧', url: 'https://old.example/', category: '工具' }]),
    ],
  ])('拒绝旧输入形状：%s', (_name, jsonText) => {
    expect(parsePortalSource(jsonText).ok).toBe(false)
  })

  it('一次返回身份、未知字段和重复条目的全部问题', () => {
    const parsed = parsePortalSource(
      portalSource(
        [
          { title: 'MDN', url: 'https://developer.mozilla.org/', tags: ['文档'] },
          {
            title: ' MDN ',
            url: 'https://developer.mozilla.org:443/#top',
            tags: ['参考'],
            extra: true,
          },
          { title: 'FTP', url: 'ftp://files.example/', tags: ['工具'] },
        ],
        { ...identity, monument: ['AB', '乙'], extra: true },
      ),
    )
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.issues.map(({ path, code }) => ({ path, code }))).toEqual([
      { path: '/identity/extra', code: 'unknown-field' },
      { path: '/identity/monument/0', code: 'invalid-value' },
      { path: '/bookmarks/1/extra', code: 'unknown-field' },
      { path: '/bookmarks/1/title', code: 'duplicate-title' },
      { path: '/bookmarks/1/url', code: 'duplicate-url' },
      { path: '/bookmarks/2/url', code: 'invalid-value' },
    ])
  })

  it('非法 JSON 返回结构化问题', () => {
    expect(parsePortalSource('{').ok).toBe(false)
    const parsed = parsePortalSource('{')
    if (parsed.ok) return
    expect(parsed.issues).toEqual([
      { path: '', code: 'invalid-json', message: '不是合法 JSON。' },
    ])
  })

  it('拒绝空标签', () => {
    const parsed = parsePortalSource(
      portalSource([{ title: '旧', url: 'https://old.example/', tags: [] }]),
    )
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.issues).toContainEqual(
      expect.objectContaining({
        path: '/bookmarks/0/tags',
        code: 'invalid-value',
      }),
    )
  })

  it('拒绝只有空白的标签', () => {
    const parsed = parsePortalSource(
      portalSource([{ title: '旧', url: 'https://old.example/', tags: ['  ', ''] }]),
    )
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.issues).toContainEqual(
      expect.objectContaining({
        path: '/bookmarks/0/tags',
        code: 'invalid-value',
      }),
    )
  })
})

describe('summarizeEntryTags', () => {
  it('按当前条目汇总标签，同一条目同一标签只计一次', () => {
    const entries: BookmarkEntry[] = [
      { title: 'A', url: 'https://a.example/', displayUrl: 'a.example', tags: ['文档', '工具'] },
      { title: 'B', url: 'https://b.example/', displayUrl: 'b.example', tags: ['文档'] },
      { title: 'C', url: 'https://c.example/', displayUrl: 'c.example', tags: ['工具', '工具'] },
    ]
    expect(summarizeEntryTags(entries)).toEqual([
      { name: '文档', count: 2 },
      { name: '工具', count: 2 },
    ])
  })
})
