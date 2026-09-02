import { findBoundEntry, normalizeTag } from './catalog.ts'
import { createExtensionStore } from './chrome-store.ts'
import {
  commitPortalSource,
  readPortalSource,
  type CommitResult,
  type PortalRepo,
  type PortalSourceIntent,
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
const captureGrid = element('capture-grid', HTMLElement)
const modeEl = element('mode', HTMLElement)
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
const titleError = element('title-error', HTMLElement)
const descLine = element('desc-line', HTMLButtonElement)
const descriptionInput = element('description', HTMLTextAreaElement)
const urlInput = element('url', HTMLInputElement)
const urlError = element('url-error', HTMLElement)
const deleteButton = element('delete', HTMLButtonElement)
const saveButton = element('save', HTMLButtonElement)
const statusEl = element('status', HTMLElement)

const gateway = createGithubContentsGateway(fetch)

let portalRepo: PortalRepo | null = null
let tagSelection: TagSelection = createTagSelection({ selected: [], catalog: [] })
let catalogReady = false
let busy = false
let boundUrl: string | null = null
let deleted = false

goOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

capture.addEventListener('submit', (event) => {
  event.preventDefault()
  if (!validateDraft()) return
  void onSave()
})

titleInput.addEventListener('input', () => {
  titleInput.setCustomValidity('')
  clearFieldError(titleInput, titleError)
})

urlInput.addEventListener('input', () => {
  urlInput.setCustomValidity('')
  clearFieldError(urlInput, urlError)
})

titleInput.addEventListener('invalid', () => {
  setFieldError(titleInput, titleError, '错误：请输入标题')
})

urlInput.addEventListener('invalid', () => {
  setFieldError(urlInput, urlError, '错误：请输入 http(s) 地址')
})

deleteButton.addEventListener('click', () => {
  void onDelete()
})

descLine.addEventListener('click', () => {
  descLine.hidden = true
  descriptionInput.hidden = false
  descriptionInput.focus()
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
  if (event.key !== 'Escape' || tagMenu.hidden) return
  event.preventDefault()
  closeTagMenu(true)
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
  captureGrid.setAttribute('aria-busy', 'true')
  setStatus('正在读取当前页与门户源…', 'pending')
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
      bindDescription(page.description)
      setStatus(`错误：${loaded.error}，请检查设置或稍后重试`, 'error')
      return
    }
    const bound = findBoundEntry(loaded.catalog, urlInput.value)
    catalogReady = true
    if (bound) {
      bindSlot(bound.url)
      titleInput.value = bound.title
      urlInput.value = bound.url
      bindDescription(bound.description ?? '')
      commitTagSelection(
        createTagSelection({
          selected: bound.tags,
          catalog: loaded.catalog.tags,
        }),
      )
    } else {
      bindDescription(page.description)
      commitTagSelection(withCatalog(tagSelection, loaded.catalog.tags))
    }
    setStatus('门户源已读取', 'ok')
  } catch {
    setStatus('错误：无法读取当前页或门户源，请重新打开收录窗口重试', 'error')
  } finally {
    captureGrid.setAttribute('aria-busy', 'false')
  }
}

async function onSave(): Promise<void> {
  if (tagSelection.selected.length === 0) return
  const description = descriptionInput.value.trim()
  const draft = {
    title: titleInput.value,
    url: urlInput.value,
    tags: tagSelection.selected,
    ...(description ? { description } : {}),
  }
  const updating = boundUrl !== null
  const restoring = deleted
  await writePortal(
    boundUrl
      ? { kind: 'update', boundUrl, draft }
      : { kind: 'capture', draft },
    (result) => {
      bindSlot(result.url)
      setStatus(updating ? '已改写' : restoring ? '已恢复' : '已收录', 'ok')
    },
  )
}

async function onDelete(): Promise<void> {
  if (boundUrl === null) return
  await writePortal({ kind: 'delete', boundUrl }, () => {
    unbindSlot()
    setStatus('已删除，可恢复', 'ok')
  })
}

