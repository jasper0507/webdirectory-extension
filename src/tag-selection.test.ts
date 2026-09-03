import { describe, expect, it } from 'vitest'
import {
  addTag,
  availableTags,
  createTagSelection,
  removeTag,
  revealChoices,
  withCatalog,
} from './tag-selection.ts'

describe('标签选择', () => {
  it('下拉只列出尚未选中的已有标签，按引用次数降序', () => {
    const selection = createTagSelection({
      selected: ['其他'],
      catalog: [
        { name: '文档', count: 1 },
        { name: '工具', count: 3 },
        { name: '其他', count: 2 },
        { name: '参考', count: 1 },
      ],
      prefill: true,
    })

    expect(availableTags(selection).map(({ name, count }) => [name, count])).toEqual([
      ['工具', 3],
      ['文档', 1],
      ['参考', 1],
    ])
  })

  it('已选标签可点掉，点掉后重新出现在下拉', () => {
    const next = removeTag(
      createTagSelection({
        selected: ['文档', '工具'],
        catalog: [
          { name: '文档', count: 2 },
          { name: '工具', count: 1 },
        ],
      }),
      '文档',
    )
    expect(next.selected).toEqual(['工具'])
    expect(availableTags(next).map((tag) => tag.name)).toEqual(['文档'])
  })

  it('新建一次确认一个名字；规范化后已存在则当作选中已有', () => {
    const catalog = [{ name: '文档', count: 1 }]
    const created = addTag(
      createTagSelection({ selected: ['工具'], catalog }),
      ' 笔记 ',
    )
    expect(created.selected).toEqual(['工具', '笔记'])

    const existing = addTag(created, '  文档  ')
    expect(existing.selected).toEqual(['工具', '笔记', '文档'])
    expect(availableTags(existing)).toEqual([])

    const duplicate = addTag(existing, '笔记')
    expect(duplicate.selected).toEqual(['工具', '笔记', '文档'])
  })

  it('第一次打开下拉会清空未改动的预填', () => {
    const next = revealChoices(
      createTagSelection({
        selected: ['其他'],
        catalog: [
          { name: '其他', count: 2 },
          { name: '文档', count: 1 },
        ],
        prefill: true,
      }),
    )
    expect(next.selected).toEqual([])
    expect(next.prefill).toBe(false)
    expect(availableTags(next).map((tag) => tag.name)).toEqual(['其他', '文档'])
    expect(addTag(next, '文档').selected).toEqual(['文档'])
  })

  it('点掉预填或打开下拉都会清空整组预填', () => {
    const prefilled = createTagSelection({
      selected: ['其他', '阅读'],
      catalog: [
        { name: '其他', count: 1 },
        { name: '阅读', count: 1 },
        { name: '文档', count: 2 },
      ],
      prefill: true,
    })
    expect(removeTag(prefilled, '其他').selected).toEqual([])
    expect(revealChoices(prefilled).selected).toEqual([])
  })

  it('未改动预填时加入标签会先清空再加入', () => {
    const next = addTag(
      createTagSelection({
        selected: ['其他'],
        catalog: [{ name: '文档', count: 1 }],
        prefill: true,
      }),
      '文档',
    )
    expect(next.selected).toEqual(['文档'])
  })

  it('改写不套默认标签，打开下拉或点掉只动这一次选择', () => {
    const bound = createTagSelection({
      selected: ['文档', '工具'],
      catalog: [
        { name: '文档', count: 2 },
        { name: '工具', count: 1 },
        { name: '参考', count: 1 },
      ],
    })
    expect(revealChoices(bound).selected).toEqual(['文档', '工具'])
    expect(removeTag(bound, '文档').selected).toEqual(['工具'])
    expect(addTag(bound, '参考').selected).toEqual(['文档', '工具', '参考'])
  })

  it('开始选择之后再点掉只去掉那一个', () => {
    const viewed = revealChoices(
      createTagSelection({
        selected: ['其他'],
        catalog: [
          { name: '其他', count: 1 },
          { name: '文档', count: 1 },
        ],
        prefill: true,
      }),
    )
    const next = removeTag(addTag(addTag(viewed, '其他'), '文档'), '其他')
    expect(next.selected).toEqual(['文档'])
  })

  it('初始已选会规范化并去重', () => {
    const selection = createTagSelection({
      selected: ['  文档  ', '文档', '  ', '工具'],
      catalog: [{ name: '文档', count: 1 }],
      prefill: true,
    })
    expect(selection.selected).toEqual(['文档', '工具'])
  })

  it('目录标签后到时不改已选，打开下拉才清空预填', () => {
    const next = withCatalog(
      createTagSelection({ selected: ['其他'], catalog: [], prefill: true }),
      [
        { name: '其他', count: 2 },
        { name: '文档', count: 1 },
      ],
    )
    expect(next.selected).toEqual(['其他'])
    expect(availableTags(next).map((tag) => tag.name)).toEqual(['文档'])
    expect(revealChoices(next).selected).toEqual([])
  })

  it('空白名字不能加入', () => {
    const selection = createTagSelection({
      selected: ['其他'],
      catalog: [],
      prefill: true,
    })
    expect(addTag(selection, '  ').selected).toEqual(['其他'])
  })
})
