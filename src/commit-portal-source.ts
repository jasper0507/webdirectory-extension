import {
  prepareCapture,
  prepareDelete,
  prepareUpdate,
  type BookmarkDraft,
} from './capture.ts'
import {
  parsePortalSource,
  type Catalog,
  type PortalSourceIssue,
} from './catalog.ts'
import {
  PORTAL_SOURCE_PATH,
  describeContentsFailure,
  type ContentsGateway,
  type ContentsGetResult,
  type ContentsReader,
  type GatewayFailureReason,
  type PortalRepo,
} from './github-contents.ts'

export type { PortalRepo }

export type PortalSourceIntent =
  | { kind: 'capture'; draft: BookmarkDraft }
  | { kind: 'update'; boundUrl: string; draft: BookmarkDraft }
  | { kind: 'delete'; boundUrl: string }

export type PortalFailureKind = 'settings' | 'title' | 'url' | 'tags' | 'source' | 'retry'

export type PortalFailure = {
  ok: false
  kind: PortalFailureKind
  error: string
}

export type CommitResult = { ok: true; url: string } | PortalFailure

export type ReadPortalSourceResult =
  | { ok: true; catalog: Catalog }
  | PortalFailure

function portalFailure(kind: PortalFailureKind, error: string): PortalFailure {
  return { ok: false, kind, error }
}

function contentsFailure(reason: GatewayFailureReason | 'conflict', fallback: string): PortalFailure {
  const kind = reason === 'unauthorized' || reason === 'not-found' ? 'settings' : 'retry'
  return portalFailure(kind, describeContentsFailure(reason, fallback))
}

function formatCandidateError(issues: PortalSourceIssue[]): PortalFailure {
  const first = issues[0]
  if (!first) return portalFailure('source', '门户源无效，未写入')
  if (first.code === 'duplicate-url') return portalFailure('url', '地址与其它书签重复')
  if (first.code === 'duplicate-title') return portalFailure('title', '标题与其它书签重复')
  if (first.code === 'invalid-value' && first.path.endsWith('/tags')) {
    return portalFailure('tags', '必须至少有一个标签')
  }
  if (first.code === 'invalid-value' && first.path.endsWith('/url')) {
    return portalFailure('url', '必须是 http(s) 地址')
  }
  return portalFailure('retry', first.message.replace(/。$/, ''))
}

function pathParams(repo: PortalRepo) {
  return {
    owner: repo.owner,
    repo: repo.repo,
    path: PORTAL_SOURCE_PATH,
    credential: repo.credential,
  }
}

export async function readPortalSource(
  gateway: ContentsReader,
  repo: PortalRepo,
): Promise<ReadPortalSourceResult> {
  const file = await gateway.get(pathParams(repo))
  if (!file.ok) {
    return contentsFailure(file.reason, '无法读取门户源')
  }
  const parsed = parsePortalSource(file.text)
  if (!parsed.ok) return portalFailure('source', '门户源无效')
  return { ok: true, catalog: parsed.catalog }
}

function prepareIntent(text: string, intent: PortalSourceIntent) {
  switch (intent.kind) {
    case 'capture':
      return prepareCapture(text, [intent.draft])
    case 'update':
      return prepareUpdate(text, intent.boundUrl, intent.draft)
    case 'delete':
      return prepareDelete(text, intent.boundUrl)
  }
}

function commitMessage(kind: PortalSourceIntent['kind'], title: string): string {
  switch (kind) {
    case 'capture':
      return `收录: ${title}`
    case 'update':
      return `改写: ${title}`
    case 'delete':
      return `删除: ${title}`
  }
}

async function applyIntent(
  gateway: ContentsGateway,
  repo: PortalRepo,
  intent: PortalSourceIntent,
  file: Extract<ContentsGetResult, { ok: true }>,
): Promise<CommitResult | 'conflict'> {
  const current = parsePortalSource(file.text)
  if (!current.ok) {
    return portalFailure('source', '门户源无效，未写入')
  }

  const prepared = prepareIntent(file.text, intent)
  if (!prepared.ok) {
    return formatCandidateError(prepared.issues)
  }

  const affected = prepared.entries[0]
  if (!affected) {
    return portalFailure('source', '门户源无效，未写入')
  }

  const put = await gateway.put({
    ...pathParams(repo),
    sha: file.sha,
    message: commitMessage(intent.kind, affected.title),
    text: prepared.jsonText,
  })
  if (put.ok) return { ok: true, url: affected.url }
  if (put.reason === 'conflict') return 'conflict'
  return contentsFailure(put.reason, '写入失败')
}

export async function commitPortalSource(
  gateway: ContentsGateway,
  repo: PortalRepo,
  intent: PortalSourceIntent,
): Promise<CommitResult> {
  const file = await gateway.get(pathParams(repo))
  if (!file.ok) {
    return contentsFailure(file.reason, '无法读取门户源')
  }

  const first = await applyIntent(gateway, repo, intent, file)
  if (first !== 'conflict') return first

  const latest = await gateway.get(pathParams(repo))
  if (!latest.ok) {
    return contentsFailure(latest.reason, '无法读取门户源')
  }

  const second = await applyIntent(gateway, repo, intent, latest)
  if (second === 'conflict') {
    return contentsFailure('conflict', '与其它写入冲突，未覆盖')
  }
  return second
}
