export type BookmarkEntry = {
  title: string
  url: string
  displayUrl: string
  tags: string[]
  description?: string
}

export type TagSummary = {
  name: string
  count: number
}

export type SiteIdentity = {
  wordmark: string
  monument: [string, string]
  eyebrow: string
  stampEn: string
  convergence: string
  whisper: [string, string]
  placeholder: string
  colophonLeft: string
  colophonRight: string
}

export type Catalog = {
  identity: SiteIdentity
  entries: BookmarkEntry[]
  tags: TagSummary[]
}

export type ParseResult =
  | { ok: true; catalog: Catalog }
  | { ok: false; issues: PortalSourceIssue[] }

export type PortalSourceIssue = {
  path: string
  code:
    | 'invalid-json'
    | 'invalid-type'
    | 'missing-field'
    | 'unknown-field'
    | 'invalid-value'
    | 'duplicate-title'
    | 'duplicate-url'
  message: string
}

const TITLE_COMPARISON = 'NFC'
const HAN_CHARACTER = /^\p{Script=Han}$/u
const ROOT_FIELDS = new Set(['identity', 'bookmarks'])
const IDENTITY_FIELDS = new Set([
  'wordmark',
  'monument',
  'eyebrow',
  'stampEn',
  'convergence',
  'whisper',
  'placeholder',
  'colophonLeft',
  'colophonRight',
])
const BOOKMARK_FIELDS = new Set(['title', 'url', 'tags', 'description'])

function normalizeTitle(title: string): string {
  return title.trim().normalize(TITLE_COMPARISON)
}

export function normalizeTag(value: string): string | undefined {
  const normalized = value.trim().normalize(TITLE_COMPARISON)
  return normalized === '' ? undefined : normalized
}

function standardizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '')
      if (parsed.pathname === '') parsed.pathname = '/'
    }
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return null
  }
}

function displayUrl(url: string): string {
  const parsed = new URL(url)
  const host = parsed.hostname
  const path = parsed.pathname === '/' ? '' : parsed.pathname
  return `${host}${path}${parsed.search}`
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pointer(path: string, part: string): string {
  return `${path}/${part.replace(/~/g, '~0').replace(/\//g, '~1')}`
}

function addIssue(
  issues: PortalSourceIssue[],
  path: string,
  code: PortalSourceIssue['code'],
  message: string,
): void {
  issues.push({ path, code, message })
}

function rejectUnknownFields(
  record: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  issues: PortalSourceIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      addIssue(issues, pointer(path, key), 'unknown-field', '字段未定义。')
    }
  }
}

function readRequiredText(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: PortalSourceIssue[],
  normalize: (value: string) => string = (value) => value.trim(),
): string | null {
  const fieldPath = pointer(path, key)
  if (!Object.hasOwn(record, key)) {
    addIssue(issues, fieldPath, 'missing-field', '缺少必填字段。')
    return null
  }
  const value = record[key]
  if (typeof value !== 'string') {
    addIssue(issues, fieldPath, 'invalid-type', '必须是字符串。')
    return null
  }
  const normalized = normalize(value)
  if (!normalized) {
    addIssue(issues, fieldPath, 'invalid-value', '不能为空。')
    return null
  }
  return normalized
}

