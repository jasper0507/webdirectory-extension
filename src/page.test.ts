/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { extractPageMetadataFromPage, readCurrentPage } from './page.ts'

describe('当前页', () => {
  it('描述取 meta description，否则 og:description', () => {
    document.title = ''
    document.head.innerHTML = `
      <title> 页标题 </title>
      <meta name="description" content=" 页描述 " />
      <meta property="og:description" content="og" />
    `
    expect(extractPageMetadataFromPage()).toEqual({
      title: '页标题',
      description: '页描述',
    })

    document.title = ''
    document.head.innerHTML = `
      <meta property="og:title" content="og 标题" />
      <meta property="og:description" content="og 描述" />
    `
    expect(extractPageMetadataFromPage()).toEqual({
      title: 'og 标题',
      description: 'og 描述',
    })
  })

  it('从当前标签读取 URL，并从页内读取标题与描述', async () => {
    const page = await readCurrentPage({
      tabs: {
        async query() {
          return [
            {
              id: 7,
              url: 'https://example.com/x',
              title: '标签标题',
              favIconUrl: 'https://example.com/favicon.ico',
            },
          ]
        },
      },
      scripting: {
        async executeScript() {
          return [{ result: { title: '页标题', description: '页描述' } }]
        },
      },
    })
    expect(page).toEqual({
      url: 'https://example.com/x',
      title: '页标题',
      description: '页描述',
      favIconUrl: 'https://example.com/favicon.ico',
    })
  })

  it('页内脚本失败时用标签标题，描述为空', async () => {
    const page = await readCurrentPage({
      tabs: {
        async query() {
          return [{ id: 1, url: 'chrome://newtab/', title: '新标签页' }]
        },
      },
      scripting: {
        async executeScript() {
          throw new Error('Cannot access')
        },
      },
    })
    expect(page).toEqual({
      url: 'chrome://newtab/',
      title: '新标签页',
      description: '',
      favIconUrl: '',
    })
  })

  it('没有当前标签时返回空页', async () => {
    const page = await readCurrentPage({
      tabs: {
        async query() {
          return []
        },
      },
      scripting: {
        async executeScript() {
          throw new Error('unreachable')
        },
      },
    })
    expect(page).toEqual({
      url: '',
      title: '',
      description: '',
      favIconUrl: '',
    })
  })
})
