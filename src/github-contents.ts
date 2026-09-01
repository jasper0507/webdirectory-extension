export const PORTAL_SOURCE_PATH = 'public/portal.json'

export type PortalSourceProbe =
  | { ok: true; sha: string }
  | { ok: false; reason: 'unauthorized' | 'not-found' | 'network' | 'failed' }

export type ContentsGateway = {
  get(params: {
    owner: string
    repo: string
    path: string
    credential: string
  }): Promise<PortalSourceProbe>
}

export function createGithubContentsGateway(
  fetchImpl: typeof fetch,
): ContentsGateway {
  return {
    async get({ owner, repo, path, credential }) {
      try {
        const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`
        const response = await fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${credential}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        })
        if (response.status === 200) {
          const body = (await response.json()) as { sha?: unknown }
          if (typeof body.sha !== 'string' || body.sha.length === 0) {
            return { ok: false, reason: 'failed' }
          }
          return { ok: true, sha: body.sha }
        }
        if (response.status === 401 || response.status === 403) {
          return { ok: false, reason: 'unauthorized' }
        }
        if (response.status === 404) {
          return { ok: false, reason: 'not-found' }
        }
        return { ok: false, reason: 'failed' }
      } catch {
        return { ok: false, reason: 'network' }
      }
    },
  }
}

export function probePortalSource(
  gateway: ContentsGateway,
  config: { owner: string; repo: string; credential: string },
): Promise<PortalSourceProbe> {
  return gateway.get({
    owner: config.owner,
    repo: config.repo,
    path: PORTAL_SOURCE_PATH,
    credential: config.credential,
  })
}
