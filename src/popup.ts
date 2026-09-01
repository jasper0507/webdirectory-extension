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

const gate = element('gate', HTMLElement)
const goOptions = element('go-options', HTMLButtonElement)
const capture = element('capture', HTMLFormElement)
const tagsEl = element('tags', HTMLUListElement)
const faviconSlot = element('favicon-slot', HTMLElement)
const titleInput = element('title', HTMLInputElement)
const descLine = element('desc-line', HTMLButtonElement)
const descriptionInput = element('description', HTMLTextAreaElement)
const urlInput = element('url', HTMLInputElement)
const saveButton = element('save', HTMLButtonElement)
const statusEl = element('status', HTMLElement)

const gateway = createGithubContentsGateway(fetch)

let portalRepo: PortalRepo | null = null
let selectedTags: string[] = []
let catalogReady = false
let busy = false

goOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

capture.addEventListener('submit', (event) => {
  event.preventDefault()
  void onSave()
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
  renderTags(parseDefaultTags(config.defaultTags))

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
    catalogReady = true
    syncSave()
  } catch {
    setStatus('无法读取当前页或门户源', 'error')
  }
}

async function onSave(): Promise<void> {
  if (!portalRepo || !catalogReady || busy) return
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
        tags: selectedTags,
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
  saveButton.disabled = !catalogReady || busy
}

function setStatus(text: string, state: 'ok' | 'error' | 'pending'): void {
  statusEl.textContent = text
  statusEl.dataset.state = state
}

function renderTags(tags: string[]): void {
  selectedTags = [...tags]
  tagsEl.replaceChildren()
  for (const tag of tags) {
    const item = document.createElement('li')
    item.className = 'tag'
    item.textContent = tag
    tagsEl.append(item)
  }
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
