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

function boundEntryMissing(): CandidatePreparation {
  return {
    ok: false,
    issues: [
      {
        path: '/bookmarks',
        code: 'missing-field',
        message: '找不到要改写的书签。',
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
  const loaded = loadDocument(currentJson)
  if (!loaded.ok) return loaded

  const bound = findBoundEntry(loaded.catalog, boundUrl)
  if (!bound) return boundEntryMissing()

  const index = loaded.catalog.entries.indexOf(bound)
  const candidateBookmarks = [...loaded.document.bookmarks]
  candidateBookmarks[index] = draft
  const candidate = parseCandidate(loaded.document, candidateBookmarks)
  if (!candidate.ok) return candidate

  const updated = candidate.catalog.entries[index]
  if (!updated) return boundEntryMissing()

  const entry = sourceEntry(updated)
  const bookmarks = [...loaded.document.bookmarks]
  bookmarks[index] = entry
  return preparedCandidate(loaded.document, bookmarks, [entry], candidate.catalog.entries)
}
