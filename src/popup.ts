import { findBoundEntry, normalizeTag, type Catalog } from './catalog.ts'
import { createExtensionStore } from './chrome-store.ts'
import {
  commitPortalSource,
  readPortalSource,
  type CommitResult,
  type PortalFailureKind,
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
const gateMessage = element('gate-message', HTMLElement)
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
const tagCreateError = element('tag-create-error', HTMLElement)
const tagCreateConfirm = element('tag-create-confirm', HTMLButtonElement)
const tagError = element('tag-error', HTMLElement)
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
const statusMessage = element('status-message', HTMLElement)
const statusAction = element('status-action', HTMLButtonElement)

const gateway = createGithubContentsGateway(fetch)

let portalRepo: PortalRepo | null = null
let tagSelection: TagSelection = createTagSelection({ selected: [], catalog: [] })
let catalogReady = false
let busy = false
let boundUrl: string | null = null
let openingUrl = ''
let deleted = false
let recover: (() => void) | null = null
let gateAction = openOptions

function openOptions(): void {
  chrome.runtime.openOptionsPage()
}

goOptions.addEventListener('click', () => {
  gateAction()
})

statusAction.addEventListener('click', () => {
  recover?.()
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

tagCreateName.addEventListener('input', () => {
  clearFieldError(tagCreateName, tagCreateError)
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
    gateMessage.textContent = '无法读取配置，请重试。'
    goOptions.textContent = '重试'
    gateAction = () => location.reload()
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
  setCaptureBusy(true)
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
    openingUrl = page.url
    titleInput.value = page.title
    urlInput.value = page.url
    if (page.favIconUrl) {
      const icon = document.createElement('img')
      icon.alt = ''
      icon.src = page.favIconUrl
      faviconSlot.hidden = false
      icon.addEventListener('error', () => {
        icon.remove()
        faviconSlot.hidden = true
      })
      faviconSlot.append(icon)
    }
    if (!loaded.ok) {
      bindDescription(page.description)
      showReadError(loaded.error, loaded.kind)
      return
    }
    bindCatalog(loaded.catalog, page.description)
    setStatus('门户源已读取', 'ok')
  } catch {
    showReadError('无法读取当前页或门户源', 'retry')
  } finally {
    setCaptureBusy(false)
  }
}

async function retryRead(): Promise<void> {
  if (!portalRepo || busy) return
  busy = true
  setCaptureBusy(true)
  syncActions()
  setStatus('正在重新读取门户源…', 'pending')
  try {
    const loaded = await readPortalSource(gateway, portalRepo)
    if (!loaded.ok) {
      showReadError(loaded.error, loaded.kind)
      return
    }
    bindCatalog(loaded.catalog)
    setStatus('门户源已读取', 'ok')
  } catch {
    showReadError('无法读取门户源', 'retry')
  } finally {
    busy = false
    setCaptureBusy(false)
    syncActions()
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
      setStatus(
        updating ? '已改写到门户源' : restoring ? '已恢复到门户源' : '已收录到门户源',
        'success',
      )
    },
  )
}

async function onDelete(): Promise<void> {
  if (boundUrl === null) return
  await writePortal({ kind: 'delete', boundUrl }, () => {
    unbindSlot()
    setStatus('已从门户源删除，可恢复', 'success')
  })
}

async function writePortal(
  intent: PortalSourceIntent,
  onOk: (result: Extract<CommitResult, { ok: true }>) => void,
): Promise<void> {
  if (!portalRepo || !catalogReady || busy) return
  const repo = portalRepo
  busy = true
  setCaptureBusy(true)
  syncActions()
  setStatus(
    intent.kind === 'delete' ? '正在删除…' : deleted ? '正在恢复…' : '正在写入门户源…',
    'pending',
  )
  try {
    const result = await commitPortalSource(gateway, repo, intent)
    if (result.ok) onOk(result)
    else {
      showWriteError(
        result.error,
        result.kind,
        intent.kind === 'delete' ? onDelete : onSave,
      )
    }
  } catch {
    showWriteError('写入失败', 'retry', intent.kind === 'delete' ? onDelete : onSave)
  } finally {
    busy = false
    setCaptureBusy(false)
    syncActions()
  }
}

function setCaptureBusy(value: boolean): void {
  captureGrid.setAttribute('aria-busy', String(value))
  captureGrid.inert = value
}

function syncActions(): void {
  saveButton.disabled = !catalogReady || busy || tagSelection.selected.length === 0
  deleteButton.disabled = !catalogReady || busy
}

function setStatus(
  text: string,
  state: 'ok' | 'error' | 'pending' | 'success',
  action?: { label: '去选项' | '重试'; run: () => void },
): void {
  statusMessage.textContent = text
  statusEl.dataset.state = state
  recover = action?.run ?? null
  statusAction.textContent = action?.label ?? ''
  statusAction.hidden = action == null
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

function showReadError(error: string, kind: PortalFailureKind): void {
  if (kind === 'source') {
    setStatus(`错误：${error}，请先修复 public/portal.json`, 'error')
    return
  }
  setStatus(
    `错误：${error}`,
    'error',
    kind === 'settings'
      ? { label: '去选项', run: openOptions }
      : { label: '重试', run: () => void retryRead() },
  )
}

function showWriteError(
  error: string,
  kind: PortalFailureKind,
  retry: () => Promise<void>,
): void {
  if (kind === 'title') {
    setFieldError(titleInput, titleError, `错误：${error}，请修改标题`)
    setStatus('未写入，请修改标题', 'error')
    titleInput.focus()
    return
  }
  if (kind === 'url') {
    setFieldError(urlInput, urlError, `错误：${error}，请修改 URL`)
    setStatus('未写入，请修改 URL', 'error')
    urlInput.focus()
    return
  }
  if (kind === 'tags') {
    tagError.textContent = `错误：${error}`
    tagError.hidden = false
    setStatus('未写入，请添加标签', 'error')
    tagAdd.focus()
    return
  }
  if (kind === 'source') {
    setStatus(`错误：${error}，请先修复 public/portal.json`, 'error')
    return
  }
  setStatus(
    `错误：${error}`,
    'error',
    kind === 'settings'
      ? { label: '去选项', run: openOptions }
      : { label: '重试', run: () => void retry() },
  )
}

function commitTagSelection(next: TagSelection): void {
  tagSelection = next
  if (next.selected.length > 0) {
    tagError.textContent = ''
    tagError.hidden = true
  }
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
    const removeMark = document.createElement('span')
    removeMark.className = 'tag-remove'
    removeMark.setAttribute('aria-hidden', 'true')
    button.append(name, removeMark)
    button.setAttribute('aria-label', `去掉 ${name}`)
    button.addEventListener('click', () => {
      const next = removeTag(tagSelection, name)
      commitTagSelection(next)
      if (next.selected.length === 0) {
        tagError.textContent = '错误：至少保留一个标签'
        tagError.hidden = false
        tagAdd.focus()
      }
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
  if (!normalizeTag(tagCreateName.value)) {
    setFieldError(tagCreateName, tagCreateError, '错误：请输入标签名字')
    tagCreateName.focus()
    return
  }
  clearFieldError(tagCreateName, tagCreateError)
  commitTagSelection(addTag(tagSelection, tagCreateName.value))
  closeTagMenu(true)
}

function closeTagMenu(restoreFocus = false): void {
  setTagMenu('closed')
  if (restoreFocus) tagAdd.focus()
}

function bindSlot(url: string): void {
  boundUrl = url
  tagSelection = { ...tagSelection, prefill: false }
  deleted = false
  modeEl.textContent = '改写'
  deleteButton.hidden = false
  saveButton.textContent = '保存'
}

function bindCatalog(catalog: Catalog, initialDescription?: string): void {
  const bound = findBoundEntry(catalog, openingUrl)
  catalogReady = true
  if (bound) {
    bindSlot(bound.url)
    titleInput.value = bound.title
    urlInput.value = bound.url
    bindDescription(bound.description ?? '')
    commitTagSelection(createTagSelection({ selected: bound.tags, catalog: catalog.tags }))
    return
  }
  if (initialDescription !== undefined) bindDescription(initialDescription)
  commitTagSelection(withCatalog(tagSelection, catalog.tags))
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
