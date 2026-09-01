import { describe, expect, it } from 'vitest'
import { createChromeConfigurationStore, type StorageArea } from './chrome-store.ts'

function memoryArea(): StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {}
  return {
    data,
    async get(keys) {
      if (keys == null) {
        return { ...data }
      }
      const list = Array.isArray(keys) ? keys : [keys]
      const out: Record<string, unknown> = {}
      for (const key of list) {
        if (key in data) {
          out[key] = data[key]
        }
      }
      return out
    },
    async set(items) {
      Object.assign(data, items)
    },
  }
}

describe('配置存储', () => {
  it('凭证只写入 local，不写入 sync', async () => {
    const local = memoryArea()
    const sync = memoryArea()
    const store = createChromeConfigurationStore({ local, sync })
    await store.save({
      owner: 'acme',
      repo: 'webdirectory',
      credential: 'pat-secret',
      defaultTags: '其他',
    })
    expect(JSON.stringify(sync.data)).not.toContain('pat-secret')
    expect(JSON.stringify(local.data)).toContain('pat-secret')
    expect(JSON.stringify(local.data)).not.toContain('acme')
  })

  it('未保存过时读出厂默认标签「其他」', async () => {
    const store = createChromeConfigurationStore({
      local: memoryArea(),
      sync: memoryArea(),
    })
    await expect(store.load()).resolves.toEqual({
      owner: '',
      repo: '',
      credential: '',
      defaultTags: '其他',
    })
  })

  it('读回时合并 sync 目标仓与 local 凭证', async () => {
    const local = memoryArea()
    const sync = memoryArea()
    const store = createChromeConfigurationStore({ local, sync })
    await store.save({
      owner: 'acme',
      repo: 'webdirectory',
      credential: 'pat-secret',
      defaultTags: '',
    })
    await expect(store.load()).resolves.toEqual({
      owner: 'acme',
      repo: 'webdirectory',
      credential: 'pat-secret',
      defaultTags: '',
    })
  })
})
