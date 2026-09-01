import { findBoundEntry, normalizeTag } from './catalog.ts'
import { createExtensionStore } from './chrome-store.ts'
import {
  commitPortalSource,
  readPortalSource,
  type PortalRepo,
} from './commit-portal-source.ts'
import {
  isConfigurationComplete,
  parseDefaultTags,
  type Configuration,
} from './configuration.ts'
import { element } from './dom.ts'
import { createGithubContentsGateway } from './github-contents.ts'
import { readCurrentPage } from './page.ts'
import {
  addTag,
  availableTags,
  createTagSelection,
  removeTag,
  revealChoices,
  withCatalog,
  type TagSelection,
} from './tag-selection.ts'

const gate = element('gate', HTMLElement)
const goOptions = element('go-options', HTMLButtonElement)
const capture = element('capture', HTMLFormElement)
const tagColumn = element('tag-column', HTMLElement)
const tagsEl = element('tags', HTMLUListElement)
const tagAdd = element('tag-add', HTMLButtonElement)
const tagMenu = element('tag-menu', HTMLElement)
const tagChoices = element('tag-choices', HTMLUListElement)
const tagCreateOpen = element('tag-create-open', HTMLButtonElement)
const tagCreate = element('tag-create', HTMLElement)
const tagCreateName = element('tag-create-name', HTMLInputElement)
const tagCreateConfirm = element('tag-create-confirm', HTMLButtonElement)
const faviconSlot = element('favicon-slot', HTMLElement)
const titleInput = element('title', HTMLInputElement)
const descLine = element('desc-line', HTMLButtonElement)
const descriptionInput = element('description', HTMLTextAreaElement)
const urlInput = element('url', HTMLInputElement)
const saveButton = element('save', HTMLButtonElement)
const statusEl = element('status', HTMLElement)

const gateway = createGithubContentsGateway(fetch)

let portalRepo: PortalRepo | null = null
let tagSelection: TagSelection = createTagSelection({ selected: [], catalog: [] })
let catalogReady = false
let busy = false

goOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

capture.addEventListener('submit', (event) => {
  event.preventDefault()
  void onSave()
})

tagAdd.addEventListener('click', () => {
  if (tagMenu.hidden) openTagMenu()
  else closeTagMenu()
})

tagCreateOpen.addEventListener('click', () => {
  showTagCreate()
})

tagCreateConfirm.addEventListener('click', () => {
  confirmNewTag()
})

tagCreateName.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    confirmNewTag()
  }
})

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Node) || tagColumn.contains(event.target)) return
  closeTagMenu()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeTagMenu()
})

void boot()

async function boot(): Promise<void> {
  let config: Configuration
  try {
    config = await createExtensionStore().load()
  } catch {
    gate.hidden = false
    return
  }
  if (!isConfigurationComplete(config)) {
    gate.hidden = false
    return
  }

  portalRepo = {
    owner: config.owner,
    repo: config.repo,
    credential: config.credential,
  }
  capture.hidden = false
  commitTagSelection(
    createTagSelection({
      selected: parseDefaultTags(config.defaultTags),
      catalog: [],
      prefill: true,
    }),
  )

  try {
    const [page, loaded] = await Promise.all([
      readCurrentPage({
        tabs: chrome.tabs,
        scripting: chrome.scripting,
      }),
      readPortalSource(gateway, portalRepo),
    ])
    titleInput.value = page.title
    urlInput.value = page.url
    bindDescription(page.description)
    if (page.favIconUrl) {
      const icon = document.createElement('img')
      icon.alt = ''
      icon.src = page.favIconUrl
      icon.addEventListener('error', () => {
        icon.remove()
      })
      faviconSlot.append(icon)
    }
    if (!loaded.ok) {
      setStatus(loaded.error, 'error')
      return
    }
    const bound = findBoundEntry(loaded.catalog, urlInput.value)
    catalogReady = true
    commitTagSelection(
      bound
        ? createTagSelection({
            selected: bound.tags,
            catalog: loaded.catalog.tags,
          })
        : withCatalog(tagSelection, loaded.catalog.tags),
    )
  } catch {
    setStatus('无法读取当前页或门户源', 'error')
  }
}

async function onSave(): Promise<void> {
  if (!portalRepo || !catalogReady || busy || tagSelection.selected.length === 0) return
  busy = true
  syncSave()
  setStatus('', 'pending')
  const description = descriptionInput.value.trim()
  try {
    const result = await commitPortalSource(gateway, portalRepo, {
      kind: 'capture',
      draft: {
        title: titleInput.value,
        url: urlInput.value,
        tags: tagSelection.selected,
        ...(description ? { description } : {}),
      },
    })
    if (result.ok) {
      setStatus('已收录', 'ok')
    } else {
      setStatus(result.error, 'error')
    }
  } catch {
    setStatus('写入失败', 'error')
  }
  busy = false
  syncSave()
}

function syncSave(): void {
  saveButton.disabled = !catalogReady || busy || tagSelection.selected.length === 0
}

function setStatus(text: string, state: 'ok' | 'error' | 'pending'): void {
  statusEl.textContent = text
  statusEl.dataset.state = state
}

function commitTagSelection(next: TagSelection): void {
  tagSelection = next
  renderSelectedTags()
  if (!tagMenu.hidden && tagCreate.hidden) renderTagChoices()
  syncSave()
}

function renderSelectedTags(): void {
  tagsEl.replaceChildren()
  for (const name of tagSelection.selected) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'tag'
    button.textContent = name
    button.setAttribute('aria-label', `去掉 ${name}`)
    button.addEventListener('click', () => {
      commitTagSelection(removeTag(tagSelection, name))
    })
    item.append(button)
    tagsEl.append(item)
  }
}

function renderTagChoices(): void {
  tagChoices.replaceChildren()
  for (const tag of availableTags(tagSelection)) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'tag-choice'
    button.setAttribute('role', 'option')
    button.textContent = tag.name
    button.addEventListener('click', () => {
      commitTagSelection(addTag(tagSelection, tag.name))
      closeTagMenu()
    })
    item.append(button)
    tagChoices.append(item)
  }
}

function setTagMenu(mode: 'closed' | 'choices' | 'create'): void {
  tagMenu.hidden = mode === 'closed'
  tagChoices.hidden = mode !== 'choices'
  tagCreateOpen.hidden = mode !== 'choices'
  tagCreate.hidden = mode !== 'create'
  tagAdd.setAttribute('aria-expanded', mode === 'closed' ? 'false' : 'true')
  if (mode !== 'create') tagCreateName.value = ''
}

function openTagMenu(): void {
  setTagMenu('choices')
  commitTagSelection(revealChoices(tagSelection))
}

function showTagCreate(): void {
  setTagMenu('create')
  commitTagSelection(revealChoices(tagSelection))
  tagCreateName.focus()
}

function confirmNewTag(): void {
  if (!normalizeTag(tagCreateName.value)) return
  commitTagSelection(addTag(tagSelection, tagCreateName.value))
  closeTagMenu()
}

function closeTagMenu(): void {
  setTagMenu('closed')
}

function bindDescription(initial: string): void {
  descriptionInput.value = initial
  descLine.textContent = initial || '添加描述'
  descLine.addEventListener('click', () => {
    descLine.hidden = true
    descriptionInput.hidden = false
    descriptionInput.focus()
  })
}
