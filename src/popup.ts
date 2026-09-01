import { createExtensionStore } from './chrome-store.ts'
import {
  isConfigurationComplete,
  parseDefaultTags,
} from './configuration.ts'
import { element } from './dom.ts'
import { readCurrentPage } from './page.ts'

const gate = element('gate', HTMLElement)
const goOptions = element('go-options', HTMLButtonElement)
const capture = element('capture', HTMLFormElement)
const tagsEl = element('tags', HTMLUListElement)
const faviconSlot = element('favicon-slot', HTMLElement)
const titleInput = element('title', HTMLInputElement)
const descToggle = element('desc-toggle', HTMLButtonElement)
const descriptionInput = element('description', HTMLTextAreaElement)
const urlInput = element('url', HTMLInputElement)

goOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

capture.addEventListener('submit', (event) => {
  event.preventDefault()
})

void boot()

async function boot(): Promise<void> {
  try {
    const config = await createExtensionStore().load()
    if (!isConfigurationComplete(config)) {
      gate.hidden = false
      return
    }

    capture.hidden = false
    renderTags(parseDefaultTags(config.defaultTags))

    const page = await readCurrentPage({
      tabs: chrome.tabs,
      scripting: chrome.scripting,
    })
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
  } catch {
    gate.hidden = false
  }
}

function renderTags(tags: string[]): void {
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
  descToggle.textContent = initial || '添加描述'
  descToggle.addEventListener('click', () => {
    descToggle.hidden = true
    descriptionInput.hidden = false
    descriptionInput.focus()
  })
}
