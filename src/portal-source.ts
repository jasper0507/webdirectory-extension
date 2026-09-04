import {
  findBoundEntry,
  parsePortalSource,
  type BookmarkEntry,
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

type BookmarkDraft = Pick<BookmarkEntry, 'title' | 'url' | 'tags' | 'description'>

export type PortalSourceIntent =
  | { kind: 'capture'; draft: BookmarkDraft }
  | { kind: 'update'; boundUrl: string; draft: BookmarkDraft }
  | { kind: 'delete'; boundUrl: string }

export type PortalFailureKind = 'settings' | 'title' | 'url' | 'tags' | 'source' | 'retry'

type PortalFailure = {
  ok: false
  kind: PortalFailureKind
  error: string
}

export type CommitResult = { ok: true; url: string } | PortalFailure

export type ReadPortalSourceResult =
  | { ok: true; catalog: Catalog }
  | PortalFailure

type PortalDocument = {
  identity: unknown
  bookmarks: unknown[]
}

type Preparation =
  | PortalFailure
  | { ok: true; jsonText: string; entry: BookmarkDraft }

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

function sourceEntry(entry: BookmarkEntry): BookmarkDraft {
  return {
    title: entry.title,
    url: entry.url,
    tags: entry.tags,
    ...(entry.description ? { description: entry.description } : {}),
  }
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

function prepareIntent(text: string, intent: PortalSourceIntent): Preparation {
  const current = parsePortalSource(text)
  if (!current.ok) return portalFailure('source', '门户源无效，未写入')

  const document = JSON.parse(text) as PortalDocument
  const bookmarks = [...document.bookmarks]
  let index: number
  let affected: BookmarkEntry | undefined

  switch (intent.kind) {
    case 'capture': {
      index = bookmarks.length
      bookmarks.push(intent.draft)
      break
    }
    case 'update':
    case 'delete': {
      const bound = findBoundEntry(current.catalog, intent.boundUrl)
      if (!bound) {
        return portalFailure('retry', `找不到要${intent.kind === 'update' ? '改写' : '删除'}的书签`)
      }
      index = current.catalog.entries.indexOf(bound)
      if (intent.kind === 'update') {
        bookmarks[index] = intent.draft
      } else {
        bookmarks.splice(index, 1)
        affected = bound
      }
      break
    }
  }

  const candidate = parsePortalSource(JSON.stringify({ ...document, bookmarks }))
  if (!candidate.ok) return formatCandidateError(candidate.issues)

  affected ??= candidate.catalog.entries[index]
  if (!affected) return portalFailure('source', '门户源无效，未写入')

  const entry = sourceEntry(affected)
  if (intent.kind !== 'delete') bookmarks[index] = entry
  return {
    ok: true,
    entry,
    jsonText: `${JSON.stringify({ ...document, bookmarks }, null, 2)}\n`,
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
  const prepared = prepareIntent(file.text, intent)
  if (!prepared.ok) return prepared

  const put = await gateway.put({
    ...pathParams(repo),
    sha: file.sha,
    message: commitMessage(intent.kind, prepared.entry.title),
    text: prepared.jsonText,
  })
  if (put.ok) return { ok: true, url: prepared.entry.url }
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
