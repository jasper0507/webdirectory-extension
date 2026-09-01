export const PORTAL_SOURCE_PATH = 'public/portal.json'

export type GatewayFailureReason =
  | 'unauthorized'
  | 'not-found'
  | 'network'
  | 'failed'

export type PortalRepo = {
  owner: string
  repo: string
  credential: string
}

export type PortalSourceProbe =
  | { ok: true; sha: string }
  | { ok: false; reason: GatewayFailureReason }

export type ContentsGetResult =
  | { ok: true; sha: string; text: string }
  | { ok: false; reason: GatewayFailureReason }

export type ContentsPutResult =
  | { ok: true; sha: string }
  | { ok: false; reason: GatewayFailureReason | 'conflict' }

export type ContentsPathParams = PortalRepo & { path: string }

export type ContentsGateway = {
  get(params: ContentsPathParams): Promise<ContentsGetResult>
  put(
    params: ContentsPathParams & {
      sha: string
      message: string
      text: string
    },
  ): Promise<ContentsPutResult>
}

export type ContentsReader = Pick<ContentsGateway, 'get'>

export function describeContentsFailure(
  reason: GatewayFailureReason | 'conflict',
  fallback: string,
): string {
  switch (reason) {
    case 'unauthorized':
      return '凭证无效或没有仓库权限'
    case 'not-found':
      return '找不到仓库或门户源'
    case 'network':
      return '无法连接 GitHub'
    case 'conflict':
      return '与其它写入冲突，未覆盖'
    default:
      return fallback
  }
}

function contentsUrl(owner: string, repo: string, path: string): string {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`
}

function githubHeaders(credential: string): Record<string, string> {
  return {
    Authorization: `Bearer ${credential}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToUtf8(content: string): string {
  const binary = atob(content.replace(/\s+/g, ''))
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function httpFailure(status: number): GatewayFailureReason | null {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 404) return 'not-found'
  return null
}

export function createGithubContentsGateway(
  fetchImpl: typeof fetch,
): ContentsGateway {
  return {
    async get({ owner, repo, path, credential }) {
      try {
        const response = await fetchImpl(contentsUrl(owner, repo, path), {
          headers: githubHeaders(credential),
        })
        if (response.status === 200) {
          const body = (await response.json()) as {
            sha?: unknown
            content?: unknown
          }
          if (typeof body.sha !== 'string' || body.sha.length === 0) {
            return { ok: false, reason: 'failed' }
          }
          if (typeof body.content !== 'string') {
            return { ok: false, reason: 'failed' }
          }
          try {
            return {
              ok: true,
              sha: body.sha,
              text: base64ToUtf8(body.content),
            }
          } catch {
            return { ok: false, reason: 'failed' }
          }
        }
        const reason = httpFailure(response.status)
        if (reason) return { ok: false, reason }
        return { ok: false, reason: 'failed' }
      } catch {
        return { ok: false, reason: 'network' }
      }
    },
    async put({ owner, repo, path, credential, sha, message, text }) {
      try {
        const response = await fetchImpl(contentsUrl(owner, repo, path), {
          method: 'PUT',
          headers: {
            ...githubHeaders(credential),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message,
            content: utf8ToBase64(text),
            sha,
          }),
        })
        if (response.status === 200 || response.status === 201) {
          const body = (await response.json()) as {
            content?: { sha?: unknown }
          }
          const nextSha = body.content?.sha
          return {
            ok: true,
            sha: typeof nextSha === 'string' && nextSha.length > 0 ? nextSha : sha,
          }
        }
        if (response.status === 409) {
          return { ok: false, reason: 'conflict' }
        }
        const reason = httpFailure(response.status)
        if (reason) return { ok: false, reason }
        return { ok: false, reason: 'failed' }
      } catch {
        return { ok: false, reason: 'network' }
      }
    },
  }
}

export async function probePortalSource(
  gateway: ContentsReader,
  repo: PortalRepo,
): Promise<PortalSourceProbe> {
  const result = await gateway.get({
    owner: repo.owner,
    repo: repo.repo,
    path: PORTAL_SOURCE_PATH,
    credential: repo.credential,
  })
  if (!result.ok) return result
  return { ok: true, sha: result.sha }
}
