/** @vitest-environment jsdom */

import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { samplePortalSource } from './portal-fixture.ts'

const popupHtml = readFileSync(resolve('popup/index.html'), 'utf8')

function chromeMock(openOptionsPage = vi.fn()) {
  return {
    runtime: { openOptionsPage },
    storage: {
      sync: {
        get: vi.fn(async () => ({
          settings: { owner: 'acme', repo: 'portal', defaultTags: '其他' },
        })),
      },
      local: {
        get: vi.fn(async () => ({ credential: 'pat-1' })),
      },
    },
    tabs: {
      query: vi.fn(async () => [
        { id: 1, url: 'https://page.example/', title: '当前页' },
      ]),
    },
    scripting: {
      executeScript: vi.fn(async () => [
        { result: { title: '当前页', description: '页面描述' } },
      ]),
    },
  }
}

async function loadPopup(fetchMock: ReturnType<typeof vi.fn>, chrome = chromeMock()) {
  vi.resetModules()
  document.open()
  document.write(popupHtml)
  document.close()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('chrome', chrome)
  await import('./popup.ts')
  return chrome
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('读取失败可原地重试，并保留当前表单', async () => {
  let status = 500
  const fetchMock = vi.fn(async () => ({
    status,
    json: async () => ({
      sha: 'sha-1',
      content: Buffer.from(samplePortalSource([])).toString('base64'),
    }),
  }))
  await loadPopup(fetchMock)

  const action = document.querySelector<HTMLButtonElement>('#status-action')!
  const title = document.querySelector<HTMLInputElement>('#title')!
  const message = document.querySelector<HTMLElement>('#status-message')!
  await vi.waitFor(() => expect(action.textContent).toBe('重试'))

  title.value = '用户修改的标题'
  status = 200
  action.click()

  await vi.waitFor(() => expect(message.textContent).toBe('门户源已读取'))
  expect(title.value).toBe('用户修改的标题')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it.each([401, 404])('凭证或仓库错误（%s）引导去选项', async (status) => {
  const openOptionsPage = vi.fn()
  await loadPopup(
    vi.fn(async () => ({ status })),
    chromeMock(openOptionsPage),
  )

  const action = document.querySelector<HTMLButtonElement>('#status-action')!
  await vi.waitFor(() => expect(action.textContent).toBe('去选项'))
  action.click()
  expect(openOptionsPage).toHaveBeenCalledOnce()
})
