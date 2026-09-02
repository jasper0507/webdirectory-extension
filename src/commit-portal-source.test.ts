import { describe, expect, it } from 'vitest'
import { parsePortalSource } from './catalog.ts'
import { commitPortalSource, readPortalSource } from './commit-portal-source.ts'
import {
  PORTAL_SOURCE_PATH,
  type ContentsGateway,
  type ContentsGetResult,
  type ContentsPutResult,
} from './github-contents.ts'
import {
  sampleIdentity as identity,
  samplePortalSource as portalSource,
} from './portal-fixture.ts'

const repo = {
  owner: 'acme',
  repo: 'webdirectory',
  credential: 'pat-1',
}

type PutCall = {
  owner: string
  repo: string
  path: string
  credential: string
  sha: string
  message: string
  text: string
}

function fakeGithub(options: {
  get: () => ContentsGetResult | Promise<ContentsGetResult>
  put?: (call: PutCall) => ContentsPutResult | Promise<ContentsPutResult>
}): ContentsGateway & { puts: PutCall[] } {
  const puts: PutCall[] = []
  return {
    puts,
    async get(params) {
      expect(params.path).toBe(PORTAL_SOURCE_PATH)
      expect(params.owner).toBe(repo.owner)
      expect(params.repo).toBe(repo.repo)
      expect(params.credential).toBe(repo.credential)
      return options.get()
    },
    async put(params) {
      puts.push(params)
      if (!options.put) {
        throw new Error('unexpected PUT')
      }
      return options.put(params)
    },
  }
}

