import { prepareCapture, type BookmarkDraft } from './capture.ts'
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
  type PortalRepo,
} from './github-contents.ts'

export type { PortalRepo }

export type PortalSourceIntent = {
  kind: 'capture'
  draft: BookmarkDraft
}

export type CommitResult = { ok: true } | { ok: false; error: string }

export type ReadPortalSourceResult =
  | { ok: true; catalog: Catalog }
  | { ok: false; error: string }

function formatCandidateError(issues: PortalSourceIssue[]): string {
  const first = issues[0]
  if (!first) return '门户源无效，未写入'
  if (first.code === 'duplicate-url') return '地址与其它书签重复'
  if (first.code === 'duplicate-title') return '标题与其它书签重复'
  if (first.code === 'invalid-value' && first.path.endsWith('/tags')) {
    return '必须至少有一个标签'
  }
  if (first.code === 'invalid-value' && first.path.endsWith('/url')) {
    return '必须是 http(s) 地址'
  }
  return first.message.replace(/。$/, '')
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
    return { ok: false, error: describeContentsFailure(file.reason, '无法读取门户源') }
  }
  const parsed = parsePortalSource(file.text)
  if (!parsed.ok) return { ok: false, error: '门户源无效' }
  return { ok: true, catalog: parsed.catalog }
}

async function applyCapture(
  gateway: ContentsGateway,
  repo: PortalRepo,
  intent: PortalSourceIntent,
  file: Extract<ContentsGetResult, { ok: true }>,
): Promise<CommitResult | 'conflict'> {
  const current = parsePortalSource(file.text)
  if (!current.ok) {
    return { ok: false, error: '门户源无效，未写入' }
  }

  const prepared = prepareCapture(file.text, [intent.draft])
  if (!prepared.ok) {
    return { ok: false, error: formatCandidateError(prepared.issues) }
  }

  const title = prepared.entries[0]?.title ?? intent.draft.title
  const put = await gateway.put({
    ...pathParams(repo),
    sha: file.sha,
    message: `收录: ${title}`,
    text: prepared.jsonText,
  })
  if (put.ok) return { ok: true }
  if (put.reason === 'conflict') return 'conflict'
  return {
    ok: false,
    error: describeContentsFailure(put.reason, '写入失败'),
  }
}

export async function commitPortalSource(
  gateway: ContentsGateway,
  repo: PortalRepo,
  intent: PortalSourceIntent,
): Promise<CommitResult> {
  const file = await gateway.get(pathParams(repo))
  if (!file.ok) {
    return { ok: false, error: describeContentsFailure(file.reason, '无法读取门户源') }
  }

  const first = await applyCapture(gateway, repo, intent, file)
  if (first !== 'conflict') return first

  const latest = await gateway.get(pathParams(repo))
  if (!latest.ok) {
    return { ok: false, error: describeContentsFailure(latest.reason, '无法读取门户源') }
  }

  const second = await applyCapture(gateway, repo, intent, latest)
  if (second === 'conflict') {
    return { ok: false, error: describeContentsFailure('conflict', '与其它写入冲突，未覆盖') }
  }
  return second
}
