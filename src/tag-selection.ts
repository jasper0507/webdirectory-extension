import { normalizeTag, type TagSummary } from './catalog.ts'

export type TagSelection = {
  selected: string[]
  catalog: TagSummary[]
  prefill: boolean
}

export function createTagSelection(input: {
  selected: readonly string[]
  catalog: readonly TagSummary[]
  prefill?: boolean
}): TagSelection {
  return {
    selected: uniqueNames(input.selected),
    catalog: [...input.catalog],
    prefill: Boolean(input.prefill),
  }
}

export function withCatalog(
  selection: TagSelection,
  catalog: readonly TagSummary[],
): TagSelection {
  return {
    ...selection,
    catalog: [...catalog],
  }
}

export function availableTags(selection: TagSelection): TagSummary[] {
  const selected = new Set(selection.selected)
  return [...selection.catalog]
    .filter((tag) => !selected.has(tag.name))
    .sort((a, b) => b.count - a.count)
}

export function removeTag(selection: TagSelection, name: string): TagSelection {
  const next = consumePrefill(selection)
  return {
    ...next,
    selected: next.selected.filter((tag) => tag !== name),
  }
}

export function revealChoices(selection: TagSelection): TagSelection {
  return consumePrefill(selection)
}

export function addTag(selection: TagSelection, rawName: string): TagSelection {
  const name = normalizeTag(rawName)
  if (!name) return selection
  const next = consumePrefill(selection)
  if (next.selected.includes(name)) return next
  return {
    ...next,
    selected: [...next.selected, name],
  }
}

function uniqueNames(raw: readonly string[]): string[] {
  const selected: string[] = []
  const seen = new Set<string>()
  for (const value of raw) {
    const name = normalizeTag(value)
    if (!name || seen.has(name)) continue
    seen.add(name)
    selected.push(name)
  }
  return selected
}

function consumePrefill(selection: TagSelection): TagSelection {
  if (!selection.prefill) return selection
  return {
    ...selection,
    selected: [],
    prefill: false,
  }
}