function readTags(
  record: Record<string, unknown>,
  path: string,
  issues: PortalSourceIssue[],
): string[] | null {
  const tagsPath = pointer(path, 'tags')
  if (!Object.hasOwn(record, 'tags')) {
    addIssue(issues, tagsPath, 'missing-field', '缺少必填字段。')
    return null
  }
  if (!Array.isArray(record.tags)) {
    addIssue(issues, tagsPath, 'invalid-type', '必须是字符串数组。')
    return null
  }

  const tags: string[] = []
  const seen = new Set<string>()
  for (const [index, value] of record.tags.entries()) {
    const tagPath = pointer(tagsPath, String(index))
    if (typeof value !== 'string') {
      addIssue(issues, tagPath, 'invalid-type', '必须是字符串。')
      continue
    }
    const tag = normalizeTag(value)
    if (!tag) {
      addIssue(issues, tagPath, 'invalid-value', '标签不能为空。')
      continue
    }
    if (seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }

  if (tags.length === 0) {
    addIssue(issues, tagsPath, 'invalid-value', '必须至少包含一个有效标签。')
    return null
  }
  return tags
}

function parseEntry(
  value: unknown,
  index: number,
  issues: PortalSourceIssue[],
): BookmarkEntry | null {
  const path = `/bookmarks/${String(index)}`
  const record = asObjectRecord(value)
  if (!record) {
    addIssue(issues, path, 'invalid-type', '必须是对象。')
    return null
  }
  rejectUnknownFields(record, BOOKMARK_FIELDS, path, issues)

  const title = readRequiredText(record, 'title', path, issues, normalizeTitle)
  const rawUrl = readRequiredText(record, 'url', path, issues)
  const url = rawUrl ? standardizeUrl(rawUrl) : null
  if (rawUrl && !url) {
    addIssue(issues, pointer(path, 'url'), 'invalid-value', '必须是 http(s) 地址。')
  }
  const tags = readTags(record, path, issues)

  let description: string | undefined
  if (Object.hasOwn(record, 'description')) {
    if (typeof record.description !== 'string') {
      addIssue(issues, pointer(path, 'description'), 'invalid-type', '必须是字符串。')
    } else {
      description = record.description.trim() || undefined
    }
  }

  if (!title || !url || !tags) return null
  return {
    title,
    url,
    displayUrl: displayUrl(url),
    tags,
    ...(description ? { description } : {}),
  }
}

function summarizeTags(entries: BookmarkEntry[]): TagSummary[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    for (const tag of new Set(entry.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts].map(([name, count]) => ({ name, count }))
}

export function summarizeEntryTags(entries: BookmarkEntry[]): TagSummary[] {
  return summarizeTags(entries).sort((a, b) => b.count - a.count)
}

export function findBoundEntry(catalog: Catalog, url: string): BookmarkEntry | undefined {
  const standardized = standardizeUrl(url)
  if (!standardized) return undefined
  return catalog.entries.find((entry) => entry.url === standardized)
}

function readPair(
  record: Record<string, unknown>,
  key: 'monument' | 'whisper',
  path: string,
  issues: PortalSourceIssue[],
): [string, string] | null {
  const fieldPath = pointer(path, key)
  if (!Object.hasOwn(record, key)) {
    addIssue(issues, fieldPath, 'missing-field', '缺少必填字段。')
    return null
  }
  const value = record[key]
  if (!Array.isArray(value) || value.length !== 2) {
    addIssue(issues, fieldPath, 'invalid-value', '必须是恰好包含两项的数组。')
    return null
  }

  const pair: string[] = []
  for (const [index, item] of value.entries()) {
    const itemPath = pointer(fieldPath, String(index))
    if (typeof item !== 'string') {
      addIssue(issues, itemPath, 'invalid-type', '必须是字符串。')
      continue
    }
    const normalized = item.trim()
    if (!normalized) {
      addIssue(issues, itemPath, 'invalid-value', '不能为空。')
      continue
    }
    if (key === 'monument' && !HAN_CHARACTER.test(normalized)) {
      addIssue(issues, itemPath, 'invalid-value', '必须是单个汉字。')
      continue
    }
    pair.push(normalized)
  }
  return pair.length === 2 ? [pair[0]!, pair[1]!] : null
}

function parseIdentity(raw: unknown, issues: PortalSourceIssue[]): SiteIdentity | null {
  const path = '/identity'
  const record = asObjectRecord(raw)
  if (!record) {
    addIssue(
      issues,
      path,
      raw === undefined ? 'missing-field' : 'invalid-type',
      raw === undefined ? '缺少必填字段。' : '必须是对象。',
    )
    return null
  }
  rejectUnknownFields(record, IDENTITY_FIELDS, path, issues)

  const wordmark = readRequiredText(record, 'wordmark', path, issues, normalizeTitle)
  const monument = readPair(record, 'monument', path, issues)
  const eyebrow = readRequiredText(record, 'eyebrow', path, issues)
  const stampEn = readRequiredText(record, 'stampEn', path, issues)
  const convergence = readRequiredText(record, 'convergence', path, issues)
  const whisper = readPair(record, 'whisper', path, issues)
  const placeholder = readRequiredText(record, 'placeholder', path, issues)
  const colophonLeft = readRequiredText(record, 'colophonLeft', path, issues)
  const colophonRight = readRequiredText(record, 'colophonRight', path, issues)

  if (
    !wordmark ||
    !monument ||
    !eyebrow ||
    !stampEn ||
    !convergence ||
    !whisper ||
    !placeholder ||
    !colophonLeft ||
    !colophonRight
  ) {
    return null
  }
  return {
    wordmark,
    monument,
    eyebrow,
    stampEn,
    convergence,
    whisper,
    placeholder,
    colophonLeft,
    colophonRight,
  }
}

function parseBookmarks(raw: unknown, issues: PortalSourceIssue[]): BookmarkEntry[] | null {
  const path = '/bookmarks'
  if (!Array.isArray(raw)) {
    addIssue(
      issues,
      path,
      raw === undefined ? 'missing-field' : 'invalid-type',
      raw === undefined ? '缺少必填字段。' : '必须是数组。',
    )
    return null
  }

  const entries: BookmarkEntry[] = []
  const titleIndexes = new Map<string, number>()
  const urlIndexes = new Map<string, number>()

  for (const [index, item] of raw.entries()) {
    const entry = parseEntry(item, index, issues)
    if (!entry) continue
    const titleIndex = titleIndexes.get(entry.title)
    if (titleIndex !== undefined) {
      addIssue(
        issues,
        `/bookmarks/${String(index)}/title`,
        'duplicate-title',
        `与 /bookmarks/${String(titleIndex)}/title 重复。`,
      )
    } else {
      titleIndexes.set(entry.title, index)
    }
    const urlIndex = urlIndexes.get(entry.url)
    if (urlIndex !== undefined) {
      addIssue(
        issues,
        `/bookmarks/${String(index)}/url`,
        'duplicate-url',
        `与 /bookmarks/${String(urlIndex)}/url 重复。`,
      )
    } else {
      urlIndexes.set(entry.url, index)
    }
    entries.push(entry)
  }
  return entries
}

export function parsePortalSource(jsonText: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(jsonText) as unknown
  } catch {
    return {
      ok: false,
      issues: [{ path: '', code: 'invalid-json', message: '不是合法 JSON。' }],
    }
  }

  const record = asObjectRecord(raw)
  if (!record) {
    return {
      ok: false,
      issues: [{ path: '', code: 'invalid-type', message: '必须是包含 identity 与 bookmarks 的对象。' }],
    }
  }

  const issues: PortalSourceIssue[] = []
  rejectUnknownFields(record, ROOT_FIELDS, '', issues)
  const identity = parseIdentity(record.identity, issues)
  const entries = parseBookmarks(record.bookmarks, issues)
  if (!identity || !entries || issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    catalog: {
      identity,
      entries,
      tags: summarizeEntryTags(entries),
    },
  }
}
