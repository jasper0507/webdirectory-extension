import { describe, expect, it } from 'vitest'
import {
  createGithubContentsGateway,
  PORTAL_SOURCE_PATH,
  probePortalSource,
} from './github-contents.ts'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const repo = {
  owner: 'acme',
  repo: 'webdirectory',
  credential: 'pat-1',
}

describe('门户源连通', () => {
  it('路径固定为 public/portal.json', () => {
    expect(PORTAL_SOURCE_PATH).toBe('public/portal.json')
  })

  it('GET 门户源成功则返回 sha 与解码后的正文', async () => {
    const text = '{"identity":{"wordmark":"试厅"},"bookmarks":[]}'
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(String(input)).toBe(
        'https://api.github.com/repos/acme/webdirectory/contents/public/portal.json',
      )
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer pat-1')
      expect(headers.get('Accept')).toBe('application/vnd.github+json')
      expect(init?.method ?? 'GET').toBe('GET')
      return jsonResponse(200, {
        sha: 'abc123',
        content: Buffer.from(text, 'utf8').toString('base64'),
        encoding: 'base64',
      })
    }
    const gateway = createGithubContentsGateway(fetchImpl)
    await expect(gateway.get({ ...repo, path: PORTAL_SOURCE_PATH })).resolves.toEqual({
      ok: true,
      sha: 'abc123',
      text,
    })
    await expect(probePortalSource(gateway, repo)).resolves.toEqual({
      ok: true,
      sha: 'abc123',
    })
  })

  it('GET 解码 GitHub 折行的 base64', async () => {
    const text = '{"identity":{"wordmark":"试厅"},"bookmarks":[]}'
    const wrapped = Buffer.from(text, 'utf8')
      .toString('base64')
      .replace(/(.{20})/g, '$1\n')
    expect(wrapped).toContain('\n')
    const gateway = createGithubContentsGateway(async () =>
      jsonResponse(200, {
        sha: 'abc123',
        content: wrapped,
        encoding: 'base64',
      }),
    )
    await expect(gateway.get({ ...repo, path: PORTAL_SOURCE_PATH })).resolves.toEqual({
      ok: true,
      sha: 'abc123',
      text,
    })
  })

  it('401 或 403 视为凭证无效', async () => {
    const gateway = createGithubContentsGateway(async () => jsonResponse(401, {}))
    await expect(
      probePortalSource(gateway, {
        owner: 'acme',
        repo: 'webdirectory',
        credential: 'bad',
      }),
    ).resolves.toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('404 视为找不到仓库或门户源', async () => {
    const gateway = createGithubContentsGateway(async () => jsonResponse(404, {}))
    await expect(
      probePortalSource(gateway, {
        owner: 'missing',
        repo: 'nope',
        credential: 'pat-1',
      }),
    ).resolves.toEqual({ ok: false, reason: 'not-found' })
  })

  it('网络失败视为无法连接', async () => {
    const gateway = createGithubContentsGateway(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(
      probePortalSource(gateway, {
        owner: 'acme',
        repo: 'webdirectory',
        credential: 'pat-1',
      }),
    ).resolves.toEqual({ ok: false, reason: 'network' })
  })
})

describe('门户源写入', () => {
  it('PUT 发送提交说明、sha 与 UTF-8 正文', async () => {
    const text = '{"identity":{"wordmark":"试厅"},"bookmarks":[]}\n'
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(String(input)).toBe(
        'https://api.github.com/repos/acme/webdirectory/contents/public/portal.json',
      )
      expect(init?.method).toBe('PUT')
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer pat-1')
      expect(headers.get('Accept')).toBe('application/vnd.github+json')
      const body = JSON.parse(String(init?.body)) as {
        message: string
        content: string
        sha: string
      }
      expect(body.message).toBe('收录: 试厅')
      expect(body.sha).toBe('abc123')
      expect(Buffer.from(body.content, 'base64').toString('utf8')).toBe(text)
      return jsonResponse(200, { content: { sha: 'def456' } })
    }
    const gateway = createGithubContentsGateway(fetchImpl)
    await expect(
      gateway.put({
        ...repo,
        path: PORTAL_SOURCE_PATH,
        sha: 'abc123',
        message: '收录: 试厅',
        text,
      }),
    ).resolves.toEqual({ ok: true, sha: 'def456' })
  })

  it('PUT 409 视为 sha 冲突', async () => {
    const gateway = createGithubContentsGateway(async () => jsonResponse(409, {}))
    await expect(
      gateway.put({
        ...repo,
        path: PORTAL_SOURCE_PATH,
        sha: 'stale',
        message: '收录: 新增',
        text: '{}',
      }),
    ).resolves.toEqual({ ok: false, reason: 'conflict' })
  })
})
