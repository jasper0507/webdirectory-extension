import { describe, expect, it } from 'vitest'
import { prepareCapture } from './capture.ts'
import { samplePortalSource as portalSource } from './portal-fixture.ts'

describe('prepareCapture', () => {
  it('规范化新条目并按录入顺序追加', () => {
    const prepared = prepareCapture(
      portalSource([{ title: '已有', url: 'https://old.example/', tags: ['工具'] }]),
      [
        { title: ' 新增一 ', url: 'HTTPS://ONE.EXAMPLE:443/#top', tags: [' 文档 ', '文档'] },
        { title: '新增二', url: 'https://two.example/', tags: ['工具'] },
      ],
    )

    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.entries).toEqual([
      { title: '新增一', url: 'https://one.example/', tags: ['文档'] },
      { title: '新增二', url: 'https://two.example/', tags: ['工具'] },
    ])
    expect(JSON.parse(prepared.jsonText).bookmarks.map((entry: { title: string }) => entry.title))
      .toEqual(['已有', '新增一', '新增二'])
    expect(prepared.tags.map(({ name, count }) => [name, count])).toEqual([
      ['工具', 2],
      ['文档', 1],
    ])
  })

  it('拒绝与现有目录或本次收录重复的条目', () => {
    const prepared = prepareCapture(
      portalSource([{ title: '已有', url: 'https://old.example/', tags: ['工具'] }]),
      [
        { title: '新增', url: 'https://new.example/', tags: ['文档'] },
        { title: '另一个', url: 'https://new.example/#top', tags: ['参考'] },
      ],
    )

    expect(prepared.ok).toBe(false)
    if (prepared.ok) return
    expect(prepared.issues).toContainEqual(
      expect.objectContaining({ path: '/bookmarks/2/url', code: 'duplicate-url' }),
    )
  })

  it('拒绝与现有标题重复的条目', () => {
    const prepared = prepareCapture(
      portalSource([{ title: '已有', url: 'https://old.example/', tags: ['工具'] }]),
      [{ title: ' 已有 ', url: 'https://new.example/', tags: ['文档'] }],
    )
    expect(prepared.ok).toBe(false)
    if (prepared.ok) return
    expect(prepared.issues).toContainEqual(
      expect.objectContaining({ path: '/bookmarks/1/title', code: 'duplicate-title' }),
    )
  })

  it('拒绝没有标签的新条目', () => {
    const prepared = prepareCapture(
      portalSource([{ title: '已有', url: 'https://old.example/', tags: ['工具'] }]),
      [{ title: '新增', url: 'https://new.example/', tags: [] }],
    )
    expect(prepared.ok).toBe(false)
    if (prepared.ok) return
    expect(prepared.issues).toContainEqual(
      expect.objectContaining({ path: '/bookmarks/1/tags', code: 'invalid-value' }),
    )
  })
})
