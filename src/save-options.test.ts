import { describe, expect, it } from 'vitest'
import { emptyConfiguration, type Configuration } from './configuration.ts'
import type { ContentsGateway } from './github-contents.ts'
import { saveOptions, type ConfigurationStore } from './save-options.ts'

function memoryStore(initial?: Configuration): ConfigurationStore & {
  snapshot(): Configuration | undefined
} {
  let saved = initial
  return {
    async load() {
      return saved ?? emptyConfiguration()
    },
    async save(config) {
      saved = { ...config }
    },
    snapshot() {
      return saved
    },
  }
}

const draft: Configuration = {
  owner: ' acme ',
  repo: ' webdirectory ',
  credential: ' pat-1 ',
  defaultTags: '其他',
}

function unusedPut(): ContentsGateway['put'] {
  return async () => {
    throw new Error('options save must not PUT')
  }
}

function okGateway(): ContentsGateway {
  return {
    async get() {
      return { ok: true, sha: 'sha', text: '{}' }
    },
    put: unusedPut(),
  }
}

describe('保存选项', () => {
  it('缺 owner、仓库或凭证时不探测、不写入', async () => {
    const store = memoryStore()
    let probed = false
    const gateway: ContentsGateway = {
      async get() {
        probed = true
        return { ok: true, sha: 'sha', text: '{}' }
      },
      put: unusedPut(),
    }
    const result = await saveOptions(store, gateway, emptyConfiguration())
    expect(result).toEqual({ ok: false, error: '请填写所有者、仓库和凭证' })
    expect(probed).toBe(false)
    expect(store.snapshot()).toBeUndefined()
  })

  it('连通失败不写入配置', async () => {
    const previous: Configuration = {
      owner: 'old',
      repo: 'old-repo',
      credential: 'old-pat',
      defaultTags: '其他',
    }
    const store = memoryStore(previous)
    const gateway: ContentsGateway = {
      async get() {
        return { ok: false, reason: 'unauthorized' }
      },
      put: unusedPut(),
    }
    const result = await saveOptions(store, gateway, draft)
    expect(result).toEqual({ ok: false, error: '凭证无效或没有仓库权限' })
    expect(store.snapshot()).toEqual(previous)
  })

  it('找不到门户源时给出短错误且不保存', async () => {
    const store = memoryStore()
    const gateway: ContentsGateway = {
      async get() {
        return { ok: false, reason: 'not-found' }
      },
      put: unusedPut(),
    }
    const result = await saveOptions(store, gateway, draft)
    expect(result).toEqual({ ok: false, error: '找不到仓库或门户源' })
    expect(store.snapshot()).toBeUndefined()
  })

  it('连通成功后写入去空白的配置', async () => {
    const store = memoryStore()
    const result = await saveOptions(store, okGateway(), draft)
    expect(result).toEqual({ ok: true })
    expect(store.snapshot()).toEqual({
      owner: 'acme',
      repo: 'webdirectory',
      credential: 'pat-1',
      defaultTags: '其他',
    })
  })

  it('写入配置抛错时不报成功', async () => {
    const store: ConfigurationStore = {
      async load() {
        return emptyConfiguration()
      },
      async save() {
        throw new Error('quota')
      },
    }
    const result = await saveOptions(store, okGateway(), draft)
    expect(result).toEqual({ ok: false, error: '无法保存配置' })
  })

  it('允许把默认标签存成空字符串', async () => {
    const store = memoryStore()
    const result = await saveOptions(store, okGateway(), {
      ...draft,
      defaultTags: '  ',
    })
    expect(result).toEqual({ ok: true })
    expect(store.snapshot()?.defaultTags).toBe('')
  })
})
