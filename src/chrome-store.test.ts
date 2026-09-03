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
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]
    },
  }
}

describe('配置存储', () => {
  it('完整配置一次写入 local', async () => {
    const local = memoryArea()
    const store = createChromeConfigurationStore(local)
    await store.save({
      owner: 'acme',
      repo: 'webdirectory',
      credential: 'pat-secret',
      defaultTags: '其他',
    })
    expect(local.data).toEqual({
      settings: {
        owner: 'acme',
        repo: 'webdirectory',
        credential: 'pat-secret',
        defaultTags: '其他',
      },
    })
  })

  it('未保存过时读出厂默认标签「其他」', async () => {
    const store = createChromeConfigurationStore(memoryArea())
    await expect(store.load()).resolves.toEqual({
      owner: '',
      repo: '',
      credential: '',
      defaultTags: '其他',
    })
  })

  it('从 local 读回完整配置', async () => {
    const local = memoryArea()
    const store = createChromeConfigurationStore(local)
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

  it('把旧 sync 目标与 local 凭证迁移为一份 local 配置', async () => {
    const local = memoryArea()
    const sync = memoryArea()
    local.data.credential = 'pat-secret'
    sync.data.settings = {
      owner: 'acme',
      repo: 'webdirectory',
      defaultTags: '其他',
    }

    const store = createChromeConfigurationStore(local, sync)

    await expect(store.load()).resolves.toEqual({
      owner: 'acme',
      repo: 'webdirectory',
      credential: 'pat-secret',
      defaultTags: '其他',
    })
    expect(local.data).toEqual({
      settings: {
        owner: 'acme',
        repo: 'webdirectory',
        credential: 'pat-secret',
        defaultTags: '其他',
      },
    })
  })
})