async function writePortal(
  intent: PortalSourceIntent,
  onOk: (result: Extract<CommitResult, { ok: true }>) => void,
): Promise<void> {
  if (!portalRepo || !catalogReady || busy) return
  const repo = portalRepo
  busy = true
  captureGrid.setAttribute('aria-busy', 'true')
  syncActions()
  setStatus(
    intent.kind === 'delete' ? '正在删除…' : deleted ? '正在恢复…' : '正在写入门户源…',
    'pending',
  )
  try {
    const result = await commitPortalSource(gateway, repo, intent)
    if (result.ok) onOk(result)
    else showWriteError(result.error)
  } catch {
    showWriteError('写入失败')
  } finally {
    busy = false
    captureGrid.setAttribute('aria-busy', 'false')
    syncActions()
  }
}

function syncActions(): void {
  saveButton.disabled = !catalogReady || busy || tagSelection.selected.length === 0
  deleteButton.disabled = !catalogReady || busy
}

function setStatus(text: string, state: 'ok' | 'error' | 'pending'): void {
  statusEl.textContent = text
  statusEl.dataset.state = state
}

function validateDraft(): boolean {
  titleInput.setCustomValidity(titleInput.value.trim() ? '' : '请输入标题')
  let validUrl = false
  try {
    const url = new URL(urlInput.value)
    validUrl = url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    // Native validation displays the recovery text below.
  }
  urlInput.setCustomValidity(validUrl ? '' : '请输入 http(s) 地址')
  return capture.reportValidity()
}

function setFieldError(
  input: HTMLInputElement,
  messageEl: HTMLElement,
  message: string,
): void {
  input.setAttribute('aria-invalid', 'true')
  messageEl.textContent = message
  messageEl.hidden = false
}

function clearFieldError(input: HTMLInputElement, messageEl: HTMLElement): void {
  input.removeAttribute('aria-invalid')
  messageEl.textContent = ''
  messageEl.hidden = true
}

function showWriteError(error: string): void {
  if (error.startsWith('标题')) {
    setFieldError(titleInput, titleError, `错误：${error}，请修改标题`)
    setStatus('未写入，请修改标题', 'error')
    titleInput.focus()
    return
  }
  if (error.startsWith('地址') || error.startsWith('必须是 http')) {
    setFieldError(urlInput, urlError, `错误：${error}，请修改 URL`)
    setStatus('未写入，请修改 URL', 'error')
    urlInput.focus()
    return
  }
  if (error.includes('门户源无效')) {
    setStatus(`错误：${error}，请先修复 public/portal.json`, 'error')
    return
  }
  const recovery =
    error.includes('凭证') || error.includes('找不到')
      ? '请去选项检查设置'
      : '请稍后重试'
  setStatus(`错误：${error}，${recovery}`, 'error')
}

function commitTagSelection(next: TagSelection): void {
  tagSelection = next
  renderSelectedTags()
  if (!tagMenu.hidden && tagCreate.hidden) renderTagChoices()
  syncActions()
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
    button.textContent = tag.name
    button.addEventListener('click', () => {
      commitTagSelection(addTag(tagSelection, tag.name))
      closeTagMenu(true)
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
  const firstChoice = tagChoices.querySelector('button') ?? tagCreateOpen
  firstChoice.focus()
}

function showTagCreate(): void {
  setTagMenu('create')
  commitTagSelection(revealChoices(tagSelection))
  tagCreateName.focus()
}

function confirmNewTag(): void {
  if (!normalizeTag(tagCreateName.value)) return
  commitTagSelection(addTag(tagSelection, tagCreateName.value))
  closeTagMenu(true)
}

function closeTagMenu(restoreFocus = false): void {
  setTagMenu('closed')
  if (restoreFocus) tagAdd.focus()
}

function bindSlot(url: string): void {
  boundUrl = url
  deleted = false
  modeEl.textContent = '改写'
  deleteButton.hidden = false
  saveButton.textContent = '保存'
}

function unbindSlot(): void {
  boundUrl = null
  deleted = true
  modeEl.textContent = '收录'
  deleteButton.hidden = true
  saveButton.textContent = '恢复'
}

function bindDescription(initial: string): void {
  descriptionInput.value = initial
  descLine.textContent = initial || '添加描述'
}
