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

describe('门户源连通', () => {
  it('路径固定为 public/portal.json', () => {
    expect(PORTAL_SOURCE_PATH).toBe('public/portal.json')
  })

  it('GET 门户源成功则返回 sha', async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(String(input)).toBe(
        'https://api.github.com/repos/acme/webdirectory/contents/public/portal.json',
      )
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer pat-1')
      expect(headers.get('Accept')).toBe('application/vnd.github+json')
      return jsonResponse(200, { sha: 'abc123', content: 'e30=', encoding: 'base64' })
    }
    const gateway = createGithubContentsGateway(fetchImpl)
    await expect(
      probePortalSource(gateway, {
        owner: 'acme',
        repo: 'webdirectory',
        credential: 'pat-1',
      }),
    ).resolves.toEqual({ ok: true, sha: 'abc123' })
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
