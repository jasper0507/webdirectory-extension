import {
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
