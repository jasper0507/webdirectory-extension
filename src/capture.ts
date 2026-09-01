import {
  findBoundEntry,
  parsePortalSource,
  summarizeEntryTags,
  type BookmarkEntry,
  type PortalSourceIssue,
  type TagSummary,
} from './catalog.ts'

export type BookmarkDraft = Pick<BookmarkEntry, 'title' | 'url' | 'tags' | 'description'>

export type CapturePreparation =
  | { ok: false; issues: PortalSourceIssue[] }
  | {
      ok: true
      jsonText: string
      entries: BookmarkDraft[]
      tags: TagSummary[]
    }

function sourceEntry(entry: BookmarkEntry): BookmarkDraft {
  return {
    title: entry.title,
    url: entry.url,
    tags: entry.tags,
    ...(entry.description ? { description: entry.description } : {}),
  }
}

function boundEntryMissing(): CapturePreparation {
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

export function prepareCapture(
  currentJson: string,
  drafts: BookmarkDraft[],
): CapturePreparation {
  const current = parsePortalSource(currentJson)
  if (!current.ok) return current

  const source = JSON.parse(currentJson) as { identity: unknown; bookmarks: unknown[] }
  const candidate = parsePortalSource(
    JSON.stringify({ ...source, bookmarks: [...source.bookmarks, ...drafts] }),
  )
  if (!candidate.ok) return candidate

  const entries = candidate.catalog.entries.slice(source.bookmarks.length).map(sourceEntry)
  return {
    ok: true,
    jsonText: `${JSON.stringify(
      { ...source, bookmarks: [...source.bookmarks, ...entries] },
      null,
      2,
    )}\n`,
    entries,
    tags: summarizeEntryTags(candidate.catalog.entries),
  }
}

export function prepareUpdate(
  currentJson: string,
  boundUrl: string,
  draft: BookmarkDraft,
): CapturePreparation {
  const current = parsePortalSource(currentJson)
  if (!current.ok) return current

  const bound = findBoundEntry(current.catalog, boundUrl)
  if (!bound) return boundEntryMissing()

  const index = current.catalog.entries.indexOf(bound)
  const source = JSON.parse(currentJson) as { identity: unknown; bookmarks: unknown[] }
  const candidateBookmarks = [...source.bookmarks]
  candidateBookmarks[index] = draft
  const candidate = parsePortalSource(
    JSON.stringify({ ...source, bookmarks: candidateBookmarks }),
  )
  if (!candidate.ok) return candidate

  const updated = candidate.catalog.entries[index]
  if (!updated) return boundEntryMissing()

  const entry = sourceEntry(updated)
  const bookmarks = [...source.bookmarks]
  bookmarks[index] = entry
  return {
    ok: true,
    jsonText: `${JSON.stringify({ ...source, bookmarks }, null, 2)}\n`,
    entries: [entry],
    tags: summarizeEntryTags(candidate.catalog.entries),
  }
}
