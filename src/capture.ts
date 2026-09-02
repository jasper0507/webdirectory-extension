import {
  findBoundEntry,
  parsePortalSource,
  summarizeEntryTags,
  type BookmarkEntry,
  type Catalog,
  type ParseResult,
  type PortalSourceIssue,
  type TagSummary,
} from './catalog.ts'

export type BookmarkDraft = Pick<BookmarkEntry, 'title' | 'url' | 'tags' | 'description'>

export type CandidatePreparation =
  | { ok: false; issues: PortalSourceIssue[] }
  | {
      ok: true
      jsonText: string
      entries: BookmarkDraft[]
      tags: TagSummary[]
    }

type PortalDocument = {
  identity: unknown
  bookmarks: unknown[]
}

function sourceEntry(entry: BookmarkEntry): BookmarkDraft {
  return {
    title: entry.title,
    url: entry.url,
    tags: entry.tags,
    ...(entry.description ? { description: entry.description } : {}),
  }
}

function boundEntryMissing(action: '改写' | '删除'): {
  ok: false
  issues: PortalSourceIssue[]
} {
  return {
    ok: false,
    issues: [
      {
        path: '/bookmarks',
        code: 'missing-field',
        message: `找不到要${action}的书签。`,
      },
    ],
  }
}

function loadDocument(currentJson: string):
  | { ok: false; issues: PortalSourceIssue[] }
  | { ok: true; catalog: Catalog; document: PortalDocument } {
  const parsed = parsePortalSource(currentJson)
  if (!parsed.ok) return parsed
  return {
    ok: true,
    catalog: parsed.catalog,
    document: JSON.parse(currentJson) as PortalDocument,
  }
}

function loadBoundSlot(
  currentJson: string,
  boundUrl: string,
  action: '改写' | '删除',
):
  | { ok: false; issues: PortalSourceIssue[] }
  | {
      ok: true
      document: PortalDocument
      bound: BookmarkEntry
      index: number
    } {
  const loaded = loadDocument(currentJson)
  if (!loaded.ok) return loaded
  const bound = findBoundEntry(loaded.catalog, boundUrl)
  if (!bound) return boundEntryMissing(action)
  return {
    ok: true,
    document: loaded.document,
    bound,
    index: loaded.catalog.entries.indexOf(bound),
  }
}

function parseCandidate(document: PortalDocument, bookmarks: unknown[]): ParseResult {
  return parsePortalSource(JSON.stringify({ ...document, bookmarks }))
}

function preparedCandidate(
  document: PortalDocument,
  bookmarks: unknown[],
  entries: BookmarkDraft[],
  catalogEntries: BookmarkEntry[],
): CandidatePreparation {
  return {
    ok: true,
    jsonText: `${JSON.stringify({ ...document, bookmarks }, null, 2)}\n`,
    entries,
    tags: summarizeEntryTags(catalogEntries),
  }
}

export function prepareCapture(
  currentJson: string,
  drafts: BookmarkDraft[],
): CandidatePreparation {
  const loaded = loadDocument(currentJson)
  if (!loaded.ok) return loaded

  const candidate = parseCandidate(loaded.document, [...loaded.document.bookmarks, ...drafts])
  if (!candidate.ok) return candidate

  const entries = candidate.catalog.entries.slice(loaded.document.bookmarks.length).map(sourceEntry)
  return preparedCandidate(
    loaded.document,
    [...loaded.document.bookmarks, ...entries],
    entries,
    candidate.catalog.entries,
  )
}

export function prepareUpdate(
  currentJson: string,
  boundUrl: string,
  draft: BookmarkDraft,
): CandidatePreparation {
  const slot = loadBoundSlot(currentJson, boundUrl, '改写')
  if (!slot.ok) return slot

  const candidateBookmarks = [...slot.document.bookmarks]
  candidateBookmarks[slot.index] = draft
  const candidate = parseCandidate(slot.document, candidateBookmarks)
  if (!candidate.ok) return candidate

  const updated = candidate.catalog.entries[slot.index]
  if (!updated) return boundEntryMissing('改写')

  const entry = sourceEntry(updated)
  const bookmarks = [...slot.document.bookmarks]
  bookmarks[slot.index] = entry
  return preparedCandidate(slot.document, bookmarks, [entry], candidate.catalog.entries)
}

export function prepareDelete(
  currentJson: string,
  boundUrl: string,
): CandidatePreparation {
  const slot = loadBoundSlot(currentJson, boundUrl, '删除')
  if (!slot.ok) return slot

  const bookmarks = slot.document.bookmarks.filter((_, i) => i !== slot.index)
  const candidate = parseCandidate(slot.document, bookmarks)
  if (!candidate.ok) return candidate

  return preparedCandidate(
    slot.document,
    bookmarks,
    [sourceEntry(slot.bound)],
    candidate.catalog.entries,
  )
}