describe('门户源提交', () => {
  it('无绑定条目时收录追加在末尾，不改站点身份', async () => {
    const current = portalSource([
      { title: '已有', url: 'https://old.example/', tags: ['工具'] },
    ])
    const gateway = fakeGithub({
      get: () => ({ ok: true, sha: 'sha-1', text: current }),
      put: () => ({ ok: true, sha: 'sha-2' }),
    })

    const result = await commitPortalSource(gateway, repo, {
      kind: 'capture',
      draft: {
        title: ' 新增 ',
        url: 'HTTPS://NEW.EXAMPLE/#top',
        tags: ['文档'],
        description: '说明',
      },
    })

    expect(result).toEqual({ ok: true, url: 'https://new.example/' })
    expect(gateway.puts).toHaveLength(1)
    const written = gateway.puts[0]
    expect(written?.sha).toBe('sha-1')
    expect(written?.message).toBe('收录: 新增')
    expect(written?.path).toBe(PORTAL_SOURCE_PATH)
    const body = JSON.parse(written?.text ?? '') as {
      identity: unknown
      bookmarks: Array<{ title: string; url: string; tags: string[]; description?: string }>
    }
    expect(body.identity).toEqual(identity)
    expect(body.bookmarks).toEqual([
      { title: '已有', url: 'https://old.example/', tags: ['工具'] },
      {
        title: '新增',
        url: 'https://new.example/',
        tags: ['文档'],
        description: '说明',
      },
    ])
    expect(parsePortalSource(written?.text ?? '').ok).toBe(true)
  })

  it('当前门户源非法则不 PUT', async () => {
    const gateway = fakeGithub({
      get: () => ({ ok: true, sha: 'sha-1', text: '{' }),
    })
    const result = await commitPortalSource(gateway, repo, {
      kind: 'capture',
      draft: { title: '新增', url: 'https://new.example/', tags: ['文档'] },
    })
    expect(result).toEqual({ ok: false, error: '门户源无效，未写入' })
    expect(gateway.puts).toHaveLength(0)
  })

  it('候选全文无法通过规则则不 PUT', async () => {
    const current = portalSource([
      { title: '已有', url: 'https://old.example/', tags: ['工具'] },
    ])
    const gateway = fakeGithub({
      get: () => ({ ok: true, sha: 'sha-1', text: current }),
    })
    const duplicate = await commitPortalSource(gateway, repo, {
      kind: 'capture',
      draft: { title: '新名字', url: 'https://old.example/#hash', tags: ['文档'] },
    })
    expect(duplicate).toEqual({ ok: false, error: '地址与其它书签重复' })
    expect(gateway.puts).toHaveLength(0)

    const duplicateTitle = await commitPortalSource(gateway, repo, {
      kind: 'capture',
      draft: { title: '已有', url: 'https://new.example/', tags: ['文档'] },
    })
    expect(duplicateTitle).toEqual({ ok: false, error: '标题与其它书签重复' })
    expect(gateway.puts).toHaveLength(0)

    const untitled = await commitPortalSource(gateway, repo, {
      kind: 'capture',
      draft: { title: '另一条', url: 'https://new.example/', tags: [] },
    })
    expect(untitled).toEqual({ ok: false, error: '必须至少有一个标签' })
    expect(gateway.puts).toHaveLength(0)
  })

  it('sha 冲突时用最新门户源再应用一次意图，只重试一次', async () => {
    const original = portalSource([
      { title: '已有', url: 'https://old.example/', tags: ['工具'] },
    ])
    const concurrent = portalSource([
      { title: '已有', url: 'https://old.example/', tags: ['工具'] },
      { title: '并发', url: 'https://other.example/', tags: ['参考'] },
    ])
    let current = { sha: 'sha-1', text: original }
    const gateway = fakeGithub({
      get: () => ({ ok: true, ...current }),
      put: (call) => {
        if (call.sha === 'sha-1') {
          current = { sha: 'sha-2', text: concurrent }
          return { ok: false, reason: 'conflict' }
        }
        return { ok: true, sha: 'sha-3' }
      },
    })

    const result = await commitPortalSource(gateway, repo, {
      kind: 'capture',
      draft: { title: '新增', url: 'https://new.example/', tags: ['文档'] },
    })

    expect(result).toEqual({ ok: true, url: 'https://new.example/' })
    expect(gateway.puts).toHaveLength(2)
    expect(gateway.puts[0]?.sha).toBe('sha-1')
    expect(gateway.puts[1]?.sha).toBe('sha-2')
    expect(gateway.puts[1]?.message).toBe('收录: 新增')
    const bookmarks = (
      JSON.parse(gateway.puts[1]?.text ?? '') as {
        bookmarks: Array<{ title: string }>
      }
    ).bookmarks.map((entry) => entry.title)
    expect(bookmarks).toEqual(['已有', '并发', '新增'])
    expect(parsePortalSource(gateway.puts[1]?.text ?? '').ok).toBe(true)
  })

  it('两次 sha 冲突则不覆盖', async () => {
    const current = portalSource([
      { title: '已有', url: 'https://old.example/', tags: ['工具'] },
    ])
    let gets = 0
    const gateway = fakeGithub({
      get: () => {
        gets += 1
        return { ok: true, sha: `sha-${String(gets)}`, text: current }
      },
      put: () => ({ ok: false, reason: 'conflict' }),
    })

    const result = await commitPortalSource(gateway, repo, {
      kind: 'capture',
      draft: { title: '新增', url: 'https://new.example/', tags: ['文档'] },
    })

    expect(result).toEqual({ ok: false, error: '与其它写入冲突，未覆盖' })
    expect(gets).toBe(2)
    expect(gateway.puts).toHaveLength(2)
  })

  it('改写绑定槽，保持目录位置且不新增', async () => {
    const current = portalSource([
      { title: '先', url: 'https://first.example/', tags: ['工具'] },
      {
        title: '中',
        url: 'https://mid.example/',
        tags: ['文档'],
        description: '旧说明',
      },
      { title: '后', url: 'https://last.example/', tags: ['参考'] },
    ])
    const gateway = fakeGithub({
      get: () => ({ ok: true, sha: 'sha-1', text: current }),
      put: () => ({ ok: true, sha: 'sha-2' }),
    })

    const result = await commitPortalSource(gateway, repo, {
      kind: 'update',
      boundUrl: 'HTTPS://MID.EXAMPLE/#old',
      draft: {
        title: ' 中间改写 ',
        url: 'https://mid-new.example/',
        tags: ['笔记'],
        description: '新说明',
      },
    })

    expect(result).toEqual({ ok: true, url: 'https://mid-new.example/' })
    expect(gateway.puts).toHaveLength(1)
    const written = gateway.puts[0]
    expect(written?.sha).toBe('sha-1')
    expect(written?.message).toBe('改写: 中间改写')
    const body = JSON.parse(written?.text ?? '') as {
      identity: unknown
      bookmarks: Array<{ title: string; url: string; tags: string[]; description?: string }>
    }
    expect(body.identity).toEqual(identity)
    expect(body.bookmarks).toEqual([
      { title: '先', url: 'https://first.example/', tags: ['工具'] },
      {
        title: '中间改写',
        url: 'https://mid-new.example/',
        tags: ['笔记'],
        description: '新说明',
      },
      { title: '后', url: 'https://last.example/', tags: ['参考'] },
    ])
    expect(parsePortalSource(written?.text ?? '').ok).toBe(true)
  })

  it('改写与其它条目冲突则拒绝，不合并', async () => {
    const current = portalSource([
      { title: '先', url: 'https://first.example/', tags: ['工具'] },
      { title: '中', url: 'https://mid.example/', tags: ['文档'] },
    ])
    const gateway = fakeGithub({
      get: () => ({ ok: true, sha: 'sha-1', text: current }),
    })

    const duplicateTitle = await commitPortalSource(gateway, repo, {
      kind: 'update',
      boundUrl: 'https://mid.example/',
      draft: { title: '先', url: 'https://mid.example/', tags: ['文档'] },
    })
    expect(duplicateTitle).toEqual({ ok: false, error: '标题与其它书签重复' })
    expect(gateway.puts).toHaveLength(0)

    const duplicateUrl = await commitPortalSource(gateway, repo, {
      kind: 'update',
      boundUrl: 'https://mid.example/',
      draft: { title: '中', url: 'https://first.example/#other', tags: ['文档'] },
    })
    expect(duplicateUrl).toEqual({ ok: false, error: '地址与其它书签重复' })
    expect(gateway.puts).toHaveLength(0)
  })

  it('删除绑定槽，不改站点身份，其余条目位置不变', async () => {
    const current = portalSource([
      { title: '先', url: 'https://first.example/', tags: ['工具'] },
      { title: '中', url: 'https://mid.example/', tags: ['文档'], description: '旧说明' },
      { title: '后', url: 'https://last.example/', tags: ['参考'] },
    ])
    const gateway = fakeGithub({
      get: () => ({ ok: true, sha: 'sha-1', text: current }),
      put: () => ({ ok: true, sha: 'sha-2' }),
    })

    const result = await commitPortalSource(gateway, repo, {
      kind: 'delete',
      boundUrl: 'HTTPS://MID.EXAMPLE/#old',
    })

    expect(result).toEqual({ ok: true, url: 'https://mid.example/' })
    expect(gateway.puts).toHaveLength(1)
    const written = gateway.puts[0]
    expect(written?.sha).toBe('sha-1')
    expect(written?.message).toBe('删除: 中')
    const body = JSON.parse(written?.text ?? '') as {
      identity: unknown
      bookmarks: Array<{ title: string; url: string; tags: string[]; description?: string }>
    }
    expect(body.identity).toEqual(identity)
    expect(body.bookmarks).toEqual([
      { title: '先', url: 'https://first.example/', tags: ['工具'] },
      { title: '后', url: 'https://last.example/', tags: ['参考'] },
    ])
    expect(parsePortalSource(written?.text ?? '').ok).toBe(true)
  })

  it('删除后再收录同一条，追加在末尾', async () => {
    let current = {
      sha: 'sha-1',
      text: portalSource([
        { title: '先', url: 'https://first.example/', tags: ['工具'] },
        { title: '中', url: 'https://mid.example/', tags: ['文档'] },
        { title: '后', url: 'https://last.example/', tags: ['参考'] },
      ]),
    }
    const gateway = fakeGithub({
      get: () => ({ ok: true, ...current }),
      put: (call) => {
        current = { sha: `sha-${String(gateway.puts.length + 1)}`, text: call.text }
        return { ok: true, sha: current.sha }
      },
    })

    const deleted = await commitPortalSource(gateway, repo, {
      kind: 'delete',
      boundUrl: 'https://mid.example/',
    })
    expect(deleted).toEqual({ ok: true, url: 'https://mid.example/' })

    const recaptured = await commitPortalSource(gateway, repo, {
      kind: 'capture',
      draft: { title: '中', url: 'https://mid.example/', tags: ['文档'] },
    })
    expect(recaptured).toEqual({ ok: true, url: 'https://mid.example/' })
    expect(gateway.puts).toHaveLength(2)
    expect(gateway.puts[0]?.message).toBe('删除: 中')
    expect(gateway.puts[1]?.message).toBe('收录: 中')
    const body = JSON.parse(gateway.puts[1]?.text ?? '') as {
      identity: unknown
      bookmarks: Array<{ title: string; url: string; tags: string[] }>
    }
    expect(body.identity).toEqual(identity)
    expect(body.bookmarks).toEqual([
      { title: '先', url: 'https://first.example/', tags: ['工具'] },
      { title: '后', url: 'https://last.example/', tags: ['参考'] },
      { title: '中', url: 'https://mid.example/', tags: ['文档'] },
    ])
    expect(parsePortalSource(gateway.puts[1]?.text ?? '').ok).toBe(true)
  })

  it('找不到绑定条目则不 PUT', async () => {
    const current = portalSource([
      { title: '已有', url: 'https://old.example/', tags: ['工具'] },
    ])
    const gateway = fakeGithub({
      get: () => ({ ok: true, sha: 'sha-1', text: current }),
    })

    const deleted = await commitPortalSource(gateway, repo, {
      kind: 'delete',
      boundUrl: 'https://missing.example/',
    })
    expect(deleted).toEqual({ ok: false, error: '找不到要删除的书签' })

    const updated = await commitPortalSource(gateway, repo, {
      kind: 'update',
      boundUrl: 'https://missing.example/',
      draft: { title: '新', url: 'https://new.example/', tags: ['文档'] },
    })
    expect(updated).toEqual({ ok: false, error: '找不到要改写的书签' })
    expect(gateway.puts).toHaveLength(0)
  })
})

describe('读取门户源', () => {
  it('合法全文返回目录且不 PUT', async () => {
    const current = portalSource([
      { title: '已有', url: 'https://old.example/', tags: ['工具'] },
    ])
    const gateway = fakeGithub({
      get: () => ({ ok: true, sha: 'sha-1', text: current }),
    })
    const result = await readPortalSource(gateway, repo)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalog.entries).toHaveLength(1)
    expect(result.catalog.identity.wordmark).toBe('试厅')
    expect(gateway.puts).toHaveLength(0)
  })

  it('非法全文不返回目录', async () => {
    const gateway = fakeGithub({
      get: () => ({ ok: true, sha: 'sha-1', text: '{' }),
    })
    await expect(readPortalSource(gateway, repo)).resolves.toEqual({
      ok: false,
      error: '门户源无效',
    })
    expect(gateway.puts).toHaveLength(0)
  })
})
